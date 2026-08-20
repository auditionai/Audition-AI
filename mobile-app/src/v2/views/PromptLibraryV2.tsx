import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Flame, Loader, RefreshCw, Search, Sparkles, WandSparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../components/NotificationSystem';
import { caulenhauClient, supabase } from '../../services/supabaseClient';
import {
  CAULENHAU_SAMPLE_CATEGORIES,
  type CaulenhauSampleCategoryId,
  type CaulenhauSamplePrompt,
  PROMPT_LIBRARY_PAGE_SIZE,
  type PromptLibrarySortMode,
  applyPromptLibraryLearningScores,
  fetchCaulenhauSamples,
  fetchPromptLibrarySearchLearningStats,
  fetchPromptLibraryUsageStats,
  getPromptLibraryFeatureId,
  getPromptLibraryTags,
  stashPromptForGenerator,
  trackPromptLibrarySampleUse,
} from '../../../../shared/caulenhauSamples';

export function PromptLibraryV2() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [categoryId, setCategoryId] = useState<CaulenhauSampleCategoryId>('all');
  const [samples, setSamples] = useState<CaulenhauSamplePrompt[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<PromptLibrarySortMode>('newest');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [failedSampleIds, setFailedSampleIds] = useState<Set<string | number>>(() => new Set());

  const category = useMemo(
    () => CAULENHAU_SAMPLE_CATEGORIES.find((item) => item.id === categoryId) || CAULENHAU_SAMPLE_CATEGORIES[0],
    [categoryId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (nextPage = 0) => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchCaulenhauSamples(
        caulenhauClient,
        category,
        nextPage,
        PROMPT_LIBRARY_PAGE_SIZE,
        { query, sortMode: sort },
      );
      const localStats = await fetchPromptLibraryUsageStats(supabase, rows.map((item) => item.id));
      const enriched = rows.map((item) => ({
        ...item,
        total_use_count: Math.max(localStats.get(item.id) || 0, item.external_use_count || 0),
      }));
      const learning = await fetchPromptLibrarySearchLearningStats(supabase, query, enriched.map((item) => item.id));
      let learned = applyPromptLibraryLearningScores(enriched, learning, query);
      if (sort === 'popular') learned = [...learned].sort((a, b) => (b.total_use_count || 0) - (a.total_use_count || 0));
      if (nextPage === 0) setFailedSampleIds(new Set());
      setSamples((current) => nextPage === 0 ? learned : [...current, ...learned]);
      setPage(nextPage);
      setHasMore(rows.length === PROMPT_LIBRARY_PAGE_SIZE);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải thư viện mẫu.');
      if (nextPage === 0) setSamples([]);
    } finally {
      setLoading(false);
    }
  }, [category, query, sort]);

  useEffect(() => {
    void load(0);
  }, [load]);

  const useSample = async (sample: CaulenhauSamplePrompt) => {
    const prompt = sample.prompt.trim();
    if (!prompt) {
      notify('Mẫu này chưa có nội dung prompt.', 'warning');
      return;
    }
    await trackPromptLibrarySampleUse(supabase, sample, query);
    stashPromptForGenerator(prompt);
    navigate(`/generate/image?tool=${encodeURIComponent(getPromptLibraryFeatureId(sample))}`);
  };

  const visibleSamples = samples.filter((sample) => !failedSampleIds.has(sample.id));
  const featured = visibleSamples[0];
  const remaining = visibleSamples.slice(1);
  const hideBrokenSample = (sampleId: string | number) => {
    setFailedSampleIds((current) => {
      const next = new Set(current);
      next.add(sampleId);
      return next;
    });
  };

  return (
    <div className="v2-hot-page">
      <section className="v2-hot-hero">
        <div>
          <span><Flame size={14} /> Trend radar</span>
          <h1>Mẫu HOT<br /><b>đang lên sóng</b></h1>
          <p>AI sắp xếp mẫu theo lượt dùng, xu hướng tìm kiếm và độ phù hợp với bạn.</p>
        </div>
        <div className="v2-hot-hero__disc" aria-hidden="true"><Sparkles size={30} /></div>
      </section>

      <section className="v2-hot-search">
        <label>
          <Search size={19} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm concept, sự kiện, phong cách…" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Xóa tìm kiếm"><X size={17} /></button>}
        </label>
        <button type="button" onClick={() => void load(0)} aria-label="Làm mới"><RefreshCw className={loading ? 'v2-spin' : ''} size={19} /></button>
      </section>

      <section className="v2-hot-filter">
        <div className="v2-hot-filter__rail">
          {CAULENHAU_SAMPLE_CATEGORIES.map((item) => (
            <button type="button" key={item.id} className={categoryId === item.id ? 'is-active' : ''} onClick={() => setCategoryId(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="v2-hot-sort">
          <button type="button" className={sort === 'newest' ? 'is-active' : ''} onClick={() => setSort('newest')}>Mới nhất</button>
          <button type="button" className={sort === 'popular' ? 'is-active' : ''} onClick={() => setSort('popular')}>Dùng nhiều</button>
        </div>
      </section>

      {loading && samples.length === 0 && (
        <div className="v2-state-card"><Loader className="v2-spin" /><strong>Đang bắt tín hiệu xu hướng…</strong></div>
      )}
      {error && samples.length === 0 && (
        <div className="v2-state-card"><Sparkles /><strong>Chưa kết nối được thư viện</strong><p>{error}</p><button type="button" onClick={() => void load(0)}>Thử lại</button></div>
      )}
      {!loading && !error && samples.length === 0 && (
        <div className="v2-state-card"><Search /><strong>Không tìm thấy mẫu phù hợp</strong><button type="button" onClick={() => setSearch('')}>Xóa tìm kiếm</button></div>
      )}

      {featured && (
        <button type="button" className="v2-hot-featured v2-tap" onClick={() => void useSample(featured)}>
          <img
            src={featured.image_url}
            alt={featured.category}
            decoding="async"
            onError={() => hideBrokenSample(featured.id)}
          />
          <span className="v2-hot-featured__shade" />
          <span className="v2-hot-featured__copy">
            <small><Flame size={13} /> Mẫu nổi bật hôm nay</small>
            <strong>{featured.category}</strong>
            <b>Dùng mẫu <ArrowRight size={17} /></b>
          </span>
        </button>
      )}

      <section className="v2-hot-mosaic">
        {remaining.map((sample) => (
          <button type="button" key={sample.id} className="v2-hot-card v2-tap" onClick={() => void useSample(sample)}>
            <img
              src={sample.image_url}
              alt={`Mẫu ${sample.category}`}
              loading="lazy"
              decoding="async"
              onError={() => hideBrokenSample(sample.id)}
            />
            <span className="v2-hot-card__tags">
              {getPromptLibraryTags(sample).map((tag) => <b key={tag}>{tag}</b>)}
            </span>
            <span className="v2-hot-card__copy">
              <strong>{sample.category}</strong>
              <WandSparkles size={17} />
            </span>
          </button>
        ))}
      </section>

      {samples.length > 0 && hasMore && (
        <button type="button" className="v2-load-more" onClick={() => void load(page + 1)} disabled={loading}>
          {loading ? <Loader className="v2-spin" size={18} /> : <Sparkles size={18} />}
          {loading ? 'Đang tải…' : 'Khám phá thêm'}
        </button>
      )}
    </div>
  );
}
