import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Coins,
  Image as ImageIcon,
  Loader,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Users,
  Video,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/NotificationSystem';
import {
  adminApproveTransaction,
  adminRejectTransaction,
  getAdminQueueJobDetail,
  getAdminQueueJobs,
  getAdminStats,
  getMaintenanceMode,
  runAdminQueueReconcile,
  saveMaintenanceMode,
  stopAdminQueueJob,
} from '../services/economyService';
import type { AdminQueueInputMedia, AdminQueueJob, AdminQueueJobDetail, AdminQueueMediaSection, AdminQueueSummary, Transaction } from '../types';

type AdminTab = 'overview' | 'queue' | 'transactions' | 'users';
type AdminStatsPayload = Awaited<ReturnType<typeof getAdminStats>>;
type AdminUsageRow = {
  feature: string;
  count: number;
  vcoins: number;
  revenue: number;
};
type AdminUserRow = {
  id: string;
  username?: string;
  email?: string;
  avatar?: string;
  vcoin_balance?: number;
  role?: string;
  created_at?: string;
  isVip?: boolean;
  lastActive?: string;
  usageCount?: number;
};

const EMPTY_QUEUE_SUMMARY: AdminQueueSummary = {
  total: 0,
  queued: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  overduePolls: 0,
  untouchedQueued: 0,
  stalledPreDispatch: 0,
};

const formatDateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString('vi-VN', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Chưa cập nhật';

const getQueueStatus = (job: AdminQueueJob) => job.displayStatus || job.status;

const getQueueStatusLabel = (status?: string) => {
  switch (status) {
    case 'queued':
      return 'Đang chờ';
    case 'processing':
      return 'Đang xử lý';
    case 'rescuing':
      return 'Đang cứu kết quả';
    case 'failed':
      return 'Thất bại';
    case 'completed':
      return 'Hoàn thành';
    default:
      return 'Hoàn thành';
  }
};

const getQueuePlatformLabel = (platform?: string) => {
  switch (platform) {
    case 'mobile':
      return 'Điện thoại';
    case 'desktop':
      return 'Máy tính';
    default:
      return 'Không rõ';
  }
};

const getQueueStageLabel = (stage?: string) => {
  switch (stage) {
    case 'queued':
      return 'Đã vào hàng đợi';
    case 'preparing':
      return 'Đang chuẩn bị';
    case 'uploading_refs':
      return 'Đang tải ảnh tham chiếu';
    case 'synthesizing_prompt':
      return 'Đang xử lý prompt text + role metadata';
    case 'building_payload':
      return 'Đang dựng payload';
    case 'dispatching':
      return 'Đang gửi provider';
    case 'submitted':
      return 'Provider đã nhận job';
    case 'polling':
      return 'Đang chờ provider';
    case 'verifying_output':
      return 'Đang hậu kiểm';
    case 'completed':
      return 'Hoàn thành';
    case 'failed':
      return 'Thất bại';
    default:
      return stage || '-';
  }
};

const getQueueStatusTone = (status?: string) => {
  switch (status) {
    case 'failed':
      return 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300';
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'processing':
      return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300';
    case 'rescuing':
      return 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300';
    default:
      return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  }
};

const getQueueMediaSectionTone = (key: AdminQueueMediaSection['key']) => {
  switch (key) {
    case 'result':
      return 'border-emerald-200/70 dark:border-emerald-500/20';
    case 'sample':
      return 'border-fuchsia-200/70 dark:border-fuchsia-500/20';
    default:
      return 'border-cyan-200/70 dark:border-cyan-500/20';
  }
};

const getQueueMediaMeta = (media: AdminQueueInputMedia) => `${media.kind} · ${media.sourceType}${media.userProvided === false ? ' · hệ thống' : ''}`;

const getVertexTaskLabel = (task?: string) => {
  switch (task) {
    case 'image_prompt_compression':
      return 'Vertex nén prompt';
    case 'image_prompt_synthesis':
      return 'Vertex tổng hợp prompt';
    default:
      return task || 'Vertex';
  }
};

const getVertexStatusTone = (status?: string) => {
  switch (status) {
    case 'error':
      return 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300';
    case 'warning':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
    default:
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
  }
};

const getPaymentStatusLabel = (status?: string) => {
  switch (status) {
    case 'pending':
      return 'Chờ duyệt';
    case 'paid':
      return 'Đã thanh toán';
    case 'cancelled':
      return 'Đã hủy';
    case 'failed':
      return 'Thất bại';
    default:
      return status || 'Không rõ';
  }
};

const getRoleLabel = (role?: string) => (role === 'admin' ? 'Quản trị viên' : 'Người dùng');

const getUserLastSeen = (user: AdminUserRow) => {
  if (!user.lastActive) return 'Chưa online';
  const diffMins = Math.floor((Date.now() - new Date(user.lastActive).getTime()) / 60000);
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${Math.floor(diffHours / 24)} ngày trước`;
};

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-[28px] border border-gray-100 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-[#18181B] ${className}`}>
    {children}
  </div>
);

export function AdminView() {
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const { notify, confirm } = useNotification();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminStatsPayload | null>(null);
  const [queueJobs, setQueueJobs] = useState<AdminQueueJob[]>([]);
  const [queueSummary, setQueueSummary] = useState<AdminQueueSummary>(EMPTY_QUEUE_SUMMARY);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [stoppingQueueJobId, setStoppingQueueJobId] = useState<string | null>(null);
  const [selectedQueueJobId, setSelectedQueueJobId] = useState<string | null>(null);
  const [selectedQueueJobDetail, setSelectedQueueJobDetail] = useState<AdminQueueJobDetail | null>(null);
  const [loadingQueueDetail, setLoadingQueueDetail] = useState(false);
  const [queuePromptExpanded, setQueuePromptExpanded] = useState(false);
  const [actingTransactionId, setActingTransactionId] = useState<string | null>(null);
  const [queueStatusFilter, setQueueStatusFilter] = useState<'all' | 'processing' | 'failed' | 'completed'>('all');
  const [queueAssetFilter, setQueueAssetFilter] = useState<'all' | 'image' | 'video'>('all');
  const [queueTimeScope, setQueueTimeScope] = useState<'today' | 'all'>('today');
  const [queueSearch, setQueueSearch] = useState('');
  const [queueStuckOnly, setQueueStuckOnly] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [maintenance, setMaintenance] = useState({ isActive: false, message: '' });
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [statsPayload, maintenancePayload] = await Promise.all([
        getAdminStats(),
        getMaintenanceMode(),
      ]);
      setStats(statsPayload);
      setMaintenance({
        isActive: !!maintenancePayload.isActive,
        message: maintenancePayload.message || '',
      });
    } catch (error) {
      console.error('[MobileAdmin] Failed to load stats', error);
      notify('Không thể tải tổng quan admin.', 'error');
    } finally {
      setLoadingStats(false);
    }
  }, [notify]);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const payload = await getAdminQueueJobs({
        search: queueSearch.trim() || undefined,
        status: queueStatusFilter === 'processing' ? 'all' : queueStatusFilter,
        assetType: queueAssetFilter,
        timeScope: queueTimeScope,
        stuckOnly: queueStuckOnly,
        limit: 80,
      });

      const jobs = payload.jobs.filter((job) => {
        const status = getQueueStatus(job);
        if (queueStatusFilter === 'all') return true;
        if (queueStatusFilter === 'processing') {
          return status === 'processing' || status === 'queued' || status === 'rescuing';
        }
        if (queueStatusFilter === 'completed') {
          return status === 'completed';
        }
        return status === 'failed';
      });

      setQueueJobs(jobs);
      setQueueSummary(payload.summary || EMPTY_QUEUE_SUMMARY);
    } catch (error) {
      console.error('[MobileAdmin] Failed to load queue', error);
      notify('Không thể tải queue job.', 'error');
    } finally {
      setLoadingQueue(false);
    }
  }, [notify, queueAssetFilter, queueSearch, queueStatusFilter, queueStuckOnly, queueTimeScope]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const pendingTransactions = useMemo(
    () => ((stats?.transactions || []) as Transaction[]).filter((item: Transaction) => item.status === 'pending'),
    [stats],
  );

  const aiUsageRows = useMemo(
    () => ((stats?.dashboard.aiUsage || []) as AdminUsageRow[]).slice(0, 6),
    [stats],
  );

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return ((stats?.usersList || []) as AdminUserRow[])
      .filter((entry: AdminUserRow) => {
        if (!query) return true;
        return (
          (entry.username || '').toLowerCase().includes(query) ||
          (entry.email || '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => Number(b.vcoin_balance || 0) - Number(a.vcoin_balance || 0))
      .slice(0, 25);
  }, [stats, userSearch]);
  const selectedQueuePrompt = selectedQueueJobDetail?.prompt || selectedQueueJobDetail?.job.prompt || 'Không có prompt';
  const orderedQueueMediaSections = [...(selectedQueueJobDetail?.mediaSections || [])].sort((left, right) => {
    const order = { result: 0, reference: 1, sample: 2 };
    return order[left.key] - order[right.key];
  });

  if (userRole !== 'admin') {
    return <Navigate to="/home" replace />;
  }

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadQueue()]);
    setRefreshing(false);
  };

  const approveTransaction = (tx: Transaction) =>
    confirm({
      title: 'Duyệt giao dịch?',
      message: `Cộng ${tx.vcoin_received} Vcoin cho ${tx.userName || tx.userEmail || 'người dùng'}?`,
      confirmText: 'Duyệt',
      cancelText: 'Hủy',
      onConfirm: async () => {
        setActingTransactionId(tx.id);
        const result = await adminApproveTransaction(tx.id);
        setActingTransactionId(null);
        if (!result.success) {
          notify(result.error || 'Duyệt thất bại.', 'error');
          return;
        }
        await loadStats();
        notify('Đã duyệt giao dịch.', 'success');
      },
    });

  const rejectTransaction = (tx: Transaction) =>
    confirm({
      title: 'Từ chối giao dịch?',
      message: `Bạn chắc chắn muốn từ chối giao dịch ${tx.order_code || tx.id}?`,
      confirmText: 'Từ chối',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        setActingTransactionId(tx.id);
        const result = await adminRejectTransaction(tx.id);
        setActingTransactionId(null);
        if (!result.success) {
          notify(result.error || 'Từ chối thất bại.', 'error');
          return;
        }
        await loadStats();
        notify('Đã từ chối giao dịch.', 'success');
      },
    });

  const reconcileQueue = () =>
    confirm({
      title: 'Đồng bộ lại queue?',
      message: 'Công cụ này sẽ reset job kẹt và đồng bộ lại queue.',
      confirmText: 'Chạy ngay',
      cancelText: 'Hủy',
      onConfirm: async () => {
        setReconciling(true);
        try {
          const payload = await runAdminQueueReconcile();
          await loadQueue();
          if (selectedQueueJobId) {
            const detail = await getAdminQueueJobDetail(selectedQueueJobId);
            setSelectedQueueJobDetail(detail);
          }
          const resetQueued = Number(payload?.resetSummary?.resetQueued || 0);
          const resetProcessing = Number(payload?.resetSummary?.resetProcessing || 0);
          const resetStalledPreDispatch = Number(payload?.resetSummary?.resetStalledPreDispatch || 0);
          if (payload?.skipped && payload?.reason === 'dedicated_worker_mode') {
            notify(`Reconcile đã reset ${resetQueued}/${resetProcessing}/${resetStalledPreDispatch}. Worker riêng sẽ xử lý tiếp.`, 'success');
          } else {
            notify(`Đã reconcile queue: ${resetQueued}/${resetProcessing}/${resetStalledPreDispatch}.`, 'success');
          }
        } catch (error) {
          console.error('[MobileAdmin] Queue reconcile failed', error);
          notify('Queue reconcile thất bại.', 'error');
        } finally {
          setReconciling(false);
        }
      },
    });

  const openQueueDetail = async (jobId: string) => {
    setSelectedQueueJobId(jobId);
    setSelectedQueueJobDetail(null);
    setQueuePromptExpanded(false);
    setLoadingQueueDetail(true);
    try {
      const detail = await getAdminQueueJobDetail(jobId);
      setSelectedQueueJobDetail(detail);
    } catch (error) {
      console.error('[MobileAdmin] Failed to load queue detail', error);
      notify('Không thể tải chi tiết queue job.', 'error');
    } finally {
      setLoadingQueueDetail(false);
    }
  };

  const closeQueueDetail = () => {
    setSelectedQueueJobId(null);
    setSelectedQueueJobDetail(null);
    setQueuePromptExpanded(false);
  };

  const stopQueueJob = (job: AdminQueueJob) =>
    confirm({
      title: 'Dừng tiến trình?',
      message: 'Queue sẽ ngừng poll/rescue và đánh dấu job là thất bại.',
      confirmText: 'Dừng ngay',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        setStoppingQueueJobId(job.id);
        try {
          const result = await stopAdminQueueJob(job.id);
          await loadQueue();
          if (selectedQueueJobId === job.id) {
            const detail = await getAdminQueueJobDetail(job.id);
            setSelectedQueueJobDetail(detail);
          }
          notify(result?.refunded ? 'Đã dừng job và hoàn lại Vcoin.' : 'Đã dừng job.', 'success');
        } catch (error: any) {
          console.error('[MobileAdmin] Stop queue job failed', error);
          notify(error?.message || 'Không thể dừng job.', 'error');
        } finally {
          setStoppingQueueJobId(null);
        }
      },
    });

  const saveMaintenance = async () => {
    setSavingMaintenance(true);
    const result = await saveMaintenanceMode(maintenance.isActive, maintenance.message);
    setSavingMaintenance(false);
    if (!result.success) {
      notify('Không thể lưu bảo trì.', 'error');
      return;
    }
    notify('Đã lưu trạng thái bảo trì.', 'success');
  };

  return (
    <div className="min-h-screen bg-[#F6F6F8] pb-10 dark:bg-[#09090B]">
      <div className="sticky top-0 z-40 border-b border-gray-100 bg-[#F6F6F8]/95 px-4 pb-4 pt-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-[#09090B]/95">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => navigate('/profile')}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => void refreshAll()}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-white"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-amber-400 via-pink-500 to-fuchsia-600 text-white shadow-lg shadow-pink-500/20">
              <Shield className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-pink-500">Quản trị mobile</p>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Trung tâm quản trị</h1>
              <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                Quản trị nhanh cho {user?.username || user?.email || 'admin'} ngay trong app.
              </p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {(['overview', 'queue', 'transactions', 'users'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap rounded-2xl px-4 py-2.5 text-xs font-bold ${
                  activeTab === tab
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                    : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {tab === 'overview'
                  ? 'Tổng quan'
                  : tab === 'queue'
                    ? 'Hàng đợi'
                    : tab === 'transactions'
                      ? 'Giao dịch'
                      : 'Người dùng'}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4 px-4 py-4">
        {activeTab === 'overview' && (
          loadingStats ? (
            <div className="flex justify-center py-20"><Loader className="h-8 w-8 animate-spin text-gray-300" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-500">Người dùng</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats?.dashboard.usersTotal || 0}</div></Card>
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500">Mới hôm nay</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats?.dashboard.newUsersToday || 0}</div></Card>
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-fuchsia-500">Ảnh/video</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats?.dashboard.imagesTotal || 0}</div></Card>
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500">Chờ nạp tiền</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{pendingTransactions.length}</div></Card>
              </div>

              <Card>
                <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Activity className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Cần xử lý ngay</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Nạp tiền chờ duyệt và queue đang gặp vấn đề</p></div></div>
                <div className="space-y-3">
                  <button onClick={() => setActiveTab('transactions')} className="flex w-full items-center justify-between rounded-[24px] bg-gray-50 px-4 py-4 text-left dark:bg-zinc-800/80"><div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Nạp tiền</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{pendingTransactions.length} giao dịch đang chờ duyệt</div></div><Wallet className="h-4 w-4 text-gray-400" /></button>
                  <button onClick={() => setActiveTab('queue')} className="flex w-full items-center justify-between rounded-[24px] bg-gray-50 px-4 py-4 text-left dark:bg-zinc-800/80"><div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Hàng đợi</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{queueSummary.failed} lỗi, {queueSummary.processing + queueSummary.queued} job đang chạy</div></div><AlertTriangle className="h-4 w-4 text-gray-400" /></button>
                </div>
              </Card>

              <Card>
                <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Coins className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Thống kê sử dụng</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Top công cụ được sử dụng nhiều nhất</p></div></div>
                <div className="space-y-3">{aiUsageRows.length === 0 ? <div className="rounded-[24px] bg-gray-50 px-4 py-5 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Chưa có dữ liệu sử dụng.</div> : aiUsageRows.map((row) => <div key={row.feature} className="flex items-center justify-between rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80"><div className="min-w-0"><div className="truncate text-sm font-bold text-gray-900 dark:text-white">{row.feature}</div><div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">{row.count} lượt</div></div><div className="text-right"><div className="text-sm font-black text-pink-500">{row.vcoins} VC</div><div className="text-[11px] text-emerald-500">{new Intl.NumberFormat('vi-VN').format(row.revenue)}đ</div></div></div>)}</div>
              </Card>

              <Card>
                <div className="mb-4 flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Settings2 className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Bảo trì hệ thống</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Bật tắt maintenance và sửa thông báo</p></div></div><button onClick={() => setMaintenance((m) => ({ ...m, isActive: !m.isActive }))} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${maintenance.isActive ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>{maintenance.isActive ? 'Đang bật' : 'Đang tắt'}</button></div>
                <textarea value={maintenance.message} onChange={(e) => setMaintenance((m) => ({ ...m, message: e.target.value }))} rows={4} className="w-full rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-800 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" placeholder="Nhập thông báo bảo trì..." />
                <button onClick={() => void saveMaintenance()} disabled={savingMaintenance} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[24px] bg-gray-900 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">{savingMaintenance ? <Loader className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}Lưu bảo trì</button>
              </Card>
            </>
          )
        )}

        {activeTab === 'queue' && (
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800">
                  <Activity className="h-5 w-5 text-gray-700 dark:text-white" />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-900 dark:text-white">Theo dõi hàng đợi</h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Tìm job theo email hoặc job id, mở chi tiết và xử lý ngay trên mobile.</p>
                </div>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2">
              {[
                ['Đang chạy', queueSummary.processing + queueSummary.queued],
                ['Lỗi', queueSummary.failed],
                ['Xong', queueSummary.completed],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[22px] bg-gray-50 px-3 py-3 dark:bg-zinc-800/80">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">{label}</div>
                  <div className="mt-1 text-xl font-black text-gray-900 dark:text-white">{value}</div>
                </div>
              ))}
            </div>

            <div className="mb-3 flex items-center gap-3 rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
              <Search className="h-4 w-4 text-gray-400 dark:text-zinc-500" />
              <input
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                placeholder="Tìm theo email hoặc job id"
                className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-zinc-500"
              />
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
              {(['today', 'all'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setQueueTimeScope(key)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${queueTimeScope === key ? (key === 'today' ? 'bg-cyan-500 text-white' : 'bg-pink-500 text-white') : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}
                >
                  {key === 'today' ? 'Job hôm nay' : 'Tất cả job'}
                </button>
              ))}
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
              {(['all', 'processing', 'failed', 'completed'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setQueueStatusFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${queueStatusFilter === key ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}
                >
                  {key === 'all' ? 'Tất cả' : key === 'processing' ? 'Đang chạy' : key === 'failed' ? 'Lỗi' : 'Hoàn thành'}
                </button>
              ))}
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
              {(['all', 'image', 'video'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setQueueAssetFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${queueAssetFilter === key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}
                >
                  {key === 'image' ? 'Ảnh' : key === 'video' ? 'Video' : 'Tất cả'}
                </button>
              ))}
              <button
                onClick={() => setQueueStuckOnly((current) => !current)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${queueStuckOnly ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}
              >
                {queueStuckOnly ? 'Chỉ job kẹt' : 'Hiện cả job thường'}
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => void loadQueue()}
                disabled={loadingQueue}
                className="flex items-center justify-center gap-2 rounded-[22px] bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 disabled:opacity-60 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {loadingQueue ? <Loader className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Làm mới
              </button>
              <button
                onClick={reconcileQueue}
                disabled={reconciling}
                className="flex items-center justify-center gap-2 rounded-[22px] bg-pink-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {reconciling ? <Loader className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Reconcile
              </button>
            </div>

            {loadingQueue ? (
              <div className="flex justify-center py-12"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div>
            ) : queueJobs.length === 0 ? (
              <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Không có queue job phù hợp.</div>
            ) : (
              <div className="space-y-3">
                {queueJobs.map((job) => {
                  const status = getQueueStatus(job);
                  const canStop = ['queued', 'processing', 'rescuing'].includes(status);
                  const lastLogMessage = job.lastLogMessage || (job.queueLogs && job.queueLogs.length > 0 ? job.queueLogs[job.queueLogs.length - 1]?.message : '') || job.error || formatDateTime(job.updatedAt);
                  return (
                    <div key={job.id} className="rounded-[24px] bg-gray-50 p-4 dark:bg-zinc-800/80">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-gray-900 dark:text-white">{job.userName || job.userEmail || 'Người dùng không xác định'}</div>
                          <div className="mt-1 truncate text-[11px] text-gray-500 dark:text-zinc-400">{job.userEmail || job.userId}</div>
                        </div>
                        <div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getQueueStatusTone(status)}`}>{getQueueStatusLabel(status)}</div>
                      </div>

                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {job.assetType === 'video' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-600 dark:bg-purple-500/10 dark:text-purple-300"><Video className="h-3 w-3" />Video</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><ImageIcon className="h-3 w-3" />Ảnh</span>
                        )}
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-600 dark:bg-zinc-900 dark:text-zinc-300">{getQueuePlatformLabel(job.clientPlatform)}</span>
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400">{Math.round(job.progress || 0)}%</span>
                        {job.isStuck ? <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">STUCK</span> : null}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-gray-400 dark:text-zinc-500">Job</div>
                          <div className="mt-1 font-mono text-sm text-gray-900 dark:text-white">{job.id.slice(0, 12)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400 dark:text-zinc-500">Stage</div>
                          <div className="mt-1 text-sm text-gray-900 dark:text-white">{getQueueStageLabel(job.queueStage)}</div>
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-gray-700 dark:text-zinc-200">{job.toolName || (job.assetType === 'video' ? 'Video' : 'Ảnh')}</div>
                      <div className="mt-3 text-[11px] text-gray-500 dark:text-zinc-400">{lastLogMessage}</div>

                      <div className="mt-4 flex gap-2">
                        <button onClick={() => void openQueueDetail(job.id)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gray-900 px-4 py-3 text-sm font-bold text-white dark:bg-white dark:text-black">
                          Xem chi tiết
                        </button>
                        {canStop ? (
                          <button
                            onClick={() => stopQueueJob(job)}
                            disabled={stoppingQueueJobId === job.id}
                            className="flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                          >
                            {stoppingQueueJobId === job.id ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Dừng
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'transactions' && (
          <Card>
            <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Wallet className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Giao dịch nạp tiền</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Duyệt giao dịch chờ ngay trên mobile</p></div></div>
            {loadingStats ? <div className="flex justify-center py-12"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div> : (stats?.transactions || []).length === 0 ? <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Chưa có giao dịch nào.</div> : <div className="space-y-3">{((stats?.transactions || []) as Transaction[]).slice(0, 20).map((tx: Transaction) => <div key={tx.id} className="rounded-[24px] bg-gray-50 p-4 dark:bg-zinc-800/80"><div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{tx.userName || tx.userEmail || 'Người dùng không xác định'}</div><div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{tx.userEmail || tx.userId}</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${tx.status === 'pending' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : tx.status === 'paid' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'}`}>{getPaymentStatusLabel(tx.status)}</div></div><div className="grid grid-cols-2 gap-3 text-xs"><div><div className="text-gray-400 dark:text-zinc-500">Số tiền</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{new Intl.NumberFormat('vi-VN').format(Number(tx.amount || 0))}đ</div></div><div><div className="text-gray-400 dark:text-zinc-500">Vcoin</div><div className="mt-1 text-sm font-bold text-pink-500">{tx.vcoin_received} VC</div></div></div><div className="mt-3 text-[11px] text-gray-500 dark:text-zinc-400">{formatDateTime(tx.createdAt)}{tx.order_code ? ` • ${tx.order_code}` : ''}</div>{tx.status === 'pending' ? <div className="mt-4 flex gap-2"><button onClick={() => approveTransaction(tx)} disabled={actingTransactionId === tx.id} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{actingTransactionId === tx.id ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Duyệt</button><button onClick={() => rejectTransaction(tx)} disabled={actingTransactionId === tx.id} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{actingTransactionId === tx.id ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}Từ chối</button></div> : null}</div>)}</div>}
          </Card>
        )}

        {activeTab === 'users' && (
          <Card>
            <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Users className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Người dùng</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Tìm người dùng, xem số dư, vai trò và hoạt động</p></div></div>
            <div className="mb-4 flex items-center gap-3 rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"><Search className="h-4 w-4 text-gray-400 dark:text-zinc-500" /><input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Tìm theo tên hoặc email" className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-zinc-500" /></div>
            {loadingStats ? <div className="flex justify-center py-12"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div> : filteredUsers.length === 0 ? <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Không tìm thấy người dùng.</div> : <div className="space-y-3">{filteredUsers.map((entry: AdminUserRow) => <div key={entry.id} className="rounded-[24px] bg-gray-50 p-4 dark:bg-zinc-800/80"><div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{entry.username || entry.email}</div><div className="mt-1 truncate text-[11px] text-gray-500 dark:text-zinc-400">{entry.email}</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${entry.role === 'admin' ? 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300' : 'bg-gray-200 text-gray-700 dark:bg-zinc-700 dark:text-zinc-200'}`}>{getRoleLabel(entry.role)}</div></div><div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900"><div className="text-gray-400 dark:text-zinc-500">Số dư</div><div className="mt-1 text-sm font-bold text-amber-600 dark:text-amber-300">{Number(entry.vcoin_balance || 0).toLocaleString()} VC</div></div><div className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900"><div className="text-gray-400 dark:text-zinc-500">Lượt dùng</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{entry.usageCount || 0}</div></div></div><div className="mt-3 text-[11px] text-gray-500 dark:text-zinc-400">Hoạt động gần nhất: {getUserLastSeen(entry)}</div></div>)}</div>}
          </Card>
        )}

        {selectedQueueJobId ? (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
            <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-[32px] bg-white dark:bg-[#18181B]">
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 dark:border-zinc-800">
                <div>
                  <div className="text-base font-black text-gray-900 dark:text-white">Chi tiết Queue Job</div>
                  <div className="mt-1 text-[11px] font-mono text-gray-500 dark:text-zinc-400">{selectedQueueJobId}</div>
                </div>
                <button onClick={closeQueueDetail} className="rounded-full bg-gray-100 p-2 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[calc(88vh-84px)] overflow-y-auto px-4 py-4">
                {loadingQueueDetail ? (
                  <div className="flex justify-center py-16"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div>
                ) : !selectedQueueJobDetail ? (
                  <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Không thể tải chi tiết queue job.</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Trạng thái</div>
                        <div className={`mt-2 inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold ${getQueueStatusTone(getQueueStatus(selectedQueueJobDetail.job))}`}>{getQueueStatusLabel(getQueueStatus(selectedQueueJobDetail.job))}</div>
                        <div className="mt-2 text-sm text-gray-900 dark:text-white">{getQueueStageLabel(selectedQueueJobDetail.job.queueStage)}</div>
                      </div>
                      <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Tiến trình</div>
                        <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{Math.round(selectedQueueJobDetail.job.progress || 0)}%</div>
                        <div className="mt-3 h-2 rounded-full bg-gray-200 dark:bg-zinc-900">
                          <div className={`h-full rounded-full ${getQueueStatus(selectedQueueJobDetail.job) === 'failed' ? 'bg-red-500' : getQueueStatus(selectedQueueJobDetail.job) === 'completed' ? 'bg-emerald-500' : 'bg-cyan-500'}`} style={{ width: `${Math.max(0, Math.min(100, selectedQueueJobDetail.job.progress || 0))}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-gray-900 dark:text-white">Prompt</div>
                          <div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{selectedQueuePrompt.length.toLocaleString('vi-VN')} ký tự</div>
                        </div>
                        {selectedQueuePrompt.length > 220 ? (
                          <button onClick={() => setQueuePromptExpanded((current) => !current)} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-gray-700 dark:bg-zinc-900 dark:text-zinc-200">
                            {queuePromptExpanded ? 'Thu gọn' : 'Xem hết'}
                          </button>
                        ) : null}
                      </div>
                      <div className={`whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-zinc-200 ${queuePromptExpanded ? '' : 'line-clamp-4'}`}>{selectedQueuePrompt}</div>
                    </div>

                    <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                      <div className="mb-3 text-sm font-black text-gray-900 dark:text-white">Tóm tắt nhanh</div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {[
                          ['User', selectedQueueJobDetail.job.userName || 'Unknown'],
                          ['Email', selectedQueueJobDetail.job.userEmail || '-'],
                          ['Thiết bị', getQueuePlatformLabel(selectedQueueJobDetail.job.clientPlatform)],
                          ['Asset', selectedQueueJobDetail.job.assetType],
                          ['Queue Kind', selectedQueueJobDetail.job.queueKind || '-'],
                          ['Provider Job', selectedQueueJobDetail.job.jobId || '-'],
                          ['Error Type', selectedQueueJobDetail.job.errorCategory || '-'],
                          ['Cập nhật', formatDateTime(selectedQueueJobDetail.job.updatedAt)],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900">
                            <div className="text-gray-400 dark:text-zinc-500">{label}</div>
                            <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white break-words">{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedQueueJobDetail.runtimeConfig ? (
                      <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                        <div className="mb-3 text-sm font-black text-gray-900 dark:text-white">Cấu hình chạy</div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          {[
                            ['Chế độ tạo', selectedQueueJobDetail.runtimeConfig.generationMode || '-'],
                            ['Model UI', selectedQueueJobDetail.runtimeConfig.modelMode || '-'],
                            ['Model ID', selectedQueueJobDetail.runtimeConfig.modelId || '-'],
                            ['Tốc độ', selectedQueueJobDetail.runtimeConfig.speedMode || '-'],
                            ['Speed Key', selectedQueueJobDetail.runtimeConfig.speedKey || '-'],
                            ['Server', selectedQueueJobDetail.runtimeConfig.serverId || '-'],
                            ['Độ phân giải', selectedQueueJobDetail.runtimeConfig.resolution || '-'],
                            ['Tỷ lệ', selectedQueueJobDetail.runtimeConfig.aspectRatio || '-'],
                          ].map(([label, value]) => (
                            <div key={String(label)} className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900">
                              <div className="text-gray-400 dark:text-zinc-500">{label}</div>
                              <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white break-words">{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {orderedQueueMediaSections.length > 0 ? orderedQueueMediaSections.map((section) => (
                      <div key={section.key} className={`rounded-[24px] border bg-gray-50 px-4 py-4 dark:bg-zinc-800/80 ${getQueueMediaSectionTone(section.key)}`}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-gray-900 dark:text-white">{section.label}</div>
                            {section.description ? <div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{section.description}</div> : null}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-zinc-400">{section.items.length} mục</div>
                        </div>
                        <div className="space-y-3">
                          {section.items.map((media, index) => (
                            <div key={`${section.key}-${media.role}-${index}`} className="rounded-2xl bg-white p-3 dark:bg-zinc-900">
                              <div className="mb-2">
                                <div className="text-sm font-bold text-gray-900 dark:text-white">{media.label}</div>
                                <div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{getQueueMediaMeta(media)}</div>
                              </div>
                              {media.url ? (
                                media.kind === 'video' ? (
                                  <video src={media.url} controls className="max-h-72 w-full rounded-2xl bg-black" />
                                ) : (
                                  <img src={media.url} alt={media.label} className="max-h-72 w-full rounded-2xl bg-black object-contain" />
                                )
                              ) : (
                                <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-3 py-3 text-xs text-yellow-700 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-300">
                                  {media.note || 'Media quá lớn hoặc không thể render trực tiếp.'}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )) : null}

                    {(selectedQueueJobDetail.job.vertexDiagnostics || []).length > 0 ? (
                      <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-gray-900 dark:text-white">Chẩn đoán Vertex AI</div>
                            <div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">promptFeedback, finishReason, credential và project của từng lần Vertex chạy</div>
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-zinc-400">{selectedQueueJobDetail.job.vertexDiagnostics?.length || 0} dòng</div>
                        </div>
                        <div className="space-y-3">
                          {(selectedQueueJobDetail.job.vertexDiagnostics || []).map((entry, index) => (
                            <div key={`${entry.at}-${index}`} className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-bold text-gray-900 dark:text-white">{getVertexTaskLabel(entry.task)}</div>
                                  <div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{formatDateTime(entry.at)}</div>
                                </div>
                                <div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getVertexStatusTone(entry.status)}`}>{entry.status?.toUpperCase?.() || 'INFO'}</div>
                              </div>
                              <div className="mt-3 text-sm text-gray-700 dark:text-zinc-200">{entry.message}</div>
                              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                                {[
                                  ['Credential', entry.credentialName || '-'],
                                  ['Project', entry.projectId || '-'],
                                  ['Model', entry.model || '-'],
                                  ['Finish', entry.finishReasons && entry.finishReasons.length > 0 ? entry.finishReasons.join(', ') : '-'],
                                  ['Prompt Block', entry.promptFeedback?.blockReason || '-'],
                                  ['Prompt Msg', entry.promptFeedback?.blockReasonMessage || '-'],
                                  ['Safety', entry.safetyRatings && entry.safetyRatings.length > 0 ? entry.safetyRatings.join(', ') : '-'],
                                ].map(([label, value]) => (
                                  <div key={`${entry.at}-${String(label)}`} className="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-[#18181B]">
                                    <div className="text-gray-400 dark:text-zinc-500">{label}</div>
                                    <div className="mt-1 break-words text-sm font-semibold text-gray-900 dark:text-white">{value}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {(selectedQueueJobDetail.job.error || selectedQueueJobDetail.job.errorRaw) ? (
                      <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                        <div className="text-sm font-black text-gray-900 dark:text-white">Phân tích lỗi</div>
                        {selectedQueueJobDetail.job.error ? <div className="mt-3 text-sm text-red-500 dark:text-red-300">{selectedQueueJobDetail.job.error}</div> : null}
                        {selectedQueueJobDetail.job.errorRaw && selectedQueueJobDetail.job.errorRaw !== selectedQueueJobDetail.job.error ? <div className="mt-3 break-all text-xs text-gray-500 dark:text-zinc-400">{selectedQueueJobDetail.job.errorRaw}</div> : null}
                      </div>
                    ) : null}

                    <div className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                      <div className="mb-3 text-sm font-black text-gray-900 dark:text-white">Log tiến trình</div>
                      <div className="space-y-3">
                        {(selectedQueueJobDetail.job.queueLogs || []).length === 0 ? (
                          <div className="text-sm text-gray-500 dark:text-zinc-400">Chưa có log cho job này.</div>
                        ) : (
                          (selectedQueueJobDetail.job.queueLogs || []).map((log, index) => (
                            <div key={`${log.at}-${index}`} className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400">{getQueueStageLabel(log.stage)}</div>
                                <div className="text-[11px] text-gray-400 dark:text-zinc-500">{formatDateTime(log.at)}</div>
                              </div>
                              <div className="mt-2 text-sm text-gray-700 dark:text-zinc-200">{log.message}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <details className="rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80">
                      <summary className="cursor-pointer text-sm font-black text-gray-900 dark:text-white">Payload preview</summary>
                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-white p-3 text-[11px] text-gray-700 dark:bg-zinc-900 dark:text-zinc-200">
{JSON.stringify(selectedQueueJobDetail.queuePayloadPreview || {}, null, 2)}
                      </pre>
                    </details>

                    {['queued', 'processing', 'rescuing'].includes(getQueueStatus(selectedQueueJobDetail.job)) ? (
                      <button
                        onClick={() => stopQueueJob(selectedQueueJobDetail.job)}
                        disabled={stoppingQueueJobId === selectedQueueJobDetail.job.id}
                        className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-red-500 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {stoppingQueueJobId === selectedQueueJobDetail.job.id ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        Dừng tiến trình
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
