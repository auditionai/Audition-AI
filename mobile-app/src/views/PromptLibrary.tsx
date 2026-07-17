import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock, Eye, Flame, Loader, RefreshCw, Search, Wand2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
} from '../../../shared/caulenhauSamples';

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

export function PromptLibrary() {
  const navigate = useNavigate();
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
    }, { rootMargin: '480px 0px' });

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
    notify('Đã nhập sẵn prompt mẫu.', 'success');
    navigate(`/generate/image?tool=${encodeURIComponent(getPromptLibraryFeatureId(sample))}`);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-28 dark:bg-[#09090B]">
      <section className="mx-4 mt-4 overflow-hidden rounded-[28px] bg-gray-950 p-5 text-white shadow-xl dark:bg-[#18181B]">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-200">
          <Flame className="h-3.5 w-3.5" />
          Mẫu hot
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Prompt mẫu</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/70">Tìm chủ đề, chọn mẫu hợp ý rồi mở trang tạo ảnh với prompt đã điền sẵn.</p>
          </div>
          <button onClick={() => void loadSamples(0)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-950">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="sticky top-[57px] z-20 mt-3 border-y border-gray-100 bg-[#FAFAFA]/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-[#09090B]/90">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fuchsia-500" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm: sinh nhật, tình yêu, birthday..."
            className="h-12 w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-11 text-sm font-extrabold text-gray-950 outline-none placeholder:text-gray-400 focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-500/10 dark:border-zinc-800 dark:bg-[#18181B] dark:text-white dark:placeholder:text-zinc-500"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-300"
              aria-label="Xóa tìm kiếm"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {['Sinh nhật', 'Tình yêu', 'Đám cưới', 'Giáng sinh'].map((keyword) => (
            <button
              key={keyword}
              type="button"
              onClick={() => setSearchInput(keyword)}
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-gray-600 shadow-sm dark:bg-zinc-900 dark:text-zinc-300"
            >
              {keyword}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {CAULENHAU_SAMPLE_CATEGORIES.map((category) => {
            const isActive = activeCategoryId === category.id;
            return (
              <button
                key={category.id}
                onClick={() => setActiveCategoryId(category.id)}
                className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-black transition-colors ${isActive ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-white text-gray-500 shadow-sm dark:bg-zinc-900 dark:text-zinc-400'}`}
              >
                {category.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1 dark:bg-zinc-900">
          {([
            ['newest', 'Mới nhất', Clock],
            ['popular', 'Dùng nhiều', Flame],
          ] as const).map(([mode, label, Icon]) => {
            const isActive = sortMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={`flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-black transition ${isActive ? 'bg-white text-gray-950 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-gray-500 dark:text-zinc-400'}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="px-4 py-4">
        {error && samples.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] bg-white p-6 text-center shadow-sm dark:bg-[#18181B]">
            <AlertTriangle className="mb-3 h-10 w-10 text-amber-500" />
            <p className="text-sm text-gray-500 dark:text-zinc-400">{error}</p>
            <button onClick={() => void loadSamples(0)} className="mt-4 rounded-full bg-gray-900 px-4 py-2 text-xs font-black text-white dark:bg-white dark:text-black">Thử lại</button>
          </div>
        ) : samples.length === 0 && isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center gap-3 text-sm text-gray-500 dark:text-zinc-400">
            <Loader className="h-6 w-6 animate-spin text-fuchsia-500" />
            Đang tải mẫu phù hợp...
          </div>
        ) : samples.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] bg-white p-6 text-center shadow-sm dark:bg-[#18181B]">
            <Search className="mb-3 h-10 w-10 text-fuchsia-500" />
            <p className="text-sm font-bold text-gray-500 dark:text-zinc-400">Chưa tìm thấy mẫu hợp với “{searchQuery}”.</p>
            <button onClick={() => setSearchInput('')} className="mt-4 rounded-full bg-gray-900 px-4 py-2 text-xs font-black text-white dark:bg-white dark:text-black">Xóa tìm kiếm</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {samples.map((sample) => {
              const tags = getPromptLibraryTags(sample);
              const useCount = sample.total_use_count || 0;
              return (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => void handleUsePrompt(sample)}
                  className="overflow-hidden rounded-[24px] bg-white text-left shadow-sm transition-transform active:scale-[0.98] dark:bg-[#18181B]"
                >
                  <div className="relative aspect-[3/4] bg-gray-100 dark:bg-zinc-900">
                    <img src={sample.image_url} alt={sample.category} className="h-full w-full object-cover" loading="lazy" />
                    <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[9px] font-black text-white backdrop-blur">{sample.category}</span>
                    {useCount > 0 && (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[9px] font-black text-white backdrop-blur">
                        <Eye className="h-3 w-3 text-yellow-200" />
                        {formatUseCount(useCount)}
                      </span>
                    )}
                    <span className="absolute right-2 top-2 flex flex-col items-end gap-1">
                      {tags.map((tag) => (
                        <span key={tag} className={`rounded-full px-2 py-1 text-[9px] font-black ${tag === 'HOT' ? 'bg-fuchsia-600 text-white' : 'bg-yellow-300 text-gray-950'}`}>
                          {tag}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-3 min-h-[45px] text-[11px] leading-relaxed text-gray-600 dark:text-zinc-300">{sample.prompt || 'Prompt mẫu chưa có nội dung.'}</p>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-black text-gray-400 dark:text-zinc-500">
                      <span>{useCount > 0 ? `${formatUseCount(useCount)} lượt dùng` : ''}</span>
                      {sample.searchScore ? <span>{sample.searchLearningScore ? `AI học ${sample.searchLearningScore}` : `Khớp ${sample.searchScore}`}</span> : null}
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-3 py-2 text-[11px] font-black text-white">
                      <Wand2 className="h-3.5 w-3.5" />
                      Sử dụng
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div ref={loadMoreRef} className="flex h-16 items-center justify-center">
          {isLoading && samples.length > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-gray-500 shadow-sm dark:bg-zinc-900 dark:text-zinc-400">
              <Loader className="h-4 w-4 animate-spin" />
              Đang tải thêm...
            </div>
          )}
          {!hasMore && samples.length > 0 && <span className="text-xs font-bold text-gray-400">Đã xem hết {activeCategory.label}.</span>}
        </div>
      </div>
    </div>
  );
}
