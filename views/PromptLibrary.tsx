import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../components/Icons';
import { useNotification } from '../components/NotificationSystem';
import { caulenhauClient } from '../services/supabaseClient';
import {
  CAULENHAU_SAMPLE_CATEGORIES,
  CaulenhauSampleCategoryId,
  CaulenhauSamplePrompt,
  PROMPT_LIBRARY_PAGE_SIZE,
  fetchCaulenhauSamples,
  stashPromptForGenerator,
} from '../shared/caulenhauSamples';

interface PromptLibraryProps {
  onUsePrompt: () => void;
}

export const PromptLibrary: React.FC<PromptLibraryProps> = ({ onUsePrompt }) => {
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
    }, { rootMargin: '600px 0px' });

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
    notify('Đã đưa prompt mẫu sang trang tạo ảnh.', 'success');
    onUsePrompt();
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
              Chọn ảnh bạn thích, bấm sử dụng và AUDITION AI sẽ mở trang tạo ảnh với prompt đã nhập sẵn.
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
          Đang tải 30 mẫu đầu tiên...
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {samples.map((sample) => (
            <article key={sample.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#12121a] shadow-xl transition-all hover:-translate-y-1 hover:border-audi-pink/60">
              <div className="relative aspect-[3/4] bg-white/5">
                <img src={sample.image_url} alt={sample.category} className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-black text-white backdrop-blur">{sample.category}</div>
              </div>
              <div className="space-y-3 p-3">
                <p className="line-clamp-3 min-h-[48px] text-xs leading-relaxed text-slate-300">{sample.prompt || 'Prompt mẫu chưa có nội dung.'}</p>
                <button
                  onClick={() => handleUsePrompt(sample)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-audi-pink to-audi-purple px-3 py-2 text-xs font-black text-white shadow-[0_0_18px_rgba(255,0,153,0.25)] transition-transform hover:scale-[1.02]"
                >
                  <Icons.Wand className="h-3.5 w-3.5" />
                  Sử dụng
                </button>
              </div>
            </article>
          ))}
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
