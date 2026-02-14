
import React, { useState, useEffect } from 'react';
import { Language, Transaction, UserProfile, GeneratedImage, CreditPackage, PromotionConfig, Giftcode } from '../types';
import { Icons } from '../components/Icons';
import { checkConnection } from '../services/geminiService';
import { checkSupabaseConnection } from '../services/supabaseClient';
import { getAdminStats, savePackage, deletePackage, updateAdminUserProfile, savePromotionConfig, getGiftcodes, saveGiftcode, deleteGiftcode, adminApproveTransaction, adminRejectTransaction, getSystemApiKey, saveSystemApiKey } from '../services/economyService';
import { getAllImagesFromStorage, deleteImageFromStorage } from '../services/storageService';

interface AdminProps {
  lang: Language;
  isAdmin?: boolean; 
}

interface SystemHealth {
    gemini: { status: 'connected' | 'disconnected' | 'checking'; latency: number };
    supabase: { status: 'connected' | 'disconnected' | 'checking'; latency: number };
    storage: { status: 'connected' | 'disconnected' | 'checking'; };
}

// --- INTERNAL NOTIFICATION COMPONENTS ---
interface ToastMsg {
    id: number;
    msg: string;
    type: 'success' | 'error' | 'info';
}

interface ConfirmState {
    show: boolean;
    title?: string;
    msg: string;
    onConfirm: () => void;
    isAlertOnly?: boolean; // Just an OK button
    sqlHelp?: string; // Optional SQL code to copy
}

export const Admin: React.FC<AdminProps> = ({ lang, isAdmin = false }) => {
  const [activeView, setActiveView] = useState<'overview' | 'transactions' | 'users' | 'packages' | 'promotion' | 'giftcodes' | 'system'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [allImages, setAllImages] = useState<GeneratedImage[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [giftcodes, setGiftcodes] = useState<Giftcode[]>([]);
  const [promotion, setPromotion] = useState<PromotionConfig>({ isActive: false, marqueeText: '', bonusPercent: 0, startTime: '', endTime: '' });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [keyStatus, setKeyStatus] = useState<'valid' | 'invalid' | 'unknown' | 'checking'>('unknown');
  
  // Search States
  const [userSearchEmail, setUserSearchEmail] = useState('');

  // Health State
  const [health, setHealth] = useState<SystemHealth>({
      gemini: { status: 'checking', latency: 0 },
      supabase: { status: 'checking', latency: 0 },
      storage: { status: 'checking' }
  });

  // Modal States
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [editingGiftcode, setEditingGiftcode] = useState<Giftcode | null>(null);

  // Notification State
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState>({ show: false, msg: '', onConfirm: () => {} });

  // Helpers for Notifications
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, msg, type }]);
      setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
  };

  const showConfirm = (msg: string, action: () => void) => {
      setConfirmDialog({
          show: true,
          msg,
          onConfirm: () => {
              action();
              setConfirmDialog(prev => ({ ...prev, show: false }));
          }
      });
  };

  const copySql = (sql: string) => {
      navigator.clipboard.writeText(sql);
      showToast('Đã sao chép mã SQL!', 'info');
  }

  // Load Data Sequence
  useEffect(() => {
    if (isAdmin) {
        const init = async () => {
            // 1. Load Data
            await refreshData();
            
            // 2. Load Key
            const key = await getSystemApiKey();
            if (key) {
                setApiKey(key);
                setKeyStatus('checking'); // Set to checking visibly
                // 3. Run Checks with the loaded key
                await runSystemChecks(key);
            } else {
                await runSystemChecks(undefined);
            }
        };
        init();
    }
  }, [isAdmin]);

  const refreshData = async () => {
      const s = await getAdminStats();
      if (s) {
          setStats(s);
          setPackages(s.packages || []);
          setPromotion(s.promotion);
          setGiftcodes(s.giftcodes || []);
          setTransactions((s.transactions || []).reverse()); 
          const imgs = await getAllImagesFromStorage();
          setAllImages(imgs);
      }
  };

  const runSystemChecks = async (specificKey?: string) => {
      const startGemini = Date.now();
      const keyToUse = specificKey !== undefined ? specificKey : (apiKey || undefined);
      
      const geminiOk = await checkConnection(keyToUse);
      const geminiLatency = Date.now() - startGemini;
      const sbCheck = await checkSupabaseConnection();

      setHealth({
          gemini: { status: geminiOk ? 'connected' : 'disconnected', latency: geminiLatency },
          supabase: { status: sbCheck.db ? 'connected' : 'disconnected', latency: sbCheck.latency },
          storage: { status: sbCheck.storage ? 'connected' : 'disconnected' }
      });
      
      if (keyToUse || geminiOk) {
          setKeyStatus(geminiOk ? 'valid' : 'invalid');
      }
  };

  // --- ACTIONS ---

  const handleSaveApiKey = async () => {
      if (!apiKey.trim()) return;
      
      setKeyStatus('checking');
      const isValid = await checkConnection(apiKey);
      
      if (isValid) {
          const success = await saveSystemApiKey(apiKey);
          if (success) {
              setKeyStatus('valid');
              showToast('Đã lưu API Key vào Database thành công!');
              runSystemChecks(apiKey);
          } else {
              setKeyStatus('unknown');
              showToast('Lỗi khi lưu vào Database. Vui lòng kiểm tra kết nối.', 'error');
          }
      } else {
          setKeyStatus('invalid');
          showToast('API Key không hoạt động. Vui lòng kiểm tra lại.', 'error');
      }
  };

  const handleSaveUser = async () => {
      if (editingUser) {
          await updateAdminUserProfile(editingUser);
          setEditingUser(null);
          refreshData();
          showToast('Cập nhật người dùng thành công!');
      }
  };

  const handleSavePackage = async () => {
      if (editingPackage) {
          await savePackage(editingPackage);
          setEditingPackage(null);
          refreshData();
          showToast('Cập nhật gói nạp thành công!');
      }
  };

  const handleDeletePackage = async (id: string) => {
      showConfirm('Bạn có chắc chắn muốn xóa gói nạp này?', async () => {
          await deletePackage(id);
          refreshData();
          showToast('Đã xóa gói nạp');
      });
  };

  const handleSaveGiftcode = async () => {
      if (editingGiftcode) {
          const result = await saveGiftcode(editingGiftcode);
          if (result.success) {
              setEditingGiftcode(null);
              refreshData();
              showToast('Lưu Giftcode thành công!');
          } else {
              if (result.error?.includes('RLS') || result.error?.includes('permission') || result.error?.includes('policy')) {
                  // Show Helper for SQL Fix
                  setConfirmDialog({
                      show: true,
                      title: '⚠️ Cần Cấp Quyền Database',
                      msg: 'Database đang chặn việc tạo Giftcode mới. Hãy copy đoạn mã dưới đây và chạy trong SQL Editor của Supabase để mở khóa:',
                      sqlHelp: `ALTER TABLE public.gift_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for gift codes" ON public.gift_codes FOR ALL USING (true) WITH CHECK (true);`,
                      isAlertOnly: true,
                      onConfirm: () => {}
                  });
              } else {
                  showToast(`Lỗi: ${result.error}`, 'error');
              }
          }
      }
  };

  const handleDeleteGiftcode = async (id: string) => {
      showConfirm('Xóa mã này vĩnh viễn?', async () => {
          await deleteGiftcode(id);
          refreshData();
          showToast('Đã xóa Giftcode');
      });
  };

  const handleSavePromotion = async () => {
      await savePromotionConfig(promotion);
      showToast('Đã lưu cấu hình khuyến mãi!');
  };

  const handleDeleteContent = async (id: string) => {
      showConfirm('Xóa vĩnh viễn hình ảnh này?', async () => {
          await deleteImageFromStorage(id);
          setAllImages(prev => prev.filter(img => img.id !== id));
          showToast('Đã xóa ảnh');
      });
  }

  const handleApproveTransaction = async (txId: string) => {
      showConfirm('Xác nhận duyệt giao dịch này và cộng Vcoin cho user?', async () => {
          await adminApproveTransaction(txId);
          refreshData();
          showToast('Đã duyệt thành công!');
      });
  }

  const handleRejectTransaction = async (txId: string) => {
      showConfirm('Từ chối giao dịch này?', async () => {
          await adminRejectTransaction(txId);
          refreshData();
          showToast('Đã từ chối giao dịch', 'info');
      });
  }

  // --- ACCESS DENIED ---
  if (!isAdmin) {
      return (
          <div className="flex flex-col items-center justify-center h-[70vh] text-center animate-fade-in">
              <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                  <Icons.Lock className="w-10 h-10 text-red-500" />
              </div>
              <h1 className="text-4xl font-game font-bold text-white mb-2">ACCESS DENIED</h1>
              <p className="text-slate-400 font-mono">Khu vực hạn chế. Cần quyền Admin cấp 5.</p>
          </div>
      );
  }

  // --- SUB-COMPONENTS ---
  const StatusBadge = ({ status, latency }: { status: string, latency?: number }) => (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase ${
          status === 'connected' ? 'bg-green-500/10 border-green-500 text-green-500' :
          status === 'checking' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' :
          'bg-red-500/10 border-red-500 text-red-500'
      }`}>
          <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : status === 'checking' ? 'bg-yellow-500 animate-bounce' : 'bg-red-500'}`}></div>
          {status === 'connected' ? 'Ổn định' : status === 'checking' ? 'Đang kiểm tra' : 'Mất kết nối'}
          {latency !== undefined && latency > 0 && <span className="text-[9px] opacity-70 ml-1">({latency}ms)</span>}
      </div>
  );

  return (
    <div className="min-h-screen pb-24 animate-fade-in bg-[#05050A]">
      
      {/* --- TOASTS CONTAINER --- */}
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
              <div key={t.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl animate-fade-in backdrop-blur-md ${
                  t.type === 'success' ? 'bg-[#0f1f12]/90 border-green-500/50 text-green-400' : 
                  t.type === 'error' ? 'bg-[#1f0f0f]/90 border-red-500/50 text-red-400' : 'bg-[#0f151f]/90 border-blue-500/50 text-blue-400'
              }`}>
                  {t.type === 'success' && <Icons.Check className="w-5 h-5" />}
                  {t.type === 'error' && <Icons.X className="w-5 h-5" />}
                  {t.type === 'info' && <Icons.Info className="w-5 h-5" />}
                  <span className="text-sm font-bold">{t.msg}</span>
              </div>
          ))}
      </div>

      {/* --- CONFIRM / ALERT DIALOG --- */}
      {confirmDialog.show && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-[#12121a] border border-white/20 p-6 rounded-2xl max-w-lg w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] transform scale-100 transition-all">
                  <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-4 text-audi-yellow mx-auto">
                      <Icons.Bell className="w-6 h-6 animate-swing" />
                  </div>
                  <h3 className="text-lg font-bold text-white text-center mb-2">{confirmDialog.title || 'Thông báo'}</h3>
                  <p className="text-slate-400 text-center text-sm mb-6 leading-relaxed">{confirmDialog.msg}</p>
                  
                  {/* SQL Helper Box */}
                  {confirmDialog.sqlHelp && (
                      <div className="mb-6 relative">
                          <pre className="bg-black/50 p-4 rounded-lg border border-red-500/30 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                              {confirmDialog.sqlHelp}
                          </pre>
                          <button 
                            onClick={() => copySql(confirmDialog.sqlHelp!)}
                            className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-white"
                            title="Copy Code"
                          >
                              <Icons.Share className="w-3 h-3" />
                          </button>
                      </div>
                  )}

                  <div className="flex gap-3">
                      {!confirmDialog.isAlertOnly && (
                          <button onClick={() => setConfirmDialog(prev => ({...prev, show: false}))} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold transition-colors">
                              Hủy
                          </button>
                      )}
                      <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({...prev, show: false})) }} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold transition-colors shadow-lg">
                          {confirmDialog.isAlertOnly ? 'Đã Hiểu' : 'Đồng ý'}
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {/* --- TOP COMMAND BAR --- */}
      <div className="bg-[#12121a] border-b border-white/10 sticky top-[72px] z-40 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-audi-pink flex items-center justify-center text-white font-bold shadow-lg shadow-audi-pink/30">
                      <Icons.Shield className="w-6 h-6" />
                  </div>
                  <div>
                      <h1 className="font-game text-xl font-bold text-white leading-none">QUẢN TRỊ VIÊN</h1>
                      <p className="text-[10px] text-audi-cyan font-mono tracking-widest mt-0.5">V42.0.0-RELEASE • SYSTEM MONITOR</p>
                  </div>
              </div>

              {/* Quick Health Indicators */}
              <div className="flex items-center gap-2">
                  <div title="Gemini API" className={`w-3 h-3 rounded-full ${health.gemini.status === 'connected' ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' : 'bg-red-500'}`}></div>
                  <div title="Database" className={`w-3 h-3 rounded-full ${health.supabase.status === 'connected' ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`}></div>
                  <div title="Storage R2" className={`w-3 h-3 rounded-full ${health.storage.status === 'connected' ? 'bg-orange-500 shadow-[0_0_10px_#f97316]' : 'bg-red-500'}`}></div>
              </div>
          </div>

          {/* Navigation Tabs */}
          <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto no-scrollbar py-2">
              {[
                  { id: 'overview', icon: Icons.Home, label: 'Tổng Quan' },
                  { id: 'transactions', icon: Icons.Gem, label: 'Giao Dịch' },
                  { id: 'users', icon: Icons.User, label: 'Người Dùng' },
                  { id: 'packages', icon: Icons.ShoppingBag, label: 'Gói Nạp' },
                  { id: 'giftcodes', icon: Icons.Gift, label: 'Giftcode' },
                  { id: 'promotion', icon: Icons.Zap, label: 'Khuyến Mãi' },
                  { id: 'system', icon: Icons.Cpu, label: 'Hệ Thống' },
              ].map(tab => (
                  <button
                      key={tab.id}
                      onClick={() => setActiveView(tab.id as any)}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                          activeView === tab.id 
                          ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                  >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                  </button>
              ))}
          </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          
          {/* ================= VIEW: OVERVIEW ================= */}
          {activeView === 'overview' && (
              <div className="space-y-6 animate-slide-in-right">
                  {/* Grid 3x2 Dashboard */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                          { title: 'Lượt truy cập (hôm nay)', value: stats?.dashboard?.visitsToday, icon: Icons.Menu, color: 'text-white' },
                          { title: 'Tổng lượt truy cập', value: new Intl.NumberFormat('de-DE').format(stats?.dashboard?.visitsTotal || 0), icon: Icons.Cloud, color: 'text-audi-cyan' },
                          { title: 'Người dùng mới (hôm nay)', value: stats?.dashboard?.newUsersToday, icon: Icons.User, color: 'text-white' },
                          { title: 'Tổng người dùng', value: stats?.dashboard?.usersTotal, icon: Icons.User, color: 'text-green-500' },
                          { title: 'Ảnh tạo (hôm nay)', value: stats?.dashboard?.imagesToday, icon: Icons.Image, color: 'text-white' },
                          { title: 'Tổng số ảnh', value: new Intl.NumberFormat('de-DE').format(stats?.dashboard?.imagesTotal || 0), icon: Icons.Image, color: 'text-audi-pink' },
                      ].map((item, i) => (
                          <div key={i} className="bg-[#12121a] border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-lg hover:border-white/10 transition-all">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <p className="text-xs font-bold text-slate-400 uppercase mb-2">{item.title}</p>
                                      <h3 className={`text-4xl font-game font-bold ${item.color} drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]`}>
                                          {item.value}
                                      </h3>
                                  </div>
                                  <div className="p-3 bg-white/5 rounded-xl text-slate-400">
                                      <item.icon className="w-6 h-6" />
                                  </div>
                              </div>
                              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                          </div>
                      ))}
                  </div>

                  {/* AI Stats Table (UPDATED: Kim Cương -> Vcoin) */}
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 shadow-xl">
                      <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                          <Icons.BarChart className="w-5 h-5 text-audi-yellow" />
                          Thống Kê Chi Tiết Sử Dụng AI
                      </h3>
                      
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-400">
                              <thead className="bg-[#090014] text-xs font-bold text-slate-500 uppercase">
                                  <tr>
                                      <th className="px-6 py-4">Tính năng</th>
                                      <th className="px-6 py-4 text-audi-cyan">Flash (1 💎)</th>
                                      <th className="px-6 py-4 text-audi-yellow">Pro (10-20 💎)</th>
                                      <th className="px-6 py-4 text-audi-pink">Tổng Vcoin</th>
                                      <th className="px-6 py-4 text-right text-green-500">Doanh Thu (VND)</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {stats?.dashboard?.aiUsage.map((row: any, i: number) => (
                                      <tr key={i} className="hover:bg-white/5 transition-colors">
                                          <td className="px-6 py-4 font-bold text-white">{row.feature}</td>
                                          <td className="px-6 py-4 text-audi-cyan font-mono">{new Intl.NumberFormat('de-DE').format(row.flash)}</td>
                                          <td className="px-6 py-4 text-audi-yellow font-mono">{new Intl.NumberFormat('de-DE').format(row.pro)}</td>
                                          <td className="px-6 py-4 text-audi-pink font-bold">{new Intl.NumberFormat('de-DE').format(row.vcoins)} Vcoin</td>
                                          <td className="px-6 py-4 text-right text-green-500 font-bold">
                                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.revenue)}
                                          </td>
                                      </tr>
                                  ))}
                                  {/* Total Row */}
                                  <tr className="bg-white/5 font-bold">
                                      <td className="px-6 py-4 text-white uppercase">TỔNG CỘNG</td>
                                      <td className="px-6 py-4 text-white">6.221</td>
                                      <td className="px-6 py-4 text-white">125</td>
                                      <td className="px-6 py-4 text-audi-pink">9.158 Vcoin</td>
                                      <td className="px-6 py-4 text-right text-green-500">9.158.000 ₫</td>
                                  </tr>
                              </tbody>
                          </table>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-4 italic">
                          * Doanh thu ước tính dựa trên quy đổi 1 Vcoin = 1.000đ. Số liệu dựa trên 5000 giao dịch gần nhất.
                      </p>
                  </div>
              </div>
          )}

          {/* ================= VIEW: TRANSACTIONS ================= */}
          {activeView === 'transactions' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-white">Quản Lý Giao Dịch</h2>
                      <div className="bg-white/5 px-3 py-1 rounded-full text-xs text-slate-400 border border-white/10">
                          Pending: {transactions.filter(t => t.status === 'pending').length}
                      </div>
                  </div>
                  {/* ... Transaction Table ... */}
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4">Mã GD</th>
                                  <th className="px-6 py-4">Người Nạp / Email</th>
                                  <th className="px-6 py-4">Gói Nạp</th>
                                  <th className="px-6 py-4">Vcoin</th>
                                  <th className="px-6 py-4">Thời gian</th>
                                  <th className="px-6 py-4">Trạng thái</th>
                                  <th className="px-6 py-4 text-right">Hành động</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {transactions.map(tx => {
                                  const pkgName = packages.find(p => p.id === tx.packageId)?.name || 'Unknown Pkg';
                                  const user = stats?.usersList?.find((u: UserProfile) => u.id === tx.userId) || { username: 'Unknown', email: '---' };
                                  return (
                                      <tr key={tx.id} className="hover:bg-white/5">
                                          <td className="px-6 py-4 font-mono font-bold text-white text-xs">{tx.code}</td>
                                          <td className="px-6 py-4">
                                              <div className="font-bold text-white">{user.username}</div>
                                              <div className="text-xs text-slate-500">{user.email}</div>
                                          </td>
                                          <td className="px-6 py-4 text-slate-300">
                                              {pkgName}
                                              <div className="text-xs text-green-500 font-bold">
                                                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}
                                              </div>
                                          </td>
                                          <td className="px-6 py-4 text-audi-yellow font-bold">+{tx.coins}</td>
                                          <td className="px-6 py-4 text-xs">{new Date(tx.createdAt).toLocaleString('vi-VN')}</td>
                                          <td className="px-6 py-4">
                                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                                  tx.status === 'paid' ? 'bg-green-500/20 text-green-500' : 
                                                  tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-500'
                                              }`}>
                                                  {tx.status}
                                              </span>
                                          </td>
                                          <td className="px-6 py-4 text-right">
                                              {tx.status === 'pending' && (
                                                  <div className="flex justify-end gap-2">
                                                      <button 
                                                          onClick={() => handleApproveTransaction(tx.id)}
                                                          className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 flex items-center gap-1"
                                                      >
                                                          <Icons.Check className="w-3 h-3" /> Duyệt
                                                      </button>
                                                      <button 
                                                          onClick={() => handleRejectTransaction(tx.id)}
                                                          className="px-3 py-1.5 bg-red-500/20 text-red-500 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white flex items-center gap-1"
                                                      >
                                                          <Icons.X className="w-3 h-3" /> Từ chối
                                                      </button>
                                                  </div>
                                              )}
                                          </td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {/* ================= VIEW: USERS ================= */}
          {activeView === 'users' && (
               <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-white">Quản Lý Người Dùng</h2>
                      {/* ... Search ... */}
                      <div className="relative">
                          <input 
                              type="text" 
                              placeholder="Tìm kiếm theo email..." 
                              value={userSearchEmail}
                              onChange={(e) => setUserSearchEmail(e.target.value)}
                              className="bg-[#12121a] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white w-64 focus:border-audi-cyan outline-none" 
                          />
                          <Icons.Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                      </div>
                  </div>
                  {/* ... User Table ... */}
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4">Tài khoản</th>
                                  <th className="px-6 py-4">Email</th>
                                  <th className="px-6 py-4">Số dư Vcoin</th>
                                  <th className="px-6 py-4 text-right">Thao tác</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {stats?.usersList
                                  ?.filter((u: UserProfile) => u.email.toLowerCase().includes(userSearchEmail.toLowerCase()))
                                  .map((u: UserProfile) => (
                                  <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <img src={u.avatar} className="w-8 h-8 rounded-full border border-white/10" />
                                              <p className="font-bold text-white">{u.username}</p>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-slate-300">{u.email}</td>
                                      <td className="px-6 py-4 font-bold text-audi-yellow">{u.balance} Vcoin</td>
                                      <td className="px-6 py-4 text-right">
                                          <button onClick={() => setEditingUser(u)} className="px-3 py-1 bg-audi-purple rounded text-white text-xs font-bold hover:bg-purple-600">Sửa</button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {/* EDIT USER MODAL */}
                  {editingUser && (
                      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                          <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-white/20 shadow-2xl">
                              <h3 className="text-xl font-bold text-white mb-4">Chỉnh sửa người dùng</h3>
                              <div className="space-y-4">
                                  <div>
                                      <label className="text-xs font-bold text-slate-400 uppercase">Tên hiển thị</label>
                                      <input 
                                        value={editingUser.username} 
                                        onChange={e => setEditingUser({...editingUser, username: e.target.value})}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white mt-1" 
                                      />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold text-slate-400 uppercase">Số dư Vcoin</label>
                                      <input 
                                        type="number"
                                        value={editingUser.balance}
                                        onChange={e => setEditingUser({...editingUser, balance: parseInt(e.target.value)})}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-audi-yellow font-bold mt-1" 
                                      />
                                  </div>
                                  <div className="flex gap-3 pt-4">
                                      <button onClick={() => setEditingUser(null)} className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold">Hủy</button>
                                      <button onClick={handleSaveUser} className="flex-1 py-3 rounded-xl bg-audi-cyan text-black font-bold">Lưu thay đổi</button>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}
               </div>
          )}

          {/* ================= VIEW: GIFTCODES ================= */}
          {activeView === 'giftcodes' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-white">Quản Lý Giftcode</h2>
                      <div className="flex gap-2">
                          <button 
                            onClick={refreshData} 
                            className="px-3 py-2 bg-white/10 text-white rounded-lg font-bold hover:bg-white/20"
                            title="Làm mới danh sách"
                          >
                             <Icons.Clock className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setEditingGiftcode({
                                // Use temp ID for UI, service will ignore it and insert
                                id: `temp_${Date.now()}`, code: '', reward: 10, totalLimit: 100, usedCount: 0, maxPerUser: 1, isActive: true
                            })}
                            className="px-4 py-2 bg-audi-lime text-black rounded-lg font-bold flex items-center gap-2 hover:bg-lime-400"
                          >
                              <Icons.Plus className="w-4 h-4" /> Tạo Code
                          </button>
                      </div>
                  </div>

                  <div className="bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4">Mã Code</th>
                                  <th className="px-6 py-4">Phần thưởng</th>
                                  <th className="px-6 py-4">Đã dùng</th>
                                  <th className="px-6 py-4">Giới hạn User</th>
                                  <th className="px-6 py-4">Trạng thái</th>
                                  <th className="px-6 py-4 text-right">Thao tác</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {giftcodes.length === 0 ? (
                                  <tr><td colSpan={6} className="text-center py-8">Chưa có mã Giftcode nào.</td></tr>
                              ) : giftcodes.map(gc => (
                                  <tr key={gc.id} className="hover:bg-white/5">
                                      <td className="px-6 py-4 font-mono font-bold text-white">{gc.code}</td>
                                      <td className="px-6 py-4 text-audi-yellow font-bold">{gc.reward} Vcoin</td>
                                      <td className="px-6 py-4 text-white">
                                          {gc.usedCount} / <span className="text-slate-500">{gc.totalLimit}</span>
                                      </td>
                                      <td className="px-6 py-4 text-slate-500">
                                         {gc.maxPerUser} lần/người
                                      </td>
                                      <td className="px-6 py-4">
                                          {gc.isActive ? (
                                              <span className="text-green-500 text-xs font-bold border border-green-500/20 px-2 py-1 rounded">Active</span>
                                          ) : (
                                              <span className="text-red-500 text-xs font-bold border border-red-500/20 px-2 py-1 rounded">Inactive</span>
                                          )}
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                          <div className="flex justify-end gap-2">
                                            <button onClick={() => setEditingGiftcode(gc)} className="p-2 bg-blue-500/20 text-blue-500 rounded hover:bg-blue-500 hover:text-white"><Icons.Settings className="w-4 h-4" /></button>
                                            <button onClick={() => handleDeleteGiftcode(gc.id)} className="p-2 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white"><Icons.Trash className="w-4 h-4" /></button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {/* EDIT GIFTCODE MODAL - FIXED LAYOUT & Z-INDEX */}
                  {editingGiftcode && (
                      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                          <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh]">
                              <h3 className="text-xl font-bold text-white mb-6 sticky top-0 bg-[#12121a] z-10 py-2 border-b border-white/10 shrink-0">
                                  {editingGiftcode.id.startsWith('temp_') ? 'Tạo Giftcode Mới' : 'Sửa Giftcode'}
                              </h3>
                              
                              <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                                  <div>
                                      <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Mã Code (Tự động in hoa)</label>
                                      <input 
                                        value={editingGiftcode.code} 
                                        onChange={e => setEditingGiftcode({...editingGiftcode, code: e.target.value.toUpperCase()})}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono font-bold text-lg placeholder-slate-700 focus:border-audi-lime outline-none transition-colors" 
                                        placeholder="HELLO2025"
                                      />
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                      <div>
                                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Phần thưởng</label>
                                          <div className="relative">
                                              <input 
                                                type="number" 
                                                value={editingGiftcode.reward} 
                                                onChange={e => setEditingGiftcode({...editingGiftcode, reward: Number(e.target.value)})}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold focus:border-audi-yellow outline-none pl-3" 
                                              />
                                              <span className="absolute right-3 top-3.5 text-xs text-slate-500 font-bold">VCOIN</span>
                                          </div>
                                      </div>
                                      <div>
                                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tổng số lượng</label>
                                          <input 
                                            type="number" 
                                            value={editingGiftcode.totalLimit} 
                                            onChange={e => setEditingGiftcode({...editingGiftcode, totalLimit: Number(e.target.value)})}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-audi-lime outline-none" 
                                          />
                                      </div>
                                       <div>
                                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Giới hạn mỗi user</label>
                                          <input 
                                            type="number" 
                                            value={editingGiftcode.maxPerUser} 
                                            onChange={e => setEditingGiftcode({...editingGiftcode, maxPerUser: Number(e.target.value)})}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-audi-lime outline-none" 
                                          />
                                      </div>
                                  </div>

                                  <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setEditingGiftcode({...editingGiftcode, isActive: !editingGiftcode.isActive})}>
                                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${editingGiftcode.isActive ? 'bg-audi-lime border-audi-lime' : 'border-slate-500'}`}>
                                          {editingGiftcode.isActive && <Icons.Check className="w-3 h-3 text-black" />}
                                      </div>
                                      <label className="text-sm font-bold text-white cursor-pointer select-none">Kích hoạt ngay lập tức</label>
                                  </div>
                              </div>

                              <div className="flex gap-3 pt-6 mt-2 border-t border-white/10 shrink-0">
                                  <button onClick={() => setEditingGiftcode(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold transition-colors">Hủy</button>
                                  <button onClick={handleSaveGiftcode} className="flex-1 py-3 rounded-xl bg-audi-lime hover:bg-lime-400 text-black font-bold shadow-[0_0_15px_rgba(204,255,0,0.3)] transition-all">
                                      {editingGiftcode.id.startsWith('temp_') ? 'Tạo Code' : 'Lưu Thay Đổi'}
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}
              </div>
          )}
          
          {/* ... (Keep Packages, Promotion, System views) ... */}
           {/* ================= VIEW: PACKAGES ================= */}
          {activeView === 'packages' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-white">Quản Lý Gói Nạp</h2>
                      <button 
                        onClick={() => setEditingPackage({
                            id: `temp_${Date.now()}`, name: '', coin: 0, price: 0, currency: 'VND', bonusText: '', colorTheme: 'border-white', transferContent: ''
                        })}
                        className="px-4 py-2 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600"
                      >
                          <Icons.Plus className="w-4 h-4" /> Thêm Gói Mới
                      </button>
                  </div>
                  {/* ... Package List ... */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {packages.map(pkg => (
                          <div key={pkg.id} className={`bg-[#12121a] p-4 rounded-2xl border-2 ${pkg.colorTheme} relative group`}>
                              <h3 className="font-bold text-white text-lg">{pkg.name}</h3>
                              <div className="text-2xl font-black text-audi-yellow">{pkg.coin} Vcoin</div>
                              <div className="text-sm text-slate-400">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(pkg.price)}</div>
                              <div className="text-xs text-green-400 font-bold mt-1">{pkg.bonusText}</div>
                              <div className="mt-2 text-[10px] bg-white/5 p-2 rounded text-slate-500 font-mono">
                                  Cú pháp: {pkg.transferContent || 'Tự động'}
                              </div>
                              
                              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => setEditingPackage(pkg)} className="p-2 bg-blue-500 text-white rounded-lg"><Icons.Settings className="w-3 h-3" /></button>
                                  <button onClick={() => handleDeletePackage(pkg.id)} className="p-2 bg-red-500 text-white rounded-lg"><Icons.Trash className="w-3 h-3" /></button>
                              </div>
                          </div>
                      ))}
                  </div>

                  {/* EDIT PACKAGE MODAL */}
                  {editingPackage && (
                      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                          <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl max-h-[90vh] overflow-y-auto">
                              <h3 className="text-xl font-bold text-white mb-4">{editingPackage.id.startsWith('temp_') ? 'Thêm Gói Mới' : 'Sửa Gói Nạp'}</h3>
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="col-span-2">
                                      <label className="text-xs font-bold text-slate-400 uppercase">Tên Gói</label>
                                      <input value={editingPackage.name} onChange={e => setEditingPackage({...editingPackage, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white mt-1" />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold text-slate-400 uppercase">Vcoin nhận được</label>
                                      <input type="number" value={editingPackage.coin} onChange={e => setEditingPackage({...editingPackage, coin: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white mt-1" />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold text-slate-400 uppercase">Giá tiền (VND)</label>
                                      <input type="number" value={editingPackage.price} onChange={e => setEditingPackage({...editingPackage, price: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white mt-1" />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold text-slate-400 uppercase">Bonus Text</label>
                                      <input value={editingPackage.bonusText} onChange={e => setEditingPackage({...editingPackage, bonusText: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white mt-1" placeholder="+10%..." />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold text-slate-400 uppercase">Màu viền (Tailwind)</label>
                                      <input value={editingPackage.colorTheme} onChange={e => setEditingPackage({...editingPackage, colorTheme: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white mt-1" placeholder="border-audi-cyan" />
                                  </div>
                                  <div className="col-span-2">
                                      <label className="text-xs font-bold text-slate-400 uppercase">Nội dung chuyển khoản (Syntax)</label>
                                      <input value={editingPackage.transferContent || ''} onChange={e => setEditingPackage({...editingPackage, transferContent: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white mt-1" placeholder="NAP 50K..." />
                                  </div>
                              </div>
                              <div className="flex gap-3 pt-6">
                                  <button onClick={() => setEditingPackage(null)} className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold">Hủy</button>
                                  <button onClick={handleSavePackage} className="flex-1 py-3 rounded-xl bg-audi-purple text-white font-bold">Lưu Gói</button>
                              </div>
                          </div>
                      </div>
                  )}
              </div>
          )}

          {/* ... Promotion ... */}
          {activeView === 'promotion' && (
              <div className="space-y-6 animate-slide-in-right">
                  <h2 className="text-2xl font-bold text-white">Chương Trình Khuyến Mại</h2>
                  
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10 space-y-6">
                      
                      {/* Marquee Config */}
                      <div>
                          <label className="text-sm font-bold text-slate-300 uppercase mb-2 block">Dòng thông báo chạy (Marquee)</label>
                          <div className="flex gap-2">
                               <input 
                                value={promotion.marqueeText} 
                                onChange={e => setPromotion({...promotion, marqueeText: e.target.value})}
                                className="flex-1 bg-black/40 border border-white/10 rounded-lg p-3 text-white font-game text-sm"
                                placeholder="Nhập nội dung thông báo..."
                               />
                          </div>
                          <p className="text-xs text-slate-500 mt-2">Hiển thị ở đầu trang chủ và trong ứng dụng.</p>
                      </div>

                      <div className="h-px bg-white/5 w-full"></div>

                      {/* Promotion Config */}
                      <div>
                          <label className="text-sm font-bold text-audi-pink uppercase mb-4 block flex items-center gap-2">
                              <Icons.Zap className="w-4 h-4" /> Cấu hình Khuyến Mãi Nạp Thẻ
                          </label>
                          
                          <div className="flex items-center gap-4 mb-4">
                              <div 
                                onClick={() => setPromotion({...promotion, isActive: !promotion.isActive})}
                                className={`w-14 h-8 rounded-full p-1 cursor-pointer transition-colors ${promotion.isActive ? 'bg-green-500' : 'bg-slate-700'}`}
                              >
                                  <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${promotion.isActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                              </div>
                              <span className="font-bold text-white">{promotion.isActive ? 'ĐANG BẬT' : 'ĐANG TẮT'}</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">% Bonus Vcoin</label>
                                  <div className="relative">
                                      <input 
                                        type="number" 
                                        value={promotion.bonusPercent} 
                                        onChange={e => setPromotion({...promotion, bonusPercent: Number(e.target.value)})}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white pl-10"
                                      />
                                      <Icons.Gem className="absolute left-3 top-3.5 w-4 h-4 text-audi-yellow" />
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1">Người dùng sẽ nhận thêm % Vcoin này khi nạp tiền.</p>
                              </div>
                              
                              <div className="col-span-2 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                      <label className="text-xs font-bold text-slate-400 uppercase mb-2 block flex items-center gap-1">
                                          <Icons.Calendar className="w-3 h-3"/> Thời gian bắt đầu
                                      </label>
                                      <input 
                                          type="datetime-local" 
                                          value={promotion.startTime ? new Date(promotion.startTime).toISOString().slice(0, 16) : ''}
                                          onChange={e => setPromotion({...promotion, startTime: new Date(e.target.value).toISOString()})}
                                          className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white font-mono"
                                      />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold text-slate-400 uppercase mb-2 block flex items-center gap-1">
                                          <Icons.Calendar className="w-3 h-3"/> Thời gian kết thúc
                                      </label>
                                      <input 
                                          type="datetime-local" 
                                          value={promotion.endTime ? new Date(promotion.endTime).toISOString().slice(0, 16) : ''}
                                          onChange={e => setPromotion({...promotion, endTime: new Date(e.target.value).toISOString()})}
                                          className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white font-mono"
                                      />
                                  </div>
                              </div>
                          </div>
                      </div>

                      <div className="pt-4 border-t border-white/5">
                          <button onClick={handleSavePromotion} className="px-8 py-3 bg-audi-cyan text-black font-bold rounded-xl shadow-lg hover:bg-cyan-400">
                              Lưu Cấu Hình
                          </button>
                      </div>
                  </div>
              </div>
          )}

           {/* ... System ... */}
           {activeView === 'system' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-white">Chẩn Đoán Hệ Thống</h2>
                      <button onClick={() => runSystemChecks(apiKey)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold text-white flex items-center gap-2">
                          <Icons.Rocket className="w-4 h-4" /> Quét Ngay
                      </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Health Cards */}
                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
                          <h3 className="font-bold text-lg text-white mb-1">Gemini AI Engine</h3>
                          <div className="flex items-center justify-between mb-4">
                              <span className="text-sm text-slate-400">Kết nối</span>
                              <StatusBadge status={health.gemini.status} latency={health.gemini.latency} />
                          </div>
                      </div>

                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
                          <h3 className="font-bold text-lg text-white mb-1">Database</h3>
                          <div className="flex items-center justify-between mb-4">
                              <span className="text-sm text-slate-400">Trạng thái</span>
                              <StatusBadge status={health.supabase.status} latency={health.supabase.latency} />
                          </div>
                      </div>

                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
                          <h3 className="font-bold text-lg text-white mb-1">Cloud Storage</h3>
                          <div className="flex items-center justify-between mb-4">
                              <span className="text-sm text-slate-400">Quyền truy cập</span>
                              <StatusBadge status={health.storage.status} />
                          </div>
                      </div>
                  </div>

                  {/* API Key Configuration */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Lock className="w-5 h-5 text-audi-pink" />
                          Cấu hình Gemini API Key
                      </h3>
                      <div className="space-y-4">
                          <div>
                              <div className="flex justify-between items-end mb-2">
                                  <label className="text-xs font-bold text-slate-400 uppercase">Google GenAI API Key</label>
                                  <div className="flex items-center gap-2">
                                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                                          keyStatus === 'valid' ? 'bg-green-500/20 text-green-400' :
                                          keyStatus === 'invalid' ? 'bg-red-500/20 text-red-400' :
                                          keyStatus === 'checking' ? 'bg-yellow-500/20 text-yellow-400' :
                                          'bg-white/10 text-slate-400'
                                      }`}>
                                          {keyStatus === 'valid' ? 'ACTIVE & SAVED' :
                                           keyStatus === 'invalid' ? 'INVALID KEY' :
                                           keyStatus === 'checking' ? 'VERIFYING...' : 'STATUS UNKNOWN'}
                                      </span>
                                  </div>
                              </div>
                              <div className="flex gap-2">
                                  <input 
                                      type="password" 
                                      value={apiKey}
                                      onChange={(e) => {
                                          setApiKey(e.target.value);
                                          setKeyStatus('unknown');
                                      }}
                                      placeholder="AIzaSy..."
                                      className="flex-1 bg-black/40 border border-white/10 rounded-lg p-3 text-white font-mono text-sm"
                                  />
                                  <button onClick={handleSaveApiKey} disabled={keyStatus === 'checking'} className="px-6 py-3 bg-audi-pink text-white font-bold rounded-lg hover:bg-pink-600 disabled:opacity-50">
                                      {keyStatus === 'checking' ? <Icons.Loader className="animate-spin w-5 h-5"/> : 'Lưu Key'}
                                  </button>
                              </div>
                              <p className="text-xs text-slate-500 mt-2">
                                  Key sẽ được lưu vào Database (Bảng api_keys).
                              </p>
                          </div>
                      </div>
                  </div>
              </div>
           )}

      </div>
    </div>
  );
};
