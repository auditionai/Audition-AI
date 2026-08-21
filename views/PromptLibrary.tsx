import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../components/Icons';
import { useNotification } from '../components/NotificationSystem';
import { caulenhauClient, supabase } from '../services/supabaseClient';
import {
  CAULENHAU_SAMPLE_CATEGORIES,
  CaulenhauSampleCategoryId,
  CaulenhauSamplePrompt,
  PROMPT_LIBRARY_PAGE_SIZE,
  PromptLibrarySortMode,
  applyPromptLibraryLearningScores,
  fetchCaulenhauSamples,
  fetchPromptLibrarySearchLearningStats,
  fetchPromptLibraryUsageStats,
  getPromptLibraryFeatureId,
  getPromptLibraryTags,
  stashPromptForGenerator,
  trackPromptLibrarySampleUse,
} from '../shared/caulenhauSamples';

interface PromptLibraryProps {
  onUsePrompt: (featureId: string) => void;
}

const BUILTIN_PROMPT_PRESETS: CaulenhauSamplePrompt[] = [
  {
    id: 'audition-single-1',
    category: 'Ảnh đơn',
    prompt: 'Full body 3D character of Audition male dancer, vibrant cyber street neon outfit, glowing sneakers, anime 3D render style, highly detailed, octane render, 8k',
    image_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
    total_use_count: 1420,
    external_use_count: 1420,
  },
  {
    id: 'audition-couple-1',
    category: 'Ảnh đôi',
    prompt: 'Couple 3D Audition dancers holding hands on a glowing stage floor, sparkling light effects, romantic cyber aesthetic, unreal engine 5 render',
    image_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
    total_use_count: 2890,
    external_use_count: 2890,
  },
  {
    id: 'audition-group-1',
    category: 'Nhóm 3',
    prompt: 'Group of 3 Audition idol dancers posing together in futuristic studio, neon pink and cyan light trails, highly detailed 3D game models',
    image_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    total_use_count: 980,
    external_use_count: 980,
  },
  {
    id: 'audition-cyberpunk-1',
    category: 'Cyberpunk',
    prompt: 'Audition 3D character with glowing cyber wings and neon headphones, dancing on a rooftop in a rainy cyberpunk city',
    image_url: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
    total_use_count: 3120,
    external_use_count: 3120,
  },
  {
    id: 'audition-single-2',
    category: 'Ảnh đơn',
    prompt: 'Full body female Audition 3D anime character, cute idol costume, twin tails hair, starry eyes, pastel pink stage lights',
    image_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
    total_use_count: 1850,
    external_use_count: 1850,
  },
  {
    id: 'audition-couple-2',
    category: 'Ảnh đôi',
    prompt: 'Audition 3D boy and girl wearing matching streetwear outfits, back to back pose, dynamic camera angle, game character design',
    image_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80',
    total_use_count: 2410,
    external_use_count: 2410,
  },
];

const enrichUsageStats = async (nextSamples: CaulenhauSamplePrompt[], searchQuery: string) => {
  const localStats = await fetchPromptLibraryUsageStats(supabase, nextSamples.map((sample) => sample.id));
  const samplesWithStats = nextSamples.map((sample) => {
    const trackedUseCount = localStats.get(sample.id) || 0;
    const externalUseCount = sample.external_use_count || 0;
    const totalUseCount = Math.max(trackedUseCount, externalUseCount);
    return {
      ...sample,
      local_use_count: Math.max(totalUseCount - externalUseCount, 0),
      total_use_count: totalUseCount,
    };
  });
  const learningStats = await fetchPromptLibrarySearchLearningStats(supabase, searchQuery, samplesWithStats.map((sample) => sample.id));
  return applyPromptLibraryLearningScores(samplesWithStats, learningStats, searchQuery);
};

const sortSamplesForMode = (items: CaulenhauSamplePrompt[], sortMode: PromptLibrarySortMode) => {
  if (sortMode !== 'popular') return items;
  return [...items].sort((a, b) => (b.total_use_count || 0) - (a.total_use_count || 0));
};

export const PromptLibrary: React.FC<PromptLibraryProps> = ({ onUsePrompt }) => {
  const { notify } = useNotification();
  const [activeCategoryId, setActiveCategoryId] = useState<CaulenhauSampleCategoryId>('all');
  const [samples, setSamples] = useState<CaulenhauSamplePrompt[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<PromptLibrarySortMode>('newest');
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const loadRequestRef = useRef(0);

  const activeCategory = useMemo(
    () => CAULENHAU_SAMPLE_CATEGORIES.find((category) => category.id === activeCategoryId) || CAULENHAU_SAMPLE_CATEGORIES[0],
    [activeCategoryId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadSamples = useCallback(async (nextPage = 0) => {
    if (loadingRef.current && nextPage > 0) return;
    const requestId = ++loadRequestRef.current;
    loadingRef.current = true;
    setIsLoading(true);
    setError('');

    try {
      let fetched = await fetchCaulenhauSamples(
        caulenhauClient,
        activeCategory,
        nextPage,
        PROMPT_LIBRARY_PAGE_SIZE,
        { query: searchQuery, sortMode },
      );

      if (!fetched || fetched.length === 0) {
        fetched = BUILTIN_PROMPT_PRESETS.filter(item => {
          if (activeCategoryId !== 'all' && item.category !== activeCategory.label) return false;
          if (searchQuery && !item.prompt.toLowerCase().includes(searchQuery.toLowerCase())) return false;
          return true;
        });
      }

      const samplesWithStats = await enrichUsageStats(fetched, searchQuery);
      if (requestId !== loadRequestRef.current) return;
      setSamples((current) => {
        const merged = nextPage === 0 ? samplesWithStats : [...current, ...samplesWithStats];
        return sortSamplesForMode(merged, sortMode);
      });
      setPage(nextPage);
      setHasMore(fetched.length >= PROMPT_LIBRARY_PAGE_SIZE);
    } catch (loadError: any) {
      console.warn('Fallback to builtin presets due to error:', loadError);
      const fallbackList = BUILTIN_PROMPT_PRESETS.filter(item => {
        if (activeCategoryId !== 'all' && item.category !== activeCategory.label) return false;
        if (searchQuery && !item.prompt.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      });
      setSamples(sortSamplesForMode(fallbackList, sortMode));
      setHasMore(false);
    } finally {
      if (requestId === loadRequestRef.current) {
        loadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [activeCategory, activeCategoryId, searchQuery, sortMode]);

  useEffect(() => {
    setSamples([]);
    setHasMore(true);
    void loadSamples(0);
  }, [activeCategoryId, searchQuery, sortMode]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !isLoading && samples.length > 0) {
        void loadSamples(page + 1);
      }
    }, { rootMargin: '600px 0px' });

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadSamples, page, samples.length]);

  const handleUsePrompt = async (sample: CaulenhauSamplePrompt) => {
    const prompt = sample.prompt.trim();
    if (!prompt) {
      notify('Prompt mẫu này hiện chưa có nội dung.', 'warning');
      return;
    }

    const nextUseCount = await trackPromptLibrarySampleUse(supabase, sample, searchQuery);
    if (typeof nextUseCount === 'number') {
      setSamples((current) => sortSamplesForMode(current.map((item) => {
        if (item.id !== sample.id) return item;
        const externalUseCount = item.external_use_count || 0;
        const totalUseCount = Math.max(nextUseCount, externalUseCount);
        return {
          ...item,
          local_use_count: Math.max(totalUseCount - externalUseCount, 0),
          total_use_count: totalUseCount,
        };
      }), sortMode));
    }

    stashPromptForGenerator(prompt);
    notify('Đã đưa prompt mẫu sang trang tạo ảnh.', 'success');
    onUsePrompt(getPromptLibraryFeatureId(sample));
  };

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      {/* 3D Neumorphic Hero Section */}
      <section className="neu-card p-6 sm:p-8 bg-gradient-to-r from-[#FF0099]/10 via-[#B721FF]/10 to-[#21D4FD]/10 border border-white/20 relative overflow-hidden">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 neu-inset-sm px-3.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider text-amber-500 font-accent">
              <Icons.Flame className="h-4 w-4 text-amber-500" />
              CauLenhAu Prompt Hub
            </div>
            <h1 className="font-accent text-3xl sm:text-4xl font-black text-slate-800 dark:text-white leading-tight">
              Khám phá Prompt Mẫu 3D
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Chọn bất kỳ mẫu phong cách nào bạn thích. Nhấn "Sử dụng" để tự động áp dụng Prompt vào Studio AI!
            </p>
          </div>
          <button
            onClick={() => void loadSamples(0)}
            className="neu-button px-5 py-3 rounded-2xl text-xs font-bold text-slate-800 dark:text-white inline-flex items-center justify-center gap-2"
          >
            <Icons.RefreshCw className="h-4 w-4 text-[#21D4FD]" />
            Làm mới
          </button>
        </div>
      </section>

      {/* 3D Search & Filter Panel */}
      <section className="neu-card p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <label className="group relative block flex-1">
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-300">Tìm prompt mẫu</span>
            <div className="relative">
              <Icons.Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FF0099]" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Nhập chủ đề: sinh nhật, tình yêu, birthday, romantic..."
                className="neu-input h-14 w-full rounded-2xl pl-12 pr-12 text-sm font-bold text-slate-950 dark:text-white placeholder:text-slate-600 dark:placeholder:text-slate-400 outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full neu-button text-slate-600 dark:text-slate-400 hover:text-[#FF0099]"
                >
                  <Icons.X className="h-4 w-4" />
                </button>
              )}
            </div>
          </label>

          <div className="flex shrink-0 neu-inset-sm p-1.5 rounded-2xl xl:mt-6">
            {([
              ['newest', 'Mới nhất', Icons.Clock],
              ['popular', 'Dùng nhiều', Icons.Flame],
            ] as const).map(([mode, label, Icon]) => {
              const isActive = sortMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSortMode(mode)}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black transition-all ${
                    isActive ? 'neu-raised-sm text-[#FF0099]' : 'text-slate-800 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Popular Tags */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-slate-800 dark:text-slate-300">Gợi ý hot:</span>
          {['Sinh nhật', 'Tình yêu', 'Audition 3D', 'Giáng sinh', 'Cyberpunk'].map((keyword) => (
            <button
              key={keyword}
              type="button"
              onClick={() => setSearchInput(keyword)}
              className="neu-button px-3 py-1.5 rounded-full text-xs font-extrabold text-slate-900 dark:text-slate-200 hover:text-[#FF0099]"
            >
              {keyword}
            </button>
          ))}
        </div>
      </section>

      {/* 3D Categories Pills */}
      <div className="flex gap-3 overflow-x-auto neu-inset-sm p-2 rounded-2xl no-scrollbar">
        {CAULENHAU_SAMPLE_CATEGORIES.map((category) => {
          const isActive = activeCategoryId === category.id;
          return (
            <button
              key={category.id}
              onClick={() => setActiveCategoryId(category.id)}
              className={`min-w-[160px] rounded-xl px-4 py-3 text-left transition-all ${
                isActive ? 'neu-raised-sm ring-2 ring-[#FF0099]' : 'hover:neu-raised-sm text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className={`text-xs font-black ${isActive ? 'text-[#FF0099]' : 'text-slate-950 dark:text-slate-100'}`}>
                {category.label}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-slate-700 dark:text-slate-300 font-bold line-clamp-1">
                {category.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Prompt Grid Content */}
      {error && samples.length === 0 ? (
        <div className="neu-card min-h-[280px] flex flex-col items-center justify-center p-8 text-center">
          <Icons.AlertTriangle className="mb-3 h-10 w-10 text-amber-500" />
          <p className="text-sm text-slate-500">{error}</p>
          <button onClick={() => void loadSamples(0)} className="mt-4 neu-button-primary px-5 py-2.5 rounded-xl text-xs font-bold">
            Thử lại
          </button>
        </div>
      ) : samples.length === 0 && isLoading ? (
        <div className="neu-card min-h-[320px] flex items-center justify-center gap-3 text-slate-400">
          <Icons.Loader className="h-8 w-8 animate-spin text-[#FF0099]" />
          <span>Đang tải prompt mẫu...</span>
        </div>
      ) : samples.length === 0 ? (
        <div className="neu-card min-h-[280px] flex flex-col items-center justify-center p-8 text-center">
          <Icons.Search className="mb-3 h-10 w-10 text-[#21D4FD]" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Không có mẫu nào khớp với “{searchQuery}”.</p>
          <button onClick={() => setSearchInput('')} className="mt-4 neu-button px-5 py-2.5 rounded-xl text-xs font-bold">
            Xóa tìm kiếm
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {samples.map((sample) => {
            const tags = getPromptLibraryTags(sample);
            return (
              <article 
                key={sample.id} 
                className="neu-card group overflow-hidden p-3 flex flex-col justify-between hover:scale-[1.02] transition-all"
              >
                <div>
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-3 neu-inset-sm">
                    <img src={sample.image_url} alt={sample.category} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur">
                      {sample.category}
                    </div>
                    <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold shadow-md ${
                            tag === 'HOT' ? 'bg-[#FF0099] text-white' : 'bg-amber-400 text-black'
                          }`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300 min-h-[48px] mb-3">
                    {sample.prompt || 'Prompt mẫu chưa có nội dung.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => void handleUsePrompt(sample)}
                    className="w-full neu-button-primary py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Icons.Wand className="h-3.5 w-3.5" />
                    Sử dụng
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div ref={loadMoreRef} className="flex h-16 items-center justify-center">
        {isLoading && samples.length > 0 && (
          <div className="inline-flex items-center gap-2 neu-inset-sm px-4 py-2 rounded-full text-xs font-bold text-slate-400">
            <Icons.Loader className="h-4 w-4 animate-spin text-[#FF0099]" />
            Đang tải thêm...
          </div>
        )}
      </div>
    </div>
  );
};
