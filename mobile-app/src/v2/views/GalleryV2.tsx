import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  Gem,
  Download,
  Image as ImageIcon,
  Loader,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useNotification } from '../../components/NotificationSystem';
import { getUnifiedHistory } from '../../services/economyService';
import { QUEUE_SUBMITTED_EVENT } from '../../services/serverQueueService';
import {
  checkR2Connection,
  deleteImageFromStorage,
  getAllImagesFromStorage,
  invalidateGalleryCache,
  publishImageToShowcase,
} from '../../services/storageService';
import { downloadAssetToBrowser } from '../../../../services/downloadService';
import type { GeneratedImage, HistoryItem } from '../../types';

type ViewMode = 'creations' | 'wallet';
type MediaFilter = 'all' | 'image' | 'video' | 'processing';

const assetKind = (item: GeneratedImage): 'image' | 'video' =>
  item.assetType === 'video' || item.queueKind?.includes('video') || item.queueKind?.includes('motion') || item.url?.includes('.mp4')
    ? 'video'
    : 'image';

const itemStatus = (item: GeneratedImage) => item.displayStatus || item.status || 'completed';

export function GalleryV2() {
  const { notify, confirm } = useNotification();
  const [mode, setMode] = useState<ViewMode>('creations');
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [items, setItems] = useState<GeneratedImage[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GeneratedImage | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await getAllImagesFromStorage()).sort((a, b) => b.timestamp - a.timestamp));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
    const refresh = () => {
      invalidateGalleryCache();
      window.setTimeout(() => void loadItems(), 1500);
    };
    window.addEventListener(QUEUE_SUBMITTED_EVENT, refresh);
    return () => window.removeEventListener(QUEUE_SUBMITTED_EVENT, refresh);
  }, [loadItems]);

  useEffect(() => {
    if (mode !== 'wallet' || history.length > 0) return;
    setLoading(true);
    getUnifiedHistory().then(setHistory).catch(() => notify('Không thể tải lịch sử Vcoin.', 'error')).finally(() => setLoading(false));
  }, [history.length, mode, notify]);

  const stats = useMemo(() => ({
    total: items.length,
    images: items.filter((item) => assetKind(item) === 'image').length,
    videos: items.filter((item) => assetKind(item) === 'video').length,
    active: items.filter((item) => ['queued', 'processing', 'rescuing'].includes(itemStatus(item))).length,
  }), [items]);

  const filtered = useMemo(() => items.filter((item) => {
    if (filter === 'image' || filter === 'video') return assetKind(item) === filter;
    if (filter === 'processing') return ['queued', 'processing', 'rescuing'].includes(itemStatus(item));
    return true;
  }), [filter, items]);

  const remove = (item: GeneratedImage) => confirm({
    title: 'Xóa tác phẩm?',
    message: 'Mục này sẽ bị xóa vĩnh viễn khỏi dòng thời gian.',
    confirmText: 'Xóa',
    cancelText: 'Giữ lại',
    isDanger: true,
    onConfirm: async () => {
      await deleteImageFromStorage(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelected(null);
    },
  });

  const download = async (item: GeneratedImage) => {
    if (!item.url) return;
    await downloadAssetToBrowser(item.url, `audition-ai-${item.id}.${assetKind(item) === 'video' ? 'mp4' : 'png'}`);
    notify('Đã lưu tác phẩm.', 'success');
  };

  const share = async (item: GeneratedImage) => {
    if (assetKind(item) !== 'image') return;
    if (!(await checkR2Connection())) {
      notify('Cloudflare R2 chưa sẵn sàng.', 'error');
      return;
    }
    const updated = await publishImageToShowcase(item);
    setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    setSelected(updated);
    notify('Đã đưa ảnh lên showcase.', 'success');
  };

  return (
    <div className="v2-history-page">
      <section className="v2-history-hero">
        <div className="v2-history-hero__copy">
          <span><Clock3 size={14} /> Smart timeline</span>
          <h1>Dòng thời gian<br /><b>của riêng bạn</b></h1>
          <p>Tác phẩm đang xử lý được cập nhật tự động. Bộ lọc ghi nhớ loại nội dung bạn đang quan tâm.</p>
        </div>
        <div className="v2-history-orbit" aria-hidden="true">
          <span><strong>{stats.total}</strong><small>Tổng</small></span>
          <i />
        </div>
      </section>

      <section className="v2-history-stats">
        <button type="button" onClick={() => setFilter('image')}><ImageIcon size={19} /><span><strong>{stats.images}</strong><small>Ảnh</small></span></button>
        <button type="button" onClick={() => setFilter('video')}><Video size={19} /><span><strong>{stats.videos}</strong><small>Video</small></span></button>
        <button type="button" onClick={() => setFilter('processing')}><Loader size={19} /><span><strong>{stats.active}</strong><small>Đang chạy</small></span></button>
      </section>

      <section className="v2-history-switch">
        <button type="button" className={mode === 'creations' ? 'is-active' : ''} onClick={() => setMode('creations')}><Sparkles size={17} /> Tác phẩm</button>
        <button type="button" className={mode === 'wallet' ? 'is-active' : ''} onClick={() => setMode('wallet')}><Gem size={17} /> Chi tiêu Vcoin</button>
      </section>

      {mode === 'creations' && (
        <>
          <section className="v2-history-toolbar">
            <div>
              {(['all', 'image', 'video', 'processing'] as MediaFilter[]).map((item) => (
                <button type="button" key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>
                  {item === 'all' ? 'Tất cả' : item === 'image' ? 'Ảnh' : item === 'video' ? 'Video' : 'Đang xử lý'}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void loadItems()} aria-label="Làm mới"><RefreshCw className={loading ? 'v2-spin' : ''} size={18} /></button>
          </section>

          {loading && items.length === 0 ? (
            <div className="v2-state-card"><Loader className="v2-spin" /><strong>Đang dựng dòng thời gian…</strong></div>
          ) : filtered.length === 0 ? (
            <div className="v2-state-card"><Sparkles /><strong>Chưa có tác phẩm ở bộ lọc này</strong><p>Hãy mở studio và tạo điều gì đó thật nổi bật.</p></div>
          ) : (
            <section className="v2-creation-stream">
              {filtered.map((item) => {
                const kind = assetKind(item);
                const status = itemStatus(item);
                const active = ['queued', 'processing', 'rescuing'].includes(status);
                return (
                  <button type="button" key={item.id} className="v2-creation-card v2-tap" onClick={() => setSelected(item)}>
                    <span className="v2-creation-card__media">
                      {item.url ? (
                        kind === 'video' ? <video src={item.url} muted playsInline /> : <img src={item.url} alt={item.toolName || 'Tác phẩm AI'} loading="lazy" />
                      ) : <Sparkles size={30} />}
                      {active && <span className="v2-creation-card__progress"><i style={{ width: `${item.progress || 12}%` }} /></span>}
                    </span>
                    <span className="v2-creation-card__copy">
                      <small>{kind === 'video' ? <Video size={13} /> : <ImageIcon size={13} />}{item.toolName || 'Audition AI'}</small>
                      <strong>{active ? 'Đang sáng tạo…' : status === 'failed' ? 'Cần thử lại' : 'Đã hoàn thành'}</strong>
                      <em>{new Date(item.timestamp).toLocaleDateString('vi-VN')}</em>
                    </span>
                  </button>
                );
              })}
            </section>
          )}
        </>
      )}

      {mode === 'wallet' && (
        <section className="v2-coin-timeline">
          {loading && history.length === 0 ? <div className="v2-state-card"><Loader className="v2-spin" /></div> : history.map((entry) => (
            <article key={entry.id}>
              <span className={entry.vcoinChange >= 0 ? 'is-plus' : 'is-minus'}>{entry.vcoinChange >= 0 ? <Gem size={18} /> : <ArrowDownToLine size={18} />}</span>
              <div><strong>{entry.description}</strong><small>{new Date(entry.createdAt).toLocaleString('vi-VN')}</small></div>
              <b className={entry.vcoinChange >= 0 ? 'is-plus' : 'is-minus'}>{entry.vcoinChange >= 0 ? '+' : ''}{entry.vcoinChange.toLocaleString('vi-VN')}</b>
            </article>
          ))}
        </section>
      )}

      {selected && (
        <div className="v2-creation-sheet" role="dialog" aria-modal="true" aria-label="Chi tiết tác phẩm">
          <button type="button" className="v2-creation-sheet__close" onClick={() => setSelected(null)} aria-label="Đóng"><X size={20} /></button>
          <div className="v2-creation-sheet__media">
            {assetKind(selected) === 'video' ? <video src={selected.url} controls playsInline /> : <img src={selected.url} alt={selected.toolName} />}
          </div>
          <div className="v2-creation-sheet__info">
            <span><CheckCircle2 size={15} /> {selected.toolName}</span>
            <h2>{itemStatus(selected) === 'completed' ? 'Tác phẩm đã sẵn sàng' : 'Chi tiết tiến trình'}</h2>
            <p>{selected.prompt || 'Không có mô tả.'}</p>
            <div>
              <button type="button" onClick={() => void download(selected)}><Download size={18} /> Tải xuống</button>
              {assetKind(selected) === 'image' && <button type="button" onClick={() => void share(selected)}><Share2 size={18} /> Chia sẻ</button>}
              <button type="button" className="is-danger" onClick={() => remove(selected)}><Trash2 size={18} /> Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
