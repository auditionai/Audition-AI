export const PROMPT_LIBRARY_PAGE_SIZE = 30;
export const PROMPT_LIBRARY_PENDING_PROMPT_KEY = 'auditionai:pending-caulenhau-prompt';
export const PROMPT_LIBRARY_APPLY_EVENT = 'auditionai:apply-caulenhau-prompt';
const PROMPT_LIBRARY_CACHE_PREFIX = 'auditionai:caulenhau-samples:v2';
const PROMPT_LIBRARY_CACHE_TTL_MS = 5 * 60 * 1000;
const PROMPT_LIBRARY_NEW_WINDOW_MS = 48 * 60 * 60 * 1000;

export type CaulenhauSampleCategoryId = 'all' | 'single' | 'couple' | 'group3' | 'group4' | 'group5';
export type PromptLibrarySortMode = 'newest' | 'popular';

export interface CaulenhauSampleCategory {
  id: CaulenhauSampleCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  categoryId: number | null;
}

export interface CaulenhauSamplePrompt {
  id: string;
  image_url: string;
  prompt: string;
  category: string;
  source_category_id?: number;
  created_at?: string;
  external_use_count?: number;
  local_use_count?: number;
  total_use_count?: number;
  searchScore?: number;
  searchLearningScore?: number;
}

export interface FetchCaulenhauSamplesOptions {
  query?: string;
  sortMode?: PromptLibrarySortMode;
}

export const CAULENHAU_SAMPLE_CATEGORIES: CaulenhauSampleCategory[] = [
  {
    id: 'all',
    label: 'Tất cả mẫu',
    shortLabel: 'Tất cả',
    description: 'Tìm trong toàn bộ prompt mẫu từ CauLenhAu.',
    categoryId: null,
  },
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
    description: 'Lấy từ chuyên mục Ảnh Nhóm 3 trên CauLenhAu.',
    categoryId: 4,
  },
  {
    id: 'group4',
    label: 'Nhóm 4',
    shortLabel: 'Nhóm 4',
    description: 'Lấy từ chuyên mục Ảnh Nhóm 4 trên CauLenhAu.',
    categoryId: 5,
  },
  {
    id: 'group5',
    label: 'Nhóm 5',
    shortLabel: 'Nhóm 5',
    description: 'Lấy từ chuyên mục Ảnh Nhóm 5 trên CauLenhAu.',
    categoryId: 6,
  },
];

const CAULENHAU_VISIBLE_CATEGORY_IDS = CAULENHAU_SAMPLE_CATEGORIES
  .map((category) => category.categoryId)
  .filter((categoryId): categoryId is number => categoryId !== null);

const PROMPT_LIBRARY_FEATURE_BY_CATEGORY_ID: Record<number, string> = {
  2: 'single_photo_gen',
  3: 'couple_photo_gen',
  4: 'group_3_gen',
  5: 'group_4_gen',
  6: 'group_5_gen',
};

export const getPromptLibraryFeatureId = (sample: CaulenhauSamplePrompt) => (
  PROMPT_LIBRARY_FEATURE_BY_CATEGORY_ID[sample.source_category_id || 2] || 'single_photo_gen'
);

const SEMANTIC_SEARCH_TERMS: Record<string, string[]> = {
  'sinh nhat': ['sinh nhat', 'tiec sinh nhat', 'birthday', 'birth day', 'bday', 'birthday party', 'birthday cake', 'cake', 'candle', 'candles', 'celebration', 'balloon', 'balloons', 'gift', 'present', 'happy birthday'],
  'tinh yeu': ['tinh yeu', 'love', 'romantic', 'romance', 'couple', 'valentine', 'heart', 'lover'],
  'dam cuoi': ['dam cuoi', 'wedding', 'bride', 'groom', 'bridal', 'marriage', 'engagement'],
  'giang sinh': ['giang sinh', 'christmas', 'xmas', 'santa', 'snow', 'winter', 'holiday'],
  'tet': ['tet', 'new year', 'lunar new year', 'vietnamese new year', 'spring', 'mai vang', 'dao hoa'],
  'trung thu': ['trung thu', 'mid autumn', 'moon festival', 'lantern', 'mooncake'],
  'mua he': ['mua he', 'summer', 'beach', 'sea', 'sunset', 'vacation'],
  'mua dong': ['mua dong', 'winter', 'snow', 'cold', 'ice', 'coat'],
  'bien': ['bien', 'beach', 'sea', 'ocean', 'waves', 'coast'],
  'hoc duong': ['hoc duong', 'school', 'student', 'classroom', 'uniform', 'campus'],
  'cong chua': ['cong chua', 'princess', 'royal', 'castle', 'fairy tale'],
  'co dau': ['co dau', 'bride', 'bridal', 'wedding dress'],
  'cyberpunk': ['cyberpunk', 'neon', 'futuristic', 'sci fi', 'sci-fi', 'city night'],
  'gothic': ['gothic', 'dark', 'vampire', 'black dress', 'castle'],
  'co trang': ['co trang', 'ancient', 'hanfu', 'wuxia', 'traditional', 'historical'],
  'han quoc': ['han quoc', 'korean', 'kpop', 'idol', 'seoul'],
  'nhat ban': ['nhat ban', 'japanese', 'kimono', 'anime', 'tokyo'],
  'ca phe': ['ca phe', 'coffee', 'cafe', 'latte'],
  'xe': ['xe', 'car', 'supercar', 'motorbike', 'vehicle'],
};

const STOP_SEARCH_TOKENS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'by', 'for', 'from', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'with',
  'anh', 'ao', 'bo', 'cac', 'cho', 'co', 'cua', 'da', 'de', 'duoc', 'la', 'lam', 'mot', 'nguoi', 'nhu', 'tao', 'theo', 'trong', 'va', 'voi',
]);

const removeVietnameseTone = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd');

export const normalizePromptSearchText = (value: string) => removeVietnameseTone(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const expandPromptSearchTerms = (query: string) => {
  const normalized = normalizePromptSearchText(query);
  if (!normalized) return [];

  const terms = new Set<string>();
  terms.add(normalized);

  Object.entries(SEMANTIC_SEARCH_TERMS).forEach(([topic, synonyms]) => {
    const normalizedSynonyms = synonyms.map(normalizePromptSearchText);
    const matchesTopic = normalized.includes(topic) || topic.includes(normalized);
    const matchesSynonym = normalizedSynonyms.some((term) => normalized.includes(term) || term.includes(normalized));
    if (matchesTopic || matchesSynonym) {
      terms.add(topic);
      normalizedSynonyms.forEach((term) => terms.add(term));
    }
  });

  return Array.from(terms).filter(Boolean);
};

export const getPromptSearchLearningKey = (query: string) => normalizePromptSearchText(query);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const promptHasTerm = (prompt: string, term: string) => {
  if (!term) return false;
  if (term.includes(' ')) return prompt.includes(term);
  return new RegExp(`(^|\\s)${escapeRegExp(term)}($|\\s)`).test(prompt);
};

const tokenizeSearchText = (value: string) => normalizePromptSearchText(value)
  .split(' ')
  .map((token) => token.trim())
  .filter((token) => token.length >= 2 && !STOP_SEARCH_TOKENS.has(token));

const findMatchedSearchTopic = (query: string) => {
  const normalized = normalizePromptSearchText(query);
  if (!normalized) return null;

  return Object.entries(SEMANTIC_SEARCH_TERMS).find(([topic, synonyms]) => {
    const normalizedSynonyms = synonyms.map(normalizePromptSearchText);
    return normalized === topic
      || normalized.includes(topic)
      || normalizedSynonyms.some((term) => normalized === term || normalized.includes(term));
  }) || null;
};

const scorePromptSample = (sample: CaulenhauSamplePrompt, query: string) => {
  const matchedTopic = findMatchedSearchTopic(query);
  const terms = matchedTopic
    ? [matchedTopic[0], ...matchedTopic[1].map(normalizePromptSearchText)]
    : expandPromptSearchTerms(query);
  if (terms.length === 0) return 1;

  const prompt = normalizePromptSearchText(`${sample.prompt} ${sample.category}`);
  const directQuery = normalizePromptSearchText(query);
  let score = promptHasTerm(prompt, directQuery) ? 30 : 0;

  terms.forEach((term) => {
    if (promptHasTerm(prompt, term)) score += term.includes(' ') ? 18 : 10;
  });

  if (!matchedTopic) {
    const queryTokens = tokenizeSearchText(query);
    const promptTokens = new Set(tokenizeSearchText(prompt));
    queryTokens.forEach((token) => {
      if (promptTokens.has(token)) score += 8;
    });
    if (queryTokens.length > 1 && queryTokens.every((token) => promptTokens.has(token))) score += 16;
  }

  if (matchedTopic && score === 0) return 0;
  return score;
};

const buildSampleQuery = (client: any, category: CaulenhauSampleCategory, selectColumns: string) => {
  const query = client.from('images').select(selectColumns);
  return category.categoryId === null
    ? query.in('image_categories.category_id', CAULENHAU_VISIBLE_CATEGORY_IDS)
    : query.eq('image_categories.category_id', category.categoryId);
};

const mapCaulenhauSample = (item: any, category: CaulenhauSampleCategory): CaulenhauSamplePrompt => {
  const categoryRows = Array.isArray(item.image_categories)
    ? item.image_categories
    : item.image_categories
      ? [item.image_categories]
      : [];
  const joinedCategoryId = categoryRows
    .map((row: any) => Number(row?.category_id))
    .find((categoryId: number) => CAULENHAU_VISIBLE_CATEGORY_IDS.includes(categoryId));
  const sourceCategoryId = category.categoryId || joinedCategoryId;
  const resolvedCategory = CAULENHAU_SAMPLE_CATEGORIES.find((candidate) => candidate.categoryId === sourceCategoryId);

  return {
    id: String(item.id),
    image_url: item.image_url,
    prompt: item.prompt || '',
    category: resolvedCategory?.label || category.label,
    source_category_id: sourceCategoryId,
    created_at: item.created_at || undefined,
    external_use_count: Number(item.use_count || item.usage_count || item.click_count || 0) || 0,
  };
};

export const fetchCaulenhauSamples = async (
  client: any,
  category: CaulenhauSampleCategory,
  page: number,
  pageSize = PROMPT_LIBRARY_PAGE_SIZE,
  options: FetchCaulenhauSamplesOptions = {},
): Promise<CaulenhauSamplePrompt[]> => {
  if (!client) {
    throw new Error('Chưa kết nối được dữ liệu CauLenhAu.');
  }

  const normalizedQuery = normalizePromptSearchText(options.query || '');
  const sortMode = options.sortMode || 'newest';
  const cacheKey = `${PROMPT_LIBRARY_CACHE_PREFIX}:${category.id}:${page}:${pageSize}:${sortMode}:${normalizedQuery}`;
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

  const sourcePageSize = normalizedQuery ? pageSize * 20 : sortMode === 'popular' ? pageSize * 8 : pageSize;
  const from = page * sourcePageSize;
  const to = from + sourcePageSize - 1;

  const categoryJoin = ', image_categories!inner(category_id)';
  const selectVariants = [
    `id, image_url, prompt, created_at, use_count${categoryJoin}`,
    `id, image_url, prompt, created_at, usage_count${categoryJoin}`,
    `id, image_url, prompt, created_at, click_count${categoryJoin}`,
    `id, image_url, prompt, created_at${categoryJoin}`,
    `id, image_url, prompt${categoryJoin}`,
  ];

  let response: any = null;
  for (const selectColumns of selectVariants) {
    response = await buildSampleQuery(client, category, selectColumns)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (!response.error) break;
  }

  if (response.error) {
    throw response.error;
  }

  let samples: CaulenhauSamplePrompt[] = (response.data || []).map((item: any) => mapCaulenhauSample(item, category));

  if (normalizedQuery) {
    samples = samples
      .map((sample: CaulenhauSamplePrompt) => ({ ...sample, searchScore: scorePromptSample(sample, normalizedQuery) }))
      .filter((sample: CaulenhauSamplePrompt) => (sample.searchScore || 0) > 0)
      .sort((a: CaulenhauSamplePrompt, b: CaulenhauSamplePrompt) => (b.searchScore || 0) - (a.searchScore || 0));
  }

  samples = samples.slice(0, pageSize);

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), samples }));
    } catch {
      // Ignore storage quota or privacy-mode failures.
    }
  }

  return samples;
};

export const fetchPromptLibraryUsageStats = async (client: any, sampleIds: string[]): Promise<Map<string, number>> => {
  const uniqueIds = Array.from(new Set(sampleIds.filter(Boolean)));
  if (!client || uniqueIds.length === 0) return new Map<string, number>();

  const { data, error } = await client
    .from('prompt_library_sample_stats')
    .select('sample_id, use_count')
    .eq('sample_source', 'caulenhau')
    .in('sample_id', uniqueIds);

  if (error) {
    console.warn('[PromptLibrary] Could not load local usage stats:', error.message || error);
    return new Map<string, number>();
  }

  return new Map<string, number>((data || []).map((row: any) => [String(row.sample_id), Number(row.use_count || 0)]));
};

export const fetchPromptLibrarySearchLearningStats = async (client: any, query: string, sampleIds: string[]): Promise<Map<string, number>> => {
  const searchQuery = getPromptSearchLearningKey(query);
  const uniqueIds = Array.from(new Set(sampleIds.filter(Boolean)));
  if (!client || !searchQuery || uniqueIds.length === 0) return new Map<string, number>();

  const { data, error } = await client
    .from('prompt_library_search_sample_stats')
    .select('sample_id, selected_count')
    .eq('sample_source', 'caulenhau')
    .eq('search_query', searchQuery)
    .in('sample_id', uniqueIds);

  if (error) {
    console.warn('[PromptLibrary] Could not load search learning stats:', error.message || error);
    return new Map<string, number>();
  }

  return new Map<string, number>((data || []).map((row: any) => [String(row.sample_id), Number(row.selected_count || 0)]));
};

export const applyPromptLibraryLearningScores = (
  samples: CaulenhauSamplePrompt[],
  learningStats: Map<string, number>,
  query: string,
) => {
  if (!query.trim() || learningStats.size === 0) return samples;

  return samples
    .map((sample) => {
      const learningScore = learningStats.get(sample.id) || 0;
      return {
        ...sample,
        searchLearningScore: learningScore,
        searchScore: (sample.searchScore || 0) + Math.min(learningScore * 25, 250),
      };
    })
    .sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));
};

export const trackPromptLibrarySampleUse = async (client: any, sample: CaulenhauSamplePrompt, searchQuery = '') => {
  if (!client) return null;

  const payload = {
    p_sample_source: 'caulenhau',
    p_sample_id: sample.id,
    p_sample_category: sample.category,
    p_sample_prompt: sample.prompt || '',
    p_sample_image_url: sample.image_url || '',
    p_search_query: getPromptSearchLearningKey(searchQuery),
  };

  let { data, error } = await client.rpc('track_prompt_library_sample_use_v2', payload);

  if (error) {
    const fallback = await client.rpc('track_prompt_library_sample_use', {
      p_sample_source: payload.p_sample_source,
      p_sample_id: payload.p_sample_id,
      p_sample_category: payload.p_sample_category,
      p_sample_prompt: payload.p_sample_prompt,
      p_sample_image_url: payload.p_sample_image_url,
    });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.warn('[PromptLibrary] Could not track sample use:', error.message || error);
    return null;
  }

  return Number(data || 0);
};

export const getPromptLibraryTags = (sample: CaulenhauSamplePrompt) => {
  const tags: Array<'HOT' | 'NEW'> = [];
  const createdAt = sample.created_at ? new Date(sample.created_at).getTime() : 0;
  if (createdAt && Date.now() - createdAt <= PROMPT_LIBRARY_NEW_WINDOW_MS) tags.push('NEW');
  if ((sample.total_use_count || 0) >= 10) tags.push('HOT');
  return tags;
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
