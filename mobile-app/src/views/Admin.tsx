import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Coins,
  Loader,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Users,
  Video,
  Wallet,
  XCircle,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/NotificationSystem';
import {
  adminApproveTransaction,
  adminRejectTransaction,
  getAdminQueueJobs,
  getAdminStats,
  getMaintenanceMode,
  runAdminQueueReconcile,
  saveMaintenanceMode,
} from '../services/economyService';
import type { AdminQueueJob, AdminQueueSummary, Transaction } from '../types';

type AdminTab = 'overview' | 'queue' | 'transactions' | 'users';
type AdminStatsPayload = Awaited<ReturnType<typeof getAdminStats>>;
type AdminUsageRow = { feature: string; count: number; vcoins: number; revenue: number };
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
    ? new Date(value).toLocaleString('vi-VN', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Chua cap nhat';

const getQueueStatus = (job: AdminQueueJob) => job.displayStatus || job.status;
const getUserLastSeen = (user: AdminUserRow) => {
  if (!user.lastActive) return 'Chua online';
  const diffMins = Math.floor((Date.now() - new Date(user.lastActive).getTime()) / 60000);
  if (diffMins < 1) return 'Vua xong';
  if (diffMins < 60) return `${diffMins}p truoc`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h truoc`;
  return `${Math.floor(diffHours / 24)} ngay truoc`;
};

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-[28px] border border-gray-100 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-[#18181B] ${className}`}>{children}</div>
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
  const [actingTransactionId, setActingTransactionId] = useState<string | null>(null);
  const [queueStatusFilter, setQueueStatusFilter] = useState<'all' | 'processing' | 'failed'>('all');
  const [queueAssetFilter, setQueueAssetFilter] = useState<'all' | 'image' | 'video'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [maintenance, setMaintenance] = useState({ isActive: false, message: '' });
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [statsPayload, maintenancePayload] = await Promise.all([getAdminStats(), getMaintenanceMode()]);
      setStats(statsPayload);
      setMaintenance({ isActive: !!maintenancePayload.isActive, message: maintenancePayload.message || '' });
    } catch (error) {
      console.error('[MobileAdmin] Failed to load stats', error);
      notify('Khong the tai tong quan admin.', 'error');
    } finally {
      setLoadingStats(false);
    }
  }, [notify]);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const payload = await getAdminQueueJobs({
        status: queueStatusFilter === 'all' ? 'all' : queueStatusFilter,
        assetType: queueAssetFilter,
        stuckOnly: false,
        limit: 30,
      });
      const jobs = payload.jobs.filter((job) => {
        const status = getQueueStatus(job);
        return queueStatusFilter === 'all' ? true : queueStatusFilter === 'processing' ? status === 'processing' || status === 'queued' || status === 'rescuing' : status === 'failed';
      });
      setQueueJobs(jobs);
      setQueueSummary(payload.summary || EMPTY_QUEUE_SUMMARY);
    } catch (error) {
      console.error('[MobileAdmin] Failed to load queue', error);
      notify('Khong the tai queue job.', 'error');
    } finally {
      setLoadingQueue(false);
    }
  }, [notify, queueAssetFilter, queueStatusFilter]);

  useEffect(() => { void loadStats(); }, [loadStats]);
  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const pendingTransactions = useMemo(() => ((stats?.transactions || []) as Transaction[]).filter((item: Transaction) => item.status === 'pending'), [stats]);
  const aiUsageRows = useMemo(() => ((stats?.dashboard.aiUsage || []) as AdminUsageRow[]).slice(0, 6), [stats]);
  const filteredUsers = useMemo(
    () => ((stats?.usersList || []) as AdminUserRow[])
      .filter((entry: AdminUserRow) => {
        const q = userSearch.trim().toLowerCase();
        return !q || (entry.username || '').toLowerCase().includes(q) || (entry.email || '').toLowerCase().includes(q);
      })
      .sort((a, b) => Number(b.vcoin_balance || 0) - Number(a.vcoin_balance || 0))
      .slice(0, 25),
    [stats, userSearch],
  );

  if (userRole !== 'admin') return <Navigate to="/home" replace />;

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadQueue()]);
    setRefreshing(false);
  };

  const approveTransaction = (tx: Transaction) => confirm({
    title: 'Duyet giao dich?',
    message: `Cong ${tx.vcoin_received} Vcoin cho ${tx.userName || tx.userEmail || 'user'}?`,
    confirmText: 'Duyet',
    cancelText: 'Huy',
    onConfirm: async () => {
      setActingTransactionId(tx.id);
      const result = await adminApproveTransaction(tx.id);
      setActingTransactionId(null);
      if (!result.success) return notify(result.error || 'Duyet that bai.', 'error');
      await loadStats();
      notify('Da duyet giao dich.', 'success');
    },
  });

  const rejectTransaction = (tx: Transaction) => confirm({
    title: 'Tu choi giao dich?',
    message: `Ban chac chan muon tu choi giao dich ${tx.order_code || tx.id}?`,
    confirmText: 'Tu choi',
    cancelText: 'Huy',
    isDanger: true,
    onConfirm: async () => {
      setActingTransactionId(tx.id);
      const result = await adminRejectTransaction(tx.id);
      setActingTransactionId(null);
      if (!result.success) return notify(result.error || 'Tu choi that bai.', 'error');
      await loadStats();
      notify('Da tu choi giao dich.', 'success');
    },
  });

  const reconcileQueue = () => confirm({
    title: 'Reconcile queue?',
    message: 'Cong cu nay se reset job ket va dong bo lai queue.',
    confirmText: 'Chay ngay',
    cancelText: 'Huy',
    onConfirm: async () => {
      setReconciling(true);
      try {
        await runAdminQueueReconcile();
        await loadQueue();
        notify('Da chay queue reconcile.', 'success');
      } catch (error) {
        console.error('[MobileAdmin] Queue reconcile failed', error);
        notify('Queue reconcile that bai.', 'error');
      } finally {
        setReconciling(false);
      }
    },
  });

  const saveMaintenance = async () => {
    setSavingMaintenance(true);
    const result = await saveMaintenanceMode(maintenance.isActive, maintenance.message);
    setSavingMaintenance(false);
    if (!result.success) return notify('Khong the luu bao tri.', 'error');
    notify('Da luu trang thai bao tri.', 'success');
  };

  return (
    <div className="min-h-screen bg-[#F6F6F8] pb-10 dark:bg-[#09090B]">
      <div className="sticky top-0 z-40 border-b border-gray-100 bg-[#F6F6F8]/95 px-4 pb-4 pt-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-[#09090B]/95">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => navigate('/profile')} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-white"><ArrowLeft className="h-5 w-5" /></button>
            <button onClick={() => void refreshAll()} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-white"><RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} /></button>
          </div>
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-amber-400 via-pink-500 to-fuchsia-600 text-white shadow-lg shadow-pink-500/20"><Shield className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-pink-500">Admin mobile</p>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Control Center</h1>
              <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Quan tri nhanh cho {user?.username || user?.email || 'admin'} ngay trong app.</p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {(['overview', 'queue', 'transactions', 'users'] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-2xl px-4 py-2.5 text-xs font-bold ${activeTab === tab ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                {tab === 'overview' ? 'Tong quan' : tab === 'queue' ? 'Queue' : tab === 'transactions' ? 'Giao dich' : 'Nguoi dung'}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4 px-4 py-4">
        {activeTab === 'overview' && (
          loadingStats ? <div className="flex justify-center py-20"><Loader className="h-8 w-8 animate-spin text-gray-300" /></div> : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-500">Users</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats?.dashboard.usersTotal || 0}</div></Card>
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500">Moi hom nay</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats?.dashboard.newUsersToday || 0}</div></Card>
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-fuchsia-500">Anh/video</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{stats?.dashboard.imagesTotal || 0}</div></Card>
                <Card><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500">Pending topup</div><div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{pendingTransactions.length}</div></Card>
              </div>

              <Card>
                <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Activity className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Can xu ly ngay</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Topup pending va queue dang gap van de</p></div></div>
                <div className="space-y-3">
                  <button onClick={() => setActiveTab('transactions')} className="flex w-full items-center justify-between rounded-[24px] bg-gray-50 px-4 py-4 text-left dark:bg-zinc-800/80"><div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Nap tien</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{pendingTransactions.length} giao dich dang cho duyet</div></div><Wallet className="h-4 w-4 text-gray-400" /></button>
                  <button onClick={() => setActiveTab('queue')} className="flex w-full items-center justify-between rounded-[24px] bg-gray-50 px-4 py-4 text-left dark:bg-zinc-800/80"><div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">Queue</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{queueSummary.failed} fail, {queueSummary.processing + queueSummary.queued} job dang chay</div></div><AlertTriangle className="h-4 w-4 text-gray-400" /></button>
                </div>
              </Card>

              <Card>
                <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Coins className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Thong ke su dung</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Top cong cu duoc su dung nhieu nhat</p></div></div>
                <div className="space-y-3">{aiUsageRows.length === 0 ? <div className="rounded-[24px] bg-gray-50 px-4 py-5 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Chua co du lieu su dung.</div> : aiUsageRows.map((row) => <div key={row.feature} className="flex items-center justify-between rounded-[24px] bg-gray-50 px-4 py-4 dark:bg-zinc-800/80"><div className="min-w-0"><div className="truncate text-sm font-bold text-gray-900 dark:text-white">{row.feature}</div><div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">{row.count} luot</div></div><div className="text-right"><div className="text-sm font-black text-pink-500">{row.vcoins} VC</div><div className="text-[11px] text-emerald-500">{new Intl.NumberFormat('vi-VN').format(row.revenue)}d</div></div></div>)}</div>
              </Card>

              <Card>
                <div className="mb-4 flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Settings2 className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Bao tri he thong</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Bat tat maintenance va sua message</p></div></div><button onClick={() => setMaintenance((m) => ({ ...m, isActive: !m.isActive }))} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${maintenance.isActive ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>{maintenance.isActive ? 'Dang bat' : 'Dang tat'}</button></div>
                <textarea value={maintenance.message} onChange={(e) => setMaintenance((m) => ({ ...m, message: e.target.value }))} rows={4} className="w-full rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-800 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" placeholder="Nhap thong bao bao tri..." />
                <button onClick={() => void saveMaintenance()} disabled={savingMaintenance} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[24px] bg-gray-900 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">{savingMaintenance ? <Loader className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}Luu bao tri</button>
              </Card>
            </>
          )
        )}

        {activeTab === 'queue' && (
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Activity className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Queue monitor</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Theo doi image/video jobs va debug nhanh</p></div></div><button onClick={reconcileQueue} className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-700 dark:bg-zinc-800 dark:text-zinc-300">{reconciling ? 'Dang chay...' : 'Reconcile'}</button></div>
            <div className="mb-3 grid grid-cols-3 gap-2">{[['Running', queueSummary.processing + queueSummary.queued], ['Fail', queueSummary.failed], ['Done', queueSummary.completed]].map(([label, value]) => <div key={String(label)} className="rounded-[22px] bg-gray-50 px-3 py-3 dark:bg-zinc-800/80"><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-zinc-500">{label}</div><div className="mt-1 text-xl font-black text-gray-900 dark:text-white">{value}</div></div>)}</div>
            <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">{(['all', 'processing', 'failed'] as const).map((key) => <button key={key} onClick={() => setQueueStatusFilter(key)} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${queueStatusFilter === key ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>{key === 'all' ? 'Tat ca' : key === 'processing' ? 'Dang chay' : 'Fail'}</button>)}</div>
            <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">{(['all', 'image', 'video'] as const).map((key) => <button key={key} onClick={() => setQueueAssetFilter(key)} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${queueAssetFilter === key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>{key}</button>)}</div>
            {loadingQueue ? <div className="flex justify-center py-12"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div> : queueJobs.length === 0 ? <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Khong co queue job phu hop.</div> : <div className="space-y-3">{queueJobs.map((job) => { const status = getQueueStatus(job); return <div key={job.id} className="rounded-[24px] bg-gray-50 p-4 dark:bg-zinc-800/80"><div className="mb-2 flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{job.userName || job.userEmail || 'Unknown user'}</div><div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{job.userEmail || job.id}</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status === 'failed' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'}`}>{status || 'completed'}</div></div><div className="mb-2 flex items-center gap-2">{job.assetType === 'video' ? <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-600 dark:bg-purple-500/10 dark:text-purple-300"><Video className="h-3 w-3" />video</span> : <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><ImageIcon className="h-3 w-3" />image</span>}{typeof job.progress === 'number' ? <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400">{Math.round(job.progress)}%</span> : null}</div><div className="line-clamp-2 text-sm text-gray-700 dark:text-zinc-200">{job.prompt || job.toolName || 'Khong co prompt'}</div>{job.error ? <div className="mt-3 line-clamp-2 text-xs text-red-500 dark:text-red-300">{job.error}</div> : <div className="mt-3 text-[11px] text-gray-500 dark:text-zinc-400">{formatDateTime(job.updatedAt)}</div>}</div>; })}</div>}
          </Card>
        )}

        {activeTab === 'transactions' && (
          <Card>
            <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Wallet className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Giao dich nap tien</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Duyet giao dich pending ngay tren mobile</p></div></div>
            {loadingStats ? <div className="flex justify-center py-12"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div> : (stats?.transactions || []).length === 0 ? <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Chua co giao dich nao.</div> : <div className="space-y-3">{((stats?.transactions || []) as Transaction[]).slice(0, 20).map((tx: Transaction) => <div key={tx.id} className="rounded-[24px] bg-gray-50 p-4 dark:bg-zinc-800/80"><div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{tx.userName || tx.userEmail || 'Unknown user'}</div><div className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{tx.userEmail || tx.userId}</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${tx.status === 'pending' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : tx.status === 'paid' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'}`}>{tx.status}</div></div><div className="grid grid-cols-2 gap-3 text-xs"><div><div className="text-gray-400 dark:text-zinc-500">So tien</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{new Intl.NumberFormat('vi-VN').format(Number(tx.amount || 0))}d</div></div><div><div className="text-gray-400 dark:text-zinc-500">Vcoin</div><div className="mt-1 text-sm font-bold text-pink-500">{tx.vcoin_received} VC</div></div></div><div className="mt-3 text-[11px] text-gray-500 dark:text-zinc-400">{formatDateTime(tx.createdAt)}{tx.order_code ? ` • ${tx.order_code}` : ''}</div>{tx.status === 'pending' ? <div className="mt-4 flex gap-2"><button onClick={() => approveTransaction(tx)} disabled={actingTransactionId === tx.id} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{actingTransactionId === tx.id ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Duyet</button><button onClick={() => rejectTransaction(tx)} disabled={actingTransactionId === tx.id} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{actingTransactionId === tx.id ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}Tu choi</button></div> : null}</div>)}</div>}
          </Card>
        )}

        {activeTab === 'users' && (
          <Card>
            <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800"><Users className="h-5 w-5 text-gray-700 dark:text-white" /></div><div><h2 className="text-base font-black text-gray-900 dark:text-white">Nguoi dung</h2><p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Tim user, xem balance, role va hoat dong</p></div></div>
            <div className="mb-4 flex items-center gap-3 rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"><Search className="h-4 w-4 text-gray-400 dark:text-zinc-500" /><input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Tim theo ten hoac email" className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-zinc-500" /></div>
            {loadingStats ? <div className="flex justify-center py-12"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div> : filteredUsers.length === 0 ? <div className="rounded-[24px] bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Khong tim thay user.</div> : <div className="space-y-3">{filteredUsers.map((entry: AdminUserRow) => <div key={entry.id} className="rounded-[24px] bg-gray-50 p-4 dark:bg-zinc-800/80"><div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-gray-900 dark:text-white">{entry.username || entry.email}</div><div className="mt-1 truncate text-[11px] text-gray-500 dark:text-zinc-400">{entry.email}</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${entry.role === 'admin' ? 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300' : 'bg-gray-200 text-gray-700 dark:bg-zinc-700 dark:text-zinc-200'}`}>{entry.role}</div></div><div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900"><div className="text-gray-400 dark:text-zinc-500">Balance</div><div className="mt-1 text-sm font-bold text-amber-600 dark:text-amber-300">{Number(entry.vcoin_balance || 0).toLocaleString()} VC</div></div><div className="rounded-2xl bg-white px-3 py-3 dark:bg-zinc-900"><div className="text-gray-400 dark:text-zinc-500">Usage</div><div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{entry.usageCount || 0}</div></div></div><div className="mt-3 text-[11px] text-gray-500 dark:text-zinc-400">Last seen: {getUserLastSeen(entry)}</div></div>)}</div>}
          </Card>
        )}
      </div>
    </div>
  );
}

