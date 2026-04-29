import {
  getImageCharacterReferenceGroups,
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
              maxOutputTokens: 900,
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

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 4)
    : [];

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
});

const normalizeStyleVision = (raw: any): StyleVisionAnalysis => ({
  summary: typeof raw?.summary === 'string' ? raw.summary.trim() : undefined,
  renderStyle: typeof raw?.renderStyle === 'string' ? raw.renderStyle.trim() : undefined,
  materialStyle: typeof raw?.materialStyle === 'string' ? raw.materialStyle.trim() : undefined,
  lightingStyle: typeof raw?.lightingStyle === 'string' ? raw.lightingStyle.trim() : undefined,
  colorGrading: typeof raw?.colorGrading === 'string' ? raw.colorGrading.trim() : undefined,
  finish: typeof raw?.finish === 'string' ? raw.finish.trim() : undefined,
});

export const analyzeImageGenerationVision = async (
  payload: ImageGenerateRecipePayload,
  options?: { onDiagnostic?: VertexDiagnosticCallback },
): Promise<ImageVisionAnalysis> => {
  const characterGroups = getImageCharacterReferenceGroups(payload);
  const characters: CharacterVisionAnalysis[] = [];

  for (const group of characterGroups) {
    const parts: any[] = [];
    for (const reference of group.references.slice(0, 3)) {
      parts.push({ text: `${reference.kind.toUpperCase()} REFERENCE:` });
      parts.push(await toInlineImagePart(reference.source));
    }

    if (parts.length === 0) continue;

    try {
      const raw = await generateVisionJson<any>(
        `character reference analysis slot ${group.characterIndex}`,
        parts,
        buildCharacterVisionPrompt(group.characterIndex),
        options?.onDiagnostic,
      );
      characters.push(normalizeCharacterVision(group.characterIndex, raw));
    } catch (error) {
      await emitDiagnostic(
        options?.onDiagnostic,
        'warning',
        `Character reference analysis for slot ${group.characterIndex} failed: ${error instanceof Error ? error.message : String(error || 'Unknown error')}`,
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
          buildSampleVisionPrompt(),
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
  if (payload.styleImage) {
    try {
      style = normalizeStyleVision(
        await generateVisionJson<any>(
          'style image analysis',
          [await toInlineImagePart(payload.styleImage)],
          buildStyleVisionPrompt(),
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
