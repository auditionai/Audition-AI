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

export interface CharacterReviewFlags {
  hasSharpnessIssue: boolean;
  hasBackgroundIssue: boolean;
  isClean: boolean;
}

const TEMPORARY_REVIEW_CAPACITY_PATTERN =
  /no available vertex ai credentials|all vertex ai credentials failed|resource has been exhausted|quota|rate limit|temporarily exhausted/i;

export const getCharacterReviewFlags = (review: CharacterImageReviewResult | null): CharacterReviewFlags => {
  if (!review) {
    return {
      hasSharpnessIssue: false,
      hasBackgroundIssue: false,
      isClean: false,
    };
  }

  const explicitSharpnessIssue =
    review.issues.includes('blurry_subject')
    || review.issues.includes('noisy_subject')
    || review.issues.includes('low_detail');
  const strongSharpnessIssue =
    review.needsSharpen
    || review.subjectSharpness === 'blurry'
    || review.noiseLevel === 'high'
    || review.detailLevel === 'poor'
    || explicitSharpnessIssue;
  const moderateSharpnessIssue =
    review.subjectSharpness === 'soft'
    && (
      review.detailLevel === 'partial'
      || review.noiseLevel === 'medium'
      || review.detailLevel === 'unknown'
      || review.noiseLevel === 'unknown'
    );
  const hasBackgroundIssue =
    review.needsBackgroundRemoval
    || review.backgroundStatus === 'mixed'
    || review.backgroundStatus === 'busy'
    || review.issues.includes('background_not_removed')
    || review.issues.includes('busy_background');
  const backgroundOnlyLikely =
    hasBackgroundIssue
    && !strongSharpnessIssue
    && review.detailLevel === 'clear'
    && review.noiseLevel !== 'high';
  const hasSharpnessIssue = strongSharpnessIssue || (moderateSharpnessIssue && !backgroundOnlyLikely);

  return {
    hasSharpnessIssue,
    hasBackgroundIssue,
    isClean: !hasSharpnessIssue && !hasBackgroundIssue,
  };
};

export const buildCharacterReviewMessage = (review: CharacterImageReviewResult | null) => {
  if (!review) return null;
  if (review.detectedCharacterCount === 0) {
    return 'Không thấy rõ nhân vật chính trong ảnh. Hãy tải lại ảnh chỉ chứa 1 nhân vật rõ mặt và trang phục.';
  }
  if ((review.detectedCharacterCount || 0) > 1) {
    return 'Ảnh đang có nhiều hơn 1 nhân vật hoặc nhiều chủ thể nổi bật. Hãy cắt lại chỉ còn đúng 1 nhân vật.';
  }

  const { hasSharpnessIssue, hasBackgroundIssue, isClean } = getCharacterReviewFlags(review);

  if (hasSharpnessIssue && hasBackgroundIssue) {
    return 'Ảnh nhân vật của bạn hiện chưa nét và cũng chưa tách nền sạch. Nên bấm Làm Nét trước, sau đó bấm Tách Nền để AI lấy đúng nhân vật, mặt và trang phục.';
  }
  if (hasSharpnessIssue) {
    return 'Ảnh nhân vật của bạn đang bị mờ, nhiễu mạnh hoặc thiếu chi tiết thật sự. Nên bấm Làm Nét để tăng độ rõ trước khi tạo ảnh.';
  }
  if (hasBackgroundIssue) {
    return 'Ảnh nhân vật của bạn đã đủ nét, nhưng nền vẫn chưa được tách sạch. Nên bấm Tách Nền để AI lấy đúng nhân vật và trang phục.';
  }

  if (!isClean && review.summary?.trim()) {
    const normalized = review.summary.trim();
    const summaryLooksClean = /đạt|ổn|tốt|sạch/i.test(normalized) && !/mờ|nền|nhiễu|noise|ui|không/i.test(normalized);
    if (!summaryLooksClean) {
      return normalized;
    }
  }

  return null;
};

export const formatCharacterReviewErrorMessage = (error: unknown) => {
  const rawMessage =
    error instanceof Error
      ? error.message.trim()
      : typeof error === 'string'
        ? error.trim()
        : '';

  if (!rawMessage) {
    return 'He thong quet anh nhan vat dang ban tam thoi. Ban co the thu lai sau it phut.';
  }

  if (TEMPORARY_REVIEW_CAPACITY_PATTERN.test(rawMessage)) {
    return 'He thong quet anh nhan vat dang ban tam thoi. Anh van da duoc tai len, ban co the thu quet lai sau it phut.';
  }

  if (/missing image payload/i.test(rawMessage)) {
    return 'Khong nhan duoc du lieu anh de quet. Hay tai lai anh mot lan nua.';
  }

  return rawMessage;
};

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
