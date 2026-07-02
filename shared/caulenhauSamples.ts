export const PROMPT_LIBRARY_PAGE_SIZE = 30;
export const PROMPT_LIBRARY_PENDING_PROMPT_KEY = 'auditionai:pending-caulenhau-prompt';
export const PROMPT_LIBRARY_APPLY_EVENT = 'auditionai:apply-caulenhau-prompt';
const PROMPT_LIBRARY_CACHE_PREFIX = 'auditionai:caulenhau-samples';
const PROMPT_LIBRARY_CACHE_TTL_MS = 5 * 60 * 1000;

export type CaulenhauSampleCategoryId = 'single' | 'couple' | 'group3' | 'group4' | 'group5';

export interface CaulenhauSampleCategory {
  id: CaulenhauSampleCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  categoryId: number;
}

export interface CaulenhauSamplePrompt {
  id: string;
  image_url: string;
  prompt: string;
  category: string;
}

export const CAULENHAU_SAMPLE_CATEGORIES: CaulenhauSampleCategory[] = [
  {
    id: 'single',
    label: 'Ảnh đơn',
    shortLabel: 'Đơn',
    description: 'Lấy từ chuyên mục Ảnh Nam Nữ trên CauLenhAu.',
    categoryId: 2,
  },
  {
    id: 'couple',
    label: 'Ảnh đôi / Couple',
    shortLabel: 'Đôi',
    description: 'Lấy từ chuyên mục Ảnh Couple trên CauLenhAu.',
    categoryId: 3,
  },
  {
    id: 'group3',
    label: 'Nhóm 3',
    shortLabel: 'Nhóm 3',
    description: 'Lấy từ chuyên mục Ảnh Nhóm trên CauLenhAu.',
    categoryId: 4,
  },
  {
    id: 'group4',
    label: 'Nhóm 4',
    shortLabel: 'Nhóm 4',
    description: 'Lấy từ chuyên mục Ảnh Nhóm trên CauLenhAu.',
    categoryId: 4,
  },
  {
    id: 'group5',
    label: 'Nhóm 5',
    shortLabel: 'Nhóm 5',
    description: 'Lấy từ chuyên mục Ảnh Nhóm trên CauLenhAu.',
    categoryId: 4,
  },
];

export const fetchCaulenhauSamples = async (
  client: any,
  category: CaulenhauSampleCategory,
  page: number,
  pageSize = PROMPT_LIBRARY_PAGE_SIZE,
): Promise<CaulenhauSamplePrompt[]> => {
  if (!client) {
    throw new Error('Chưa kết nối được dữ liệu CauLenhAu.');
  }

  const cacheKey = `${PROMPT_LIBRARY_CACHE_PREFIX}:${category.id}:${page}:${pageSize}`;
  if (typeof window !== 'undefined') {
    try {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { savedAt?: number; samples?: CaulenhauSamplePrompt[] };
        if (parsed.savedAt && Date.now() - parsed.savedAt < PROMPT_LIBRARY_CACHE_TTL_MS && Array.isArray(parsed.samples)) {
          return parsed.samples;
        }
      }
    } catch {
      // Ignore cache errors; fetching fresh data is safe.
    }
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error } = await client
    .from('images')
    .select('id, image_url, prompt, image_categories!inner(category_id)')
    .eq('image_categories.category_id', category.categoryId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  const samples = (data || []).map((item: any) => ({
    id: String(item.id),
    image_url: item.image_url,
    prompt: item.prompt || '',
    category: category.label,
  }));

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), samples }));
    } catch {
      // Ignore storage quota or privacy-mode failures.
    }
  }

  return samples;
};

export const stashPromptForGenerator = (prompt: string) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PROMPT_LIBRARY_PENDING_PROMPT_KEY, prompt);
  window.dispatchEvent(new CustomEvent(PROMPT_LIBRARY_APPLY_EVENT, { detail: { prompt } }));
};

export const consumeStashedPromptForGenerator = () => {
  if (typeof window === 'undefined') return '';
  const prompt = window.sessionStorage.getItem(PROMPT_LIBRARY_PENDING_PROMPT_KEY) || '';
  if (prompt) {
    window.sessionStorage.removeItem(PROMPT_LIBRARY_PENDING_PROMPT_KEY);
  }
  return prompt;
};
