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

const formatUseCount = (value = 0) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
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
      const nextSamples = await fetchCaulenhauSamples(
        caulenhauClient,
        activeCategory,
        nextPage,
        PROMPT_LIBRARY_PAGE_SIZE,
        { query: searchQuery, sortMode },
      );
      const samplesWithStats = await enrichUsageStats(nextSamples, searchQuery);
      if (requestId !== loadRequestRef.current) return;
      setSamples((current) => {
        const merged = nextPage === 0 ? samplesWithStats : [...current, ...samplesWithStats];
        return sortSamplesForMode(merged, sortMode);
      });
      setPage(nextPage);
      setHasMore(nextSamples.length === PROMPT_LIBRARY_PAGE_SIZE);
    } catch (loadError: any) {
      const message = loadError?.message || 'Không thể tải prompt mẫu.';
      setError(message);
      if (nextPage === 0) setSamples([]);
      notify(message, 'error');
    } finally {
      if (requestId === loadRequestRef.current) {
        loadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [activeCategory, notify, searchQuery, sortMode]);

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
    <div className="space-y-6 pb-20">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#101018] p-6 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,0,153,0.28),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(33,212,253,0.18),transparent_30%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-audi-yellow/30 bg-audi-yellow/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-audi-yellow">
              <Icons.Flame className="h-4 w-4" />
              CauLenhAu Prompt Hub
            </div>
            <h1 className="font-game text-3xl font-black leading-tight text-white md:text-5xl">Khám phá prompt mẫu</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
              Tìm theo chủ đề bằng tiếng Việt hoặc tiếng Anh, chọn ảnh bạn thích và AUDITION AI sẽ mở trang tạo ảnh với prompt đã nhập sẵn.
            </p>
          </div>
          <button
            onClick={() => void loadSamples(0)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-black text-black transition-transform hover:scale-[1.02]"
          >
            <Icons.RefreshCw className="h-4 w-4" />
            Làm mới
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#080912]/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="group relative block flex-1">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-400">Tìm prompt mẫu</span>
            <div className="relative">
              <Icons.Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-audi-pink" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Nhập chủ đề: sinh nhật, tình yêu, birthday, romantic..."
                className="h-14 w-full rounded-2xl border border-white/15 bg-[#151525] pl-12 pr-12 text-base font-extrabold text-white outline-none selection:bg-audi-pink selection:text-white placeholder:text-slate-500 transition focus:border-audi-pink focus:bg-[#19192b] focus:shadow-[0_0_0_3px_rgba(255,0,153,0.18)]"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
                  aria-label="Xóa tìm kiếm"
                >
                  <Icons.X className="h-4 w-4" />
                </button>
              )}
            </div>
          </label>
          <div className="flex shrink-0 rounded-2xl border border-white/10 bg-white/5 p-1 xl:mt-7">
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
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black transition ${isActive ? 'bg-white text-black shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Gợi ý:</span>
          {['Sinh nhật', 'Tình yêu', 'Đám cưới', 'Giáng sinh', 'Cyberpunk'].map((keyword) => (
            <button
              key={keyword}
              type="button"
              onClick={() => setSearchInput(keyword)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black text-slate-300 transition hover:border-audi-pink/50 hover:bg-audi-pink/15 hover:text-white"
            >
              {keyword}
            </button>
          ))}
          <span className="text-xs font-bold text-slate-600">Tự hiểu song ngữ: “sinh nhật” khớp birthday, cake, party.</span>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-2 no-scrollbar">
        {CAULENHAU_SAMPLE_CATEGORIES.map((category) => {
          const isActive = activeCategoryId === category.id;
          return (
            <button
              key={category.id}
              onClick={() => setActiveCategoryId(category.id)}
              className={`min-w-[160px] rounded-xl px-4 py-3 text-left transition-all ${isActive ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'}`}
            >
              <div className="text-sm font-black">{category.label}</div>
              <div className={`mt-1 text-[11px] leading-snug ${isActive ? 'text-black/60' : 'text-slate-500'}`}>{category.description}</div>
            </button>
          );
        })}
      </div>

      {error && samples.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-center">
          <Icons.AlertTriangle className="mb-3 h-10 w-10 text-audi-yellow" />
          <p className="text-sm text-slate-300">{error}</p>
          <button onClick={() => void loadSamples(0)} className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-black text-black">Thử lại</button>
        </div>
      ) : samples.length === 0 && isLoading ? (
        <div className="flex min-h-[360px] items-center justify-center gap-3 text-slate-400">
          <Icons.Loader className="h-8 w-8 animate-spin text-audi-purple" />
          Đang tải mẫu phù hợp...
        </div>
      ) : samples.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-center">
          <Icons.Search className="mb-3 h-10 w-10 text-audi-purple" />
          <p className="text-sm font-bold text-slate-300">Chưa tìm thấy mẫu hợp với “{searchQuery}”.</p>
          <button onClick={() => setSearchInput('')} className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-black text-black">Xóa tìm kiếm</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {samples.map((sample) => {
            const tags = getPromptLibraryTags(sample);
            const useCount = sample.total_use_count || 0;
            return (
              <article key={sample.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#12121a] shadow-xl transition-all hover:-translate-y-1 hover:border-audi-pink/60">
                <div className="relative aspect-[3/4] bg-white/5">
                  <img src={sample.image_url} alt={sample.category} className="h-full w-full object-cover" loading="lazy" />
                  <div className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-black text-white backdrop-blur">{sample.category}</div>
                  <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full px-2 py-1 text-[10px] font-black shadow-lg ${tag === 'HOT' ? 'bg-gradient-to-r from-audi-pink to-audi-purple text-white' : 'bg-audi-yellow text-black'}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {useCount > 0 && (
                    <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-black text-white backdrop-blur">
                      <Icons.Eye className="h-3 w-3 text-audi-yellow" />
                      {formatUseCount(useCount)}
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-3">
                  <p className="line-clamp-3 min-h-[48px] text-xs leading-relaxed text-slate-300">{sample.prompt || 'Prompt mẫu chưa có nội dung.'}</p>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span>{useCount > 0 ? `${formatUseCount(useCount)} lượt dùng` : ''}</span>
                    {sample.searchScore ? <span>{sample.searchLearningScore ? `AI học: ${sample.searchLearningScore}` : `Khớp AI: ${sample.searchScore}`}</span> : <span>{sortMode === 'popular' ? 'Xếp theo lượt dùng' : 'Mới nhất'}</span>}
                  </div>
                  <button
                    onClick={() => void handleUsePrompt(sample)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-audi-pink to-audi-purple px-3 py-2 text-xs font-black text-white shadow-[0_0_18px_rgba(255,0,153,0.25)] transition-transform hover:scale-[1.02]"
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
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300">
            <Icons.Loader className="h-4 w-4 animate-spin" />
            Đang tải thêm...
          </div>
        )}
        {!hasMore && samples.length > 0 && <span className="text-xs font-bold text-slate-500">Đã xem hết chuyên mục {activeCategory.label}.</span>}
      </div>
    </div>
  );
};
