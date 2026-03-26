import { getImageCharacterReferenceGroups, type ImageGenerateRecipePayload } from '../../shared/queueRecipes';
import { runWithVertexCredentialFailover } from './_vertex-credentials';

const VERTEX_MODEL = 'gemini-3.1-pro-preview';

export type ImageOutputSlotStatus = 'matched' | 'missing' | 'duplicated' | 'substituted' | 'uncertain';

export interface ImageOutputSlotFinding {
  characterIndex: number;
  status: ImageOutputSlotStatus;
  notes: string;
}

export interface ImageOutputVerificationResult {
  pass: boolean;
  summary: string;
  detectedCharacterCount: number | null;
  missingCharacterSlots: number[];
  duplicatedCharacterSlots: number[];
  substitutedFromSampleOrStyle: boolean;
  issues: string[];
  slotFindings: ImageOutputSlotFinding[];
}

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
      throw new Error(`Failed to fetch verification image: ${await parseErrorMessage(response)}`);
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
    throw new Error(`Verification response was not valid JSON: ${text}`);
  }

  return candidate.slice(start, end + 1);
};

const normalizeNumberArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((entry) => Math.floor(Number(entry)))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
    : [];

const normalizeSlotStatus = (value: unknown): ImageOutputSlotStatus => {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'matched' ||
    normalized === 'missing' ||
    normalized === 'duplicated' ||
    normalized === 'substituted'
  ) {
    return normalized;
  }

  return 'uncertain';
};

const summarySignalsStyleBorrow = (summary: string) => {
  const lower = summary.toLowerCase();
  if (!lower.includes('style image')) return false;

  return (
    lower.includes('adopting') ||
    lower.includes('borrow') ||
    lower.includes('pose') ||
    lower.includes('outfit') ||
    lower.includes('clothing') ||
    lower.includes('hairstyle')
  );
};

const textSignalsStyleBorrow = (value: string) => {
  const lower = value.toLowerCase();
  if (!lower.includes('style')) return false;

  return (
    lower.includes('borrow') ||
    lower.includes('pose') ||
    lower.includes('outfit') ||
    lower.includes('clothing') ||
    lower.includes('hairstyle') ||
    lower.includes('clone') ||
    lower.includes('replace')
  );
};

const normalizeVerificationResult = (raw: any): ImageOutputVerificationResult => {
  const summary = typeof raw?.summary === 'string' ? raw.summary.trim() : '';
  const missingCharacterSlots = normalizeNumberArray(raw?.missingCharacterSlots);
  const duplicatedCharacterSlots = normalizeNumberArray(raw?.duplicatedCharacterSlots);
  const substitutedFromSampleOrStyle = raw?.substitutedFromSampleOrStyle === true;
  const issues = Array.isArray(raw?.issues)
    ? raw.issues.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
    : [];
  const slotFindings = Array.isArray(raw?.slotFindings)
    ? raw.slotFindings
        .map((entry: any) => ({
          characterIndex: Math.max(1, Math.floor(Number(entry?.characterIndex || 0))),
          status: normalizeSlotStatus(entry?.status),
          notes: typeof entry?.notes === 'string' ? entry.notes.trim() : '',
        }))
        .filter((entry: ImageOutputSlotFinding) => Number.isFinite(entry.characterIndex) && entry.characterIndex > 0)
    : [];
  const hasBlockingSlotFinding = slotFindings.some((entry) => entry.status !== 'matched');
  const borrowedStyleSignal = summarySignalsStyleBorrow(summary);
  const issueSignalsStyleBorrow = issues.some((entry) => textSignalsStyleBorrow(entry));
  const notesSignalStyleBorrow = slotFindings.some((entry) => textSignalsStyleBorrow(entry.notes));
  const pass =
    raw?.pass === true &&
    !substitutedFromSampleOrStyle &&
    missingCharacterSlots.length === 0 &&
    duplicatedCharacterSlots.length === 0 &&
    !hasBlockingSlotFinding &&
    !borrowedStyleSignal &&
    !issueSignalsStyleBorrow &&
    !notesSignalStyleBorrow;

  return {
    pass,
    summary,
    detectedCharacterCount:
      typeof raw?.detectedCharacterCount === 'number' && Number.isFinite(raw.detectedCharacterCount)
        ? raw.detectedCharacterCount
        : null,
    missingCharacterSlots,
    duplicatedCharacterSlots,
    substitutedFromSampleOrStyle,
    issues,
    slotFindings,
  };
};

const buildVerificationInstruction = (payload: ImageGenerateRecipePayload) => {
  const characterGroups = getImageCharacterReferenceGroups(payload);
  const expectedCount = Math.max(1, Math.floor(Number(payload.characterCount || characterGroups.length || 1)));
  const sections: string[] = [
    'You are a strict identity verification auditor for AI image generation outputs.',
    'Your task is to verify whether the FINAL RESULT image preserves the uploaded character slots correctly.',
    'Fail closed: if you are unsure whether a slot is preserved correctly, mark the verification as pass=false.',
    '',
    `FINAL RULE: the result must contain EXACTLY ${expectedCount} final subjects, no more and no less.`,
    'Every uploaded character slot is mandatory and must appear exactly once.',
    'Never accept a duplicated uploaded character filling another slot.',
    'Never accept a sample person, style person, or blended/invented subject replacing a character slot.',
    'Character references define identity. Sample image defines composition only. Style image defines render quality only.',
    '',
    'IMAGE ORDER FOR THIS AUDIT:',
    '- Image 1: FINAL RESULT to audit.',
  ];

  let imageIndex = 2;
  characterGroups.forEach((group) => {
    const start = imageIndex;
    const end = imageIndex + group.references.length - 1;
    const range = start === end ? `Image ${start}` : `Images ${start}-${end}`;
    const kinds = group.references
      .map((reference) => (reference.kind === 'face' ? 'FACE LOCK' : reference.kind === 'body' ? 'BODY' : 'REFERENCE'))
      .join(', ');
    const gender = group.gender ? `, fixed gender=${group.gender}` : '';
    sections.push(`- ${range}: CHARACTER SLOT ${group.characterIndex} (${kinds}${gender}). These all describe the same required final subject.`);
    imageIndex += group.references.length;
  });

  if (payload.sampleImage) {
    sections.push(`- Image ${imageIndex}: SAMPLE IMAGE. This may define pose/composition only and must not replace any character slot.`);
    imageIndex += 1;
  }

  if (payload.styleImage) {
    sections.push(`- Image ${imageIndex}: STYLE IMAGE. This may define style/render language only and must not replace any character slot.`);
  }

  sections.push(
    '',
    'EVALUATION CHECKLIST:',
    '1. Count the visible final subjects in Image 1.',
    '2. For each uploaded character slot, decide whether that exact slot identity appears exactly once in Image 1.',
    '3. Detect if any slot is missing.',
    '4. Detect if any slot was duplicated to fill another slot.',
    '5. Detect if any visible subject looks borrowed from the sample image or style image instead of the uploaded character slots.',
    '6. Detect if any final subject looks like a blended identity instead of a clean slot match.',
    '7. If the final result adopts pose, outfit, hairstyle, clothing, or subject appearance from the STYLE IMAGE, mark pass=false.',
    '8. If the final result looks like a style-image clone with only the uploaded face/identity pasted on top, mark pass=false.',
    '',
    'Return JSON only with this exact schema:',
    '{',
    '  "pass": boolean,',
    '  "summary": "short summary",',
    '  "detectedCharacterCount": number | null,',
    '  "missingCharacterSlots": number[],',
    '  "duplicatedCharacterSlots": number[],',
    '  "substitutedFromSampleOrStyle": boolean,',
    '  "issues": string[],',
    '  "slotFindings": [',
    '    { "characterIndex": number, "status": "matched|missing|duplicated|substituted|uncertain", "notes": "short note" }',
    '  ]',
    '}',
  );

  return sections.join('\n');
};

export const verifyGeneratedImageOutput = async (
  payload: ImageGenerateRecipePayload,
  resultImageUrl: string,
): Promise<ImageOutputVerificationResult> => {
  const characterGroups = getImageCharacterReferenceGroups(payload);
  if (characterGroups.length === 0) {
    throw new Error('Cannot verify output without character reference groups.');
  }

  const orderedSources = [
    resultImageUrl,
    ...characterGroups.flatMap((group) => group.references.map((reference) => reference.source)),
    ...(payload.sampleImage ? [payload.sampleImage] : []),
    ...(payload.styleImage ? [payload.styleImage] : []),
  ];

  const parts: Array<Record<string, unknown>> = await Promise.all(orderedSources.map((image) => toInlineImagePart(image)));
  parts.push({ text: buildVerificationInstruction(payload) });

  return runWithVertexCredentialFailover({
    taskName: 'image output verification',
    operation: async ({ projectId, accessToken }) => {
      const response = await fetch(
        `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/publishers/google/models/${VERTEX_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.0,
              topP: 0.1,
              maxOutputTokens: 2048,
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
        throw new Error('Vertex AI did not return an image verification result.');
      }

      return normalizeVerificationResult(JSON.parse(extractJsonPayload(text)));
    },
  });
};
