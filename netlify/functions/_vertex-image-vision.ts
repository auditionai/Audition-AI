import {
  getImageCharacterReferenceGroups,
  isProImageGenerationModel,
  type CharacterVisionAnalysis,
  type ImageGenerateRecipePayload,
  type ImageVisionAnalysis,
  type QueueVertexDiagnosticEntry,
  type SampleVisionAnalysis,
  type StyleVisionAnalysis,
} from '../../shared/queueRecipes';
import { runWithVertexCredentialFailover } from './_vertex-credentials';

const VERTEX_MODEL = 'gemini-3.1-pro-preview';

type VertexDiagnosticCallback = (entry: QueueVertexDiagnosticEntry) => Promise<void> | void;
type VisionAnalysisMode = 'default' | 'pro_structured';

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error?.message || data?.error || data?.detail || data?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const toInlineImagePart = async (source: string) => {
  if (!source) {
    throw new Error('Missing image source');
  }

  let mimeType = 'image/jpeg';
  let base64Data = source;

  if (source.startsWith('http')) {
    const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch vision image: ${await parseErrorMessage(response)}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type');
    mimeType = contentType || mimeType;
    base64Data = Buffer.from(arrayBuffer).toString('base64');
  } else if (source.startsWith('data:')) {
    const [header, body] = source.split(',', 2);
    base64Data = body || '';
    mimeType = header.match(/^data:(.*?);base64$/)?.[1] || mimeType;
  } else {
    base64Data = source.replace(/^data:[^;]+;base64,/, '');
  }

  return {
    inlineData: {
      data: base64Data,
      mimeType,
    },
  };
};

const extractJsonPayload = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Vision response was not valid JSON: ${text}`);
  }

  return candidate.slice(start, end + 1);
};

const emitDiagnostic = async (
  callback: VertexDiagnosticCallback | undefined,
  status: QueueVertexDiagnosticEntry['status'],
  message: string,
) => {
  if (!callback) return;
  await callback({
    at: new Date().toISOString(),
    task: 'image_reference_analysis',
    status,
    model: VERTEX_MODEL,
    message,
  });
};

const generateVisionJson = async <T>(
  taskName: string,
  parts: any[],
  outputSchemaPrompt: string,
  mode: VisionAnalysisMode,
  onDiagnostic?: VertexDiagnosticCallback,
): Promise<T> => {
  return runWithVertexCredentialFailover({
    taskName,
    operation: async ({ projectId, accessToken, credentialName }) => {
      const response = await fetch(
        `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/publishers/google/models/${VERTEX_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: outputSchemaPrompt }, ...parts] }],
            generationConfig: {
              temperature: 0.0,
              topP: 0.1,
              maxOutputTokens: mode === 'pro_structured' ? 420 : 900,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(180000),
        },
      );

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!text) {
        throw new Error('Vertex AI did not return a vision analysis result.');
      }

      await emitDiagnostic(onDiagnostic, 'success', `${taskName} succeeded via ${credentialName || projectId}.`);
      return JSON.parse(extractJsonPayload(text)) as T;
    },
  });
};

const buildCharacterVisionPrompt = (characterIndex: number) => [
  'Analyze the uploaded character reference images for one stylized 3D fashion-game avatar.',
  `This is character slot ${characterIndex}.`,
  'Return one compact JSON object in English only.',
  'Focus on persistent identity features, not pose.',
  'Identify the actual exposed skin tone of the avatar as accurately as possible from the references.',
  'Schema:',
  '{',
  '  "summary": "string",',
  '  "skinToneDescriptor": "string",',
  '  "skinToneHexApprox": "string",',
  '  "faceIdentityNotes": ["string"],',
  '  "makeupNotes": ["string"],',
  '  "faceAccessoryNotes": ["string"],',
  '  "hairNotes": ["string"],',
  '  "outfitNotes": ["string"]',
  '}',
].join('\n');

const buildProCharacterVisionPrompt = (characterIndex: number) => [
  'Analyze the uploaded character reference images for one stylized 3D fashion-game avatar.',
  `This is character slot ${characterIndex}.`,
  'Return one short JSON object in English only.',
  'Focus on persistent identity. Ignore pose and background.',
  'Schema:',
  '{',
  '  "skinToneHexApprox": "string",',
  '  "skinToneDescriptor": "string",',
  '  "proIdentityTags": ["string"],',
  '  "proFaceTags": ["string"],',
  '  "proAppearanceTags": ["string"]',
  '}',
].join('\n');

const buildSampleVisionPrompt = () => [
  'Analyze the uploaded sample image for composition only.',
  'Return one compact JSON object in English only.',
  'Focus on pose, camera, framing, placement, background, lighting, limb layout, support contact, and occlusion structure.',
  'Do not describe face identity or outfit identity as something to copy.',
  'Schema:',
  '{',
  '  "summary": "string",',
  '  "pose": "string",',
  '  "camera": "string",',
  '  "framing": "string",',
  '  "subjectPlacement": "string",',
  '  "background": "string",',
  '  "lighting": "string",',
  '  "limbLayout": "string",',
  '  "supportContact": "string",',
  '  "occlusionNotes": "string"',
  '}',
].join('\n');

const buildProSampleVisionPrompt = () => [
  'Analyze the uploaded sample image as a scene plate only.',
  'Return one short JSON object in English only.',
  'Focus on scene/background, pose, body orientation, support contact, and prop layout.',
  'Schema:',
  '{',
  '  "proSceneTags": ["string"],',
  '  "proPoseTags": ["string"],',
  '  "proContactTags": ["string"]',
  '}',
].join('\n');

const buildStyleVisionPrompt = () => [
  'Analyze the uploaded style image for render style only.',
  'Return one compact JSON object in English only.',
  'Focus on render language: materials, lighting behavior, color grading, finish, softness/sharpness balance.',
  'Do not describe identity, pose, outfit, or character count as something to copy.',
  'Schema:',
  '{',
  '  "summary": "string",',
  '  "renderStyle": "string",',
  '  "materialStyle": "string",',
  '  "lightingStyle": "string",',
  '  "colorGrading": "string",',
  '  "finish": "string"',
  '}',
].join('\n');

const buildProStyleVisionPrompt = () => [
  'Analyze the uploaded style image for render language only.',
  'Return one short JSON object in English only.',
  'Focus on style, materials, lighting, and finish. Ignore pose, identity, and outfit.',
  'Schema:',
  '{',
  '  "proStyleTags": ["string"],',
  '  "proMaterialTags": ["string"],',
  '  "proLightingTags": ["string"]',
  '}',
].join('\n');

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 4)
    : [];

const buildCharacterAnalysisAttemptSets = (
  references: Array<{ source: string; kind: string }>,
) => {
  const allRefs = references.slice(0, 3);
  const faceRefs = references.filter((reference) => reference.kind === 'face_detail' || reference.kind === 'face').slice(0, 2);
  const bodyRefs = references.filter((reference) => reference.kind === 'body').slice(0, 1);
  const firstRef = references.slice(0, 1);

  return [allRefs, faceRefs, bodyRefs, firstRef]
    .filter((set) => set.length > 0)
    .filter((set, index, all) => index === all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(set)));
};

const normalizeCharacterVision = (characterIndex: number, raw: any): CharacterVisionAnalysis => ({
  characterIndex,
  summary: typeof raw?.summary === 'string' ? raw.summary.trim() : undefined,
  skinToneDescriptor: typeof raw?.skinToneDescriptor === 'string' ? raw.skinToneDescriptor.trim() : undefined,
  skinToneHexApprox: typeof raw?.skinToneHexApprox === 'string' ? raw.skinToneHexApprox.trim() : undefined,
  faceIdentityNotes: normalizeStringArray(raw?.faceIdentityNotes),
  makeupNotes: normalizeStringArray(raw?.makeupNotes),
  faceAccessoryNotes: normalizeStringArray(raw?.faceAccessoryNotes),
  hairNotes: normalizeStringArray(raw?.hairNotes),
  outfitNotes: normalizeStringArray(raw?.outfitNotes),
  proIdentityTags: normalizeStringArray(raw?.proIdentityTags),
  proFaceTags: normalizeStringArray(raw?.proFaceTags),
  proAppearanceTags: normalizeStringArray(raw?.proAppearanceTags),
});

const normalizeSampleVision = (raw: any): SampleVisionAnalysis => ({
  summary: typeof raw?.summary === 'string' ? raw.summary.trim() : undefined,
  pose: typeof raw?.pose === 'string' ? raw.pose.trim() : undefined,
  camera: typeof raw?.camera === 'string' ? raw.camera.trim() : undefined,
  framing: typeof raw?.framing === 'string' ? raw.framing.trim() : undefined,
  subjectPlacement: typeof raw?.subjectPlacement === 'string' ? raw.subjectPlacement.trim() : undefined,
  background: typeof raw?.background === 'string' ? raw.background.trim() : undefined,
  lighting: typeof raw?.lighting === 'string' ? raw.lighting.trim() : undefined,
  limbLayout: typeof raw?.limbLayout === 'string' ? raw.limbLayout.trim() : undefined,
  supportContact: typeof raw?.supportContact === 'string' ? raw.supportContact.trim() : undefined,
  occlusionNotes: typeof raw?.occlusionNotes === 'string' ? raw.occlusionNotes.trim() : undefined,
  proSceneTags: normalizeStringArray(raw?.proSceneTags),
  proPoseTags: normalizeStringArray(raw?.proPoseTags),
  proContactTags: normalizeStringArray(raw?.proContactTags),
});

const normalizeStyleVision = (raw: any): StyleVisionAnalysis => ({
  summary: typeof raw?.summary === 'string' ? raw.summary.trim() : undefined,
  renderStyle: typeof raw?.renderStyle === 'string' ? raw.renderStyle.trim() : undefined,
  materialStyle: typeof raw?.materialStyle === 'string' ? raw.materialStyle.trim() : undefined,
  lightingStyle: typeof raw?.lightingStyle === 'string' ? raw.lightingStyle.trim() : undefined,
  colorGrading: typeof raw?.colorGrading === 'string' ? raw.colorGrading.trim() : undefined,
  finish: typeof raw?.finish === 'string' ? raw.finish.trim() : undefined,
  proStyleTags: normalizeStringArray(raw?.proStyleTags),
  proMaterialTags: normalizeStringArray(raw?.proMaterialTags),
  proLightingTags: normalizeStringArray(raw?.proLightingTags),
});

export const analyzeImageGenerationVision = async (
  payload: ImageGenerateRecipePayload,
  options?: { onDiagnostic?: VertexDiagnosticCallback },
): Promise<ImageVisionAnalysis> => {
  const mode: VisionAnalysisMode = isProImageGenerationModel(payload.modelId) ? 'pro_structured' : 'default';
  const characterGroups = getImageCharacterReferenceGroups(payload);
  const characters: CharacterVisionAnalysis[] = [];

  for (const group of characterGroups) {
    const attemptSets = buildCharacterAnalysisAttemptSets(group.references);
    let normalizedCharacter: CharacterVisionAnalysis | null = null;
    let lastError: unknown = null;

    for (let attemptIndex = 0; attemptIndex < attemptSets.length; attemptIndex += 1) {
      const attemptSet = attemptSets[attemptIndex];
      const parts: any[] = [];
      for (const reference of attemptSet) {
        parts.push({ text: `${reference.kind.toUpperCase()} REFERENCE:` });
        parts.push(await toInlineImagePart(reference.source));
      }

      if (parts.length === 0) {
        continue;
      }

      try {
        const raw = await generateVisionJson<any>(
          `character reference analysis slot ${group.characterIndex}${attemptIndex > 0 ? ` retry ${attemptIndex}` : ''}`,
          parts,
          mode === 'pro_structured'
            ? buildProCharacterVisionPrompt(group.characterIndex)
            : buildCharacterVisionPrompt(group.characterIndex),
          mode,
          options?.onDiagnostic,
        );
        normalizedCharacter = normalizeCharacterVision(group.characterIndex, raw);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (normalizedCharacter) {
      characters.push(normalizedCharacter);
    } else {
      await emitDiagnostic(
        options?.onDiagnostic,
        'warning',
        `Character reference analysis for slot ${group.characterIndex} failed: ${lastError instanceof Error ? lastError.message : String(lastError || 'Unknown error')}`,
      );
    }
  }

  let sample: SampleVisionAnalysis | undefined;
  const sampleAnalysisSource = payload.sampleAnalysisImage || payload.sampleImage;
  if (sampleAnalysisSource) {
    try {
      sample = normalizeSampleVision(
        await generateVisionJson<any>(
          'sample image analysis',
          [await toInlineImagePart(sampleAnalysisSource)],
          mode === 'pro_structured' ? buildProSampleVisionPrompt() : buildSampleVisionPrompt(),
          mode,
          options?.onDiagnostic,
        ),
      );
    } catch (error) {
      await emitDiagnostic(
        options?.onDiagnostic,
        'warning',
        `Sample image analysis failed: ${error instanceof Error ? error.message : String(error || 'Unknown error')}`,
      );
    }
  }

  let style: StyleVisionAnalysis | undefined;
  const styleAnalysisSource = payload.styleAnalysisImage || payload.styleImage;
  if (styleAnalysisSource) {
    try {
      style = normalizeStyleVision(
        await generateVisionJson<any>(
          'style image analysis',
          [await toInlineImagePart(styleAnalysisSource)],
          mode === 'pro_structured' ? buildProStyleVisionPrompt() : buildStyleVisionPrompt(),
          mode,
          options?.onDiagnostic,
        ),
      );
    } catch (error) {
      await emitDiagnostic(
        options?.onDiagnostic,
        'warning',
        `Style image analysis failed: ${error instanceof Error ? error.message : String(error || 'Unknown error')}`,
      );
    }
  }

  return {
    characters,
    sample,
    style,
  };
};
