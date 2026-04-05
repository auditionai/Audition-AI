import { getSupabaseAuthHeader } from './supabaseClient';

export type CharacterImageReviewIssue =
  | 'no_character'
  | 'multiple_characters'
  | 'blurry_subject'
  | 'noisy_subject'
  | 'low_detail'
  | 'background_not_removed'
  | 'busy_background'
  | 'too_dark'
  | 'too_bright'
  | 'uncertain';

export interface CharacterImageReviewResult {
  summary: string;
  detectedCharacterCount: number | null;
  subjectSharpness: 'clear' | 'soft' | 'blurry' | 'unknown';
  noiseLevel: 'low' | 'medium' | 'high' | 'unknown';
  detailLevel: 'clear' | 'partial' | 'poor' | 'unknown';
  backgroundStatus: 'transparent_like' | 'solid_black' | 'solid_white' | 'clean_studio' | 'mixed' | 'busy' | 'unknown';
  needsSharpen: boolean;
  needsBackgroundRemoval: boolean;
  issues: CharacterImageReviewIssue[];
}

export const runCharacterImageReview = async (image: string): Promise<CharacterImageReviewResult> => {
  const authHeader = await getSupabaseAuthHeader();
  const response = await fetch('/api/review-character-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ image }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to review character image');
  }

  return payload as CharacterImageReviewResult;
};
