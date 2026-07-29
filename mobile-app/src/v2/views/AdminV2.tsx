import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, Check, ChevronRight, CircleDollarSign,
  Clock3, Gem, Image as ImageIcon, Loader, LockKeyhole, RefreshCw, Search,
  Settings2, ShieldCheck, Sparkles, Users, Video, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../components/NotificationSystem';
import { APP_CONFIG } from '../../constants';
import {
  adminApproveTransaction,
  adminRejectTransaction,
  getAdminQueueJobs,
  getAdminStats,
  getFeatureMaintenanceConfig,
  getMaintenanceMode,
  runAdminQueueReconcile,
  saveFeatureMaintenanceConfig,
  saveMaintenanceMode,
  type FeatureMaintenanceConfig,
} from '../../services/economyService';
import type { AdminQueueJob, AdminQueueSummary, Transaction } from '../../types';

type AdminTab = 'overview' | 'queue' | 'finance' | 'users' | 'system';
type AdminStats = Awaited<ReturnType<typeof getAdminStats>>;

const EMPTY_QUEUE: AdminQueueSummary = {
  total: 0, queued: 0, processing: 0, completed: 0, failed: 0,
  overduePolls: 0, untouchedQueued: 0, stalledPreDispatch: 0,
};

const formatTime = (value?: string) => value
  ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
  : 'Chưa cập nhật';

const statusLabel = (status?: string) => ({
  queued: 'Đang chờ',
  processing: 'Đang chạy',
  rescuing: 'Đang cứu',
  completed: 'Hoàn thành',
  failed: 'Lỗi',
}[status || ''] || status || 'Không rõ');

export function AdminV2() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [queue, setQueue] = useState<AdminQueueJob[]>([]);
  const [queueSummary, setQueueSummary] = useState<AdminQueueSummary>(EMPTY_QUEUE);
  const [maintenance, setMaintenance] = useState({ isActive: false, message: '' });
  const [featureMaintenance, setFeatureMaintenance] = useState<FeatureMaintenanceConfig>({ disabledFeatureIds: [] });
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [search, setSearch] = useState('');
  const [queueFilter, setQueueFilter] = useState<'all' | 'processing' | 'failed' | 'completed'>('all');
  const [workingTransaction, setWorkingTransaction] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [statsPayload, maintenancePayload, featurePayload] = await Promise.all([
        getAdminStats(),
        getMaintenanceMode(),
        getFeatureMaintenanceConfig(),
      ]);
      setStats(statsPayload);
      setMaintenance({ isActive: !!maintenancePayload.isActive, message: maintenancePayload.message || '' });
      setFeatureMaintenance(featurePayload);
    } catch (error) {
      console.error('[AdminV2] Dashboard load failed', error);
      notify('Không thể tải dữ liệu quản trị.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const payload = await getAdminQueueJobs({
        search: search.trim() || undefined,
        status: queueFilter === 'processing' ? 'all' : queueFilter,
        timeScope: 'today',
        limit: 60,
      });
      const jobs = queueFilter === 'processing'
        ? payload.jobs.filter((job) => ['queued', 'processing', 'rescuing'].includes(job.displayStatus || job.status))
        : payload.jobs;
      setQueue(jobs);
      setQueueSummary(payload.summary);
    } catch (error) {
      console.error('[AdminV2] Queue load failed', error);
      notify('Không thể tải hàng đợi xử lý.', 'error');
    } finally {
      setQueueLoading(false);
    }
  }, [notify, queueFilter, search]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const pendingTransactions = useMemo(
    () => (stats?.transactions || []).filter((transaction: Transaction) => transaction.status === 'pending'),
    [stats],
  );

  const handleTransaction = async (transaction: Transaction, action: 'approve' | 'reject') => {
    setWorkingTransaction(transaction.id);
    const result = action === 'approve'
      ? await adminApproveTransaction(transaction.id)
      : await adminRejectTransaction(transaction.id);
    setWorkingTransaction(null);
    if (!result.success) {
      notify(result.error || 'Không thể cập nhật giao dịch.', 'error');
      return;
    }
    notify(action === 'approve' ? 'Đã duyệt giao dịch.' : 'Đã từ chối giao dịch.', 'success');
    await loadDashboard();
  };

  const saveSystem = async () => {
    setSaving(true);
    try {
      const [maintenanceResult, featureResult] = await Promise.all([
        saveMaintenanceMode(maintenance.isActive, maintenance.message),
        saveFeatureMaintenanceConfig(featureMaintenance),
      ]);
      if (!maintenanceResult.success || !featureResult.success) throw new Error('Không thể lưu cấu hình hệ thống.');
      notify('Đã đồng bộ cấu hình hệ thống.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể lưu cấu hình.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const reconcile = async () => {
    setReconciling(true);
    try {
      await runAdminQueueReconcile();
      notify('Đã yêu cầu hệ thống đối soát queue.', 'success');
      await loadQueue();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể đối soát queue.', 'error');
    } finally {
      setReconciling(false);
    }
  };

  const tabs = [
    { id: 'overview' as const, label: 'Tổng quan', Icon: Sparkles },
    { id: 'queue' as const, label: 'Queue', Icon: Activity },
    { id: 'finance' as const, label: 'Giao dịch', Icon: CircleDollarSign },
    { id: 'users' as const, label: 'User', Icon: Users },
    { id: 'system' as const, label: 'Hệ thống', Icon: Settings2 },
  ];

  return (
    <div className="v2-admin">
      <header className="v2-admin-hero">
        <div className="v2-admin-hero__top">
          <button type="button" className="v2-admin-back v2-tap" onClick={() => navigate('/profile')} aria-label="Quay lại">
            <ArrowLeft size={20} />
          </button>
          <span className="v2-admin-live"><i /> LIVE SYSTEM</span>
          <button type="button" className="v2-admin-refresh v2-tap" onClick={() => void Promise.all([loadDashboard(), loadQueue()])} aria-label="Làm mới">
            <RefreshCw size={18} className={loading || queueLoading ? 'v2-spin' : ''} />
          </button>
        </div>
        <div className="v2-admin-hero__copy">
          <span><ShieldCheck size={14} /> ADMINISTRATOR V2</span>
          <h1>Command<br /><b>Center</b></h1>
          <p>Điều phối người dùng, tài chính và toàn bộ luồng AI trong một trung tâm vận hành.</p>
        </div>
        <div className="v2-admin-orbit" aria-hidden="true"><LockKeyhole size={29} /></div>
      </header>

      <nav className="v2-admin-tabs" aria-label="Khu vực quản trị">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}
      </nav>

      {loading && !stats ? (
        <div className="v2-admin-loading"><Loader className="v2-spin" size={28} /><span>Đang đồng bộ hệ thống...</span></div>
      ) : (
        <div className="v2-admin-content">
          {tab === 'overview' && (
            <>
              <section className="v2-admin-kpis">
                <article data-tone="violet"><Users size={18} /><span>Người dùng</span><strong>{stats?.dashboard.usersTotal || 0}</strong><small>+{stats?.dashboard.newUsersToday || 0} hôm nay</small></article>
                <article data-tone="pink"><ImageIcon size={18} /><span>Tác phẩm</span><strong>{stats?.dashboard.imagesTotal || 0}</strong><small>+{stats?.dashboard.imagesToday || 0} hôm nay</small></article>
                <article data-tone="amber"><CircleDollarSign size={18} /><span>Chờ duyệt</span><strong>{pendingTransactions.length}</strong><small>giao dịch</small></article>
                <article data-tone="cyan"><Activity size={18} /><span>Đang chạy</span><strong>{queueSummary.queued + queueSummary.processing}</strong><small>{queueSummary.failed} lỗi</small></article>
              </section>

              <section className="v2-admin-panel v2-admin-panel--attention">
                <div className="v2-admin-section-title"><span><AlertTriangle size={18} /></span><div><h2>Cần xử lý</h2><p>Những điểm cần quản trị viên chú ý ngay.</p></div></div>
                <button type="button" onClick={() => setTab('finance')}><span><b>{pendingTransactions.length}</b> giao dịch nạp đang chờ</span><ChevronRight size={18} /></button>
                <button type="button" onClick={() => setTab('queue')}><span><b>{queueSummary.failed}</b> job lỗi · <b>{queueSummary.overduePolls}</b> poll quá hạn</span><ChevronRight size={18} /></button>
              </section>

              <section className="v2-admin-panel">
                <div className="v2-admin-section-title"><span><Gem size={18} /></span><div><h2>Top công cụ AI</h2><p>Dữ liệu sử dụng {stats?.dashboard.lookbackDays || 0} ngày gần nhất.</p></div></div>
                <div className="v2-admin-usage">
                  {(stats?.dashboard.aiUsage || []).slice(0, 5).map((row) => (
                    <div key={row.feature}><span><b>{row.feature}</b><small>{row.count} lượt</small></span><strong>{row.vcoins.toLocaleString('vi-VN')} VC</strong></div>
                  ))}
                  {(stats?.dashboard.aiUsage || []).length === 0 && <p className="v2-admin-empty">Chưa có dữ liệu sử dụng.</p>}
                </div>
              </section>
            </>
          )}

          {tab === 'queue' && (
            <section className="v2-admin-panel">
              <div className="v2-admin-section-title"><span><Activity size={18} /></span><div><h2>Live Queue</h2><p>Theo dõi job hôm nay theo thời gian thực.</p></div></div>
              <div className="v2-admin-queue-stats">
                <span><small>Chờ</small><b>{queueSummary.queued}</b></span>
                <span><small>Chạy</small><b>{queueSummary.processing}</b></span>
                <span className="is-danger"><small>Lỗi</small><b>{queueSummary.failed}</b></span>
              </div>
              <div className="v2-admin-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email, user hoặc job ID" /><button type="button" onClick={() => void loadQueue()}><RefreshCw size={17} /></button></div>
              <div className="v2-admin-filters">
                {(['all', 'processing', 'failed', 'completed'] as const).map((filter) => <button key={filter} type="button" className={queueFilter === filter ? 'is-active' : ''} onClick={() => setQueueFilter(filter)}>{filter === 'all' ? 'Tất cả' : statusLabel(filter)}</button>)}
              </div>
              <button type="button" className="v2-admin-reconcile" onClick={() => void reconcile()} disabled={reconciling}>{reconciling ? <Loader className="v2-spin" size={17} /> : <RefreshCw size={17} />} Đối soát queue</button>
              <div className="v2-admin-jobs">
                {queueLoading ? <div className="v2-admin-inline-loading"><Loader className="v2-spin" /></div> : queue.map((job) => {
                  const status = job.displayStatus || job.status;
                  return <article key={job.id}>
                    <div className="v2-admin-job-icon">{job.assetType === 'video' ? <Video size={18} /> : <ImageIcon size={18} />}</div>
                    <div><strong>{job.toolName || (job.assetType === 'video' ? 'Tạo video AI' : 'Tạo ảnh AI')}</strong><span>{job.userEmail || job.userName || job.userId}</span><small>{job.queueStage || 'waiting'} · {Math.round(job.progress || 0)}%</small></div>
                    <em data-status={status}>{statusLabel(status)}</em>
                  </article>;
                })}
                {!queueLoading && queue.length === 0 && <p className="v2-admin-empty">Không có job phù hợp.</p>}
              </div>
            </section>
          )}

          {tab === 'finance' && (
            <section className="v2-admin-panel">
              <div className="v2-admin-section-title"><span><CircleDollarSign size={18} /></span><div><h2>Giao dịch</h2><p>Duyệt thanh toán và kiểm tra dòng tiền.</p></div></div>
              <div className="v2-admin-transactions">
                {(stats?.transactions || []).map((transaction: Transaction) => (
                  <article key={transaction.id}>
                    <div className="v2-admin-transaction__head"><div><strong>{transaction.userName || transaction.userEmail || 'Người dùng'}</strong><span>{transaction.userEmail}</span></div><em data-status={transaction.status}>{transaction.status}</em></div>
                    <div className="v2-admin-transaction__amount"><strong>{Number(transaction.amount || transaction.price || 0).toLocaleString('vi-VN')}đ</strong><span><Gem size={14} /> {transaction.vcoin_received.toLocaleString('vi-VN')} Vcoin</span></div>
                    <small>{transaction.order_code || transaction.code || transaction.id.slice(0, 12)} · {formatTime(transaction.createdAt)}</small>
                    {transaction.status === 'pending' && <div className="v2-admin-transaction__actions">
                      <button type="button" onClick={() => void handleTransaction(transaction, 'reject')} disabled={workingTransaction === transaction.id}><X size={16} /> Từ chối</button>
                      <button type="button" onClick={() => void handleTransaction(transaction, 'approve')} disabled={workingTransaction === transaction.id}>{workingTransaction === transaction.id ? <Loader className="v2-spin" size={16} /> : <Check size={16} />} Duyệt</button>
                    </div>}
                  </article>
                ))}
                {(stats?.transactions || []).length === 0 && <p className="v2-admin-empty">Chưa có giao dịch.</p>}
              </div>
            </section>
          )}

          {tab === 'users' && (
            <section className="v2-admin-panel">
              <div className="v2-admin-section-title"><span><Users size={18} /></span><div><h2>Người dùng</h2><p>Tài khoản hoạt động gần đây.</p></div></div>
              <div className="v2-admin-users">
                {(stats?.usersList || []).map((user) => (
                  <article key={user.id}>
                    <div className="v2-admin-avatar">{user.avatar ? <img src={user.avatar} alt="" /> : (user.username || user.email || 'U').slice(0, 1).toUpperCase()}</div>
                    <div><strong>{user.username || user.email?.split('@')[0] || 'Người dùng'}</strong><span>{user.email}</span><small><Clock3 size={12} /> {formatTime(user.lastActive)}</small></div>
                    <div className="v2-admin-user-balance"><Gem size={13} /><b>{Number(user.vcoin_balance || 0).toLocaleString('vi-VN')}</b><em>{user.role}</em></div>
                  </article>
                ))}
                {(stats?.usersList || []).length === 0 && <p className="v2-admin-empty">Chưa có người dùng.</p>}
              </div>
            </section>
          )}

          {tab === 'system' && (
            <>
              <section className="v2-admin-panel">
                <div className="v2-admin-section-title"><span><Settings2 size={18} /></span><div><h2>Trạng thái hệ thống</h2><p>Cấu hình bảo trì toàn ứng dụng.</p></div></div>
                <button type="button" className={`v2-admin-switch${maintenance.isActive ? ' is-on' : ''}`} onClick={() => setMaintenance((current) => ({ ...current, isActive: !current.isActive }))}><span><b>{maintenance.isActive ? 'Đang bảo trì' : 'Hệ thống hoạt động'}</b><small>{maintenance.isActive ? 'Người dùng tạm thời bị giới hạn' : 'Mọi dịch vụ đang mở'}</small></span><i /></button>
                <textarea rows={3} value={maintenance.message} onChange={(event) => setMaintenance((current) => ({ ...current, message: event.target.value }))} placeholder="Thông báo bảo trì..." />
              </section>
              <section className="v2-admin-panel">
                <div className="v2-admin-section-title"><span><LockKeyhole size={18} /></span><div><h2>Khóa từng tính năng</h2><p>Admin vẫn có thể truy cập để kiểm tra.</p></div></div>
                <div className="v2-admin-features">
                  {APP_CONFIG.main_features.map((feature) => {
                    const isDisabled = featureMaintenance.disabledFeatureIds.includes(feature.id);
                    return <button key={feature.id} type="button" className={isDisabled ? 'is-locked' : ''} onClick={() => setFeatureMaintenance((current) => ({ ...current, disabledFeatureIds: isDisabled ? current.disabledFeatureIds.filter((id) => id !== feature.id) : [...current.disabledFeatureIds, feature.id] }))}><span><b>{feature.name.vi}</b><small>{feature.id}</small></span><em>{isDisabled ? 'Bảo trì' : 'Đang mở'}</em></button>;
                  })}
                </div>
                <button type="button" className="v2-admin-save" onClick={() => void saveSystem()} disabled={saving}>{saving ? <Loader className="v2-spin" size={18} /> : <ShieldCheck size={18} />} Lưu & đồng bộ hệ thống</button>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
