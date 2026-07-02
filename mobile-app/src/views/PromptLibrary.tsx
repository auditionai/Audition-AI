import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Flame, Loader, RefreshCw, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../components/NotificationSystem';
import { caulenhauClient } from '../services/supabaseClient';
import {
  CAULENHAU_SAMPLE_CATEGORIES,
  CaulenhauSampleCategoryId,
  CaulenhauSamplePrompt,
  PROMPT_LIBRARY_PAGE_SIZE,
  fetchCaulenhauSamples,
  stashPromptForGenerator,
} from '../../../shared/caulenhauSamples';

export function PromptLibrary() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [activeCategoryId, setActiveCategoryId] = useState<CaulenhauSampleCategoryId>('single');
  const [samples, setSamples] = useState<CaulenhauSamplePrompt[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const activeCategory = useMemo(
    () => CAULENHAU_SAMPLE_CATEGORIES.find((category) => category.id === activeCategoryId) || CAULENHAU_SAMPLE_CATEGORIES[0],
    [activeCategoryId],
  );

  const loadSamples = useCallback(async (nextPage = 0) => {
    if (isLoading) return;
    setIsLoading(true);
    setError('');

    try {
      const nextSamples = await fetchCaulenhauSamples(caulenhauClient, activeCategory, nextPage);
      setSamples((current) => nextPage === 0 ? nextSamples : [...current, ...nextSamples]);
      setPage(nextPage);
      setHasMore(nextSamples.length === PROMPT_LIBRARY_PAGE_SIZE);
    } catch (loadError: any) {
      const message = loadError?.message || 'Không thể tải Prompt mẫu.';
      setError(message);
      if (nextPage === 0) setSamples([]);
      notify(message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeCategory, isLoading, notify]);

  useEffect(() => {
    void loadSamples(0);
  }, [activeCategoryId]);

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

  const handleUsePrompt = (sample: CaulenhauSamplePrompt) => {
    const prompt = sample.prompt.trim();
    if (!prompt) {
      notify('Prompt mẫu này hiện chưa có nội dung.', 'warning');
      return;
    }

    stashPromptForGenerator(prompt);
    notify('Đã nhập sẵn prompt mẫu.', 'success');
    navigate('/generate/image');
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-28 dark:bg-[#09090B]">
      <section className="mx-4 mt-4 overflow-hidden rounded-[32px] bg-gray-950 p-5 text-white shadow-2xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-200">
          <Flame className="h-3.5 w-3.5" />
          Mẫu hot
        </div>
        <h1 className="text-2xl font-black tracking-tight">Prompt mẫu CauLenhAu</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/70">Lướt ảnh, chọn mẫu hợp ý rồi bấm sử dụng để mở trang tạo ảnh với prompt đã điền sẵn.</p>
        <button onClick={() => void loadSamples(0)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-gray-950">
          <RefreshCw className="h-3.5 w-3.5" />
          Làm mới
        </button>
      </section>

      <div className="sticky top-[57px] z-20 mt-4 overflow-x-auto border-y border-gray-100 bg-[#FAFAFA]/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-[#09090B]/90">
        <div className="flex gap-2">
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
      </div>

      <div className="px-4 py-4">
        {error && samples.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] bg-white p-6 text-center shadow-sm dark:bg-[#18181B]">
            <AlertTriangle className="mb-3 h-10 w-10 text-amber-500" />
            <p className="text-sm text-gray-500 dark:text-zinc-400">{error}</p>
            <button onClick={() => void loadSamples(0)} className="mt-4 rounded-full bg-gray-900 px-4 py-2 text-xs font-black text-white dark:bg-white dark:text-black">Thử lại</button>
          </div>
        ) : samples.length === 0 && isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center gap-3 text-sm text-gray-500 dark:text-zinc-400">
            <Loader className="h-6 w-6 animate-spin text-indigo-500" />
            Đang tải 30 mẫu...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {samples.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => handleUsePrompt(sample)}
                className="overflow-hidden rounded-[24px] bg-white text-left shadow-sm transition-transform active:scale-[0.98] dark:bg-[#18181B]"
              >
                <div className="relative aspect-[3/4] bg-gray-100 dark:bg-zinc-900">
                  <img src={sample.image_url} alt={sample.category} className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[9px] font-black text-white backdrop-blur">{sample.category}</span>
                </div>
                <div className="p-3">
                  <p className="line-clamp-3 min-h-[45px] text-[11px] leading-relaxed text-gray-600 dark:text-zinc-300">{sample.prompt || 'Prompt mẫu chưa có nội dung.'}</p>
                  <div className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-3 py-2 text-[11px] font-black text-white">
                    <Wand2 className="h-3.5 w-3.5" />
                    Sử dụng
                  </div>
                </div>
              </button>
            ))}
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
