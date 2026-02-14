
import React, { useState, useEffect } from 'react';
import { Language, Transaction, UserProfile, CreditPackage, PromotionCampaign, Giftcode, GeneratedImage } from '../types';
import { Icons } from '../components/Icons';
import { checkConnection } from '../services/geminiService';
import { checkSupabaseConnection } from '../services/supabaseClient';
import { getAdminStats, savePackage, deletePackage, updateAdminUserProfile, savePromotion, deletePromotion, saveGiftcode, deleteGiftcode, adminApproveTransaction, adminRejectTransaction, saveSystemApiKey, deleteApiKey, deleteTransaction, getSystemApiKey, getApiKeysList, updatePackageOrder } from '../services/economyService';
import { getAllImagesFromStorage, deleteImageFromStorage, checkR2Connection } from '../services/storageService';

// --- INTERFACES ---

interface AdminProps {
  lang: Language;
  isAdmin?: boolean;
}

interface SystemHealth {
  gemini: { status: 'connected' | 'disconnected' | 'checking'; latency: number };
  supabase: { status: 'connected' | 'disconnected' | 'checking'; latency: number };
  storage: { status: 'connected' | 'disconnected' | 'checking'; type: 'R2' | 'Supabase' | 'None' };
}

interface ToastMsg {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'info';
}

interface ConfirmState {
  show: boolean;
  msg?: string;
  title?: string;
  sqlHelp?: string;
  isAlertOnly?: boolean;
  onConfirm: () => void;
}

export const Admin: React.FC<AdminProps> = ({ lang, isAdmin = false }) => {
  // --- STATE ---
  const [activeView, setActiveView] = useState<'overview' | 'transactions' | 'users' | 'packages' | 'promotion' | 'giftcodes' | 'system'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [allImages, setAllImages] = useState<GeneratedImage[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [giftcodes, setGiftcodes] = useState<Giftcode[]>([]);
  const [promotions, setPromotions] = useState<PromotionCampaign[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // NEW: Processing State for smoother UI
  const [processingTxId, setProcessingTxId] = useState<string | null>(null);

  // System & Keys
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'valid' | 'invalid' | 'unknown' | 'checking'>('unknown');
  const [dbKeys, setDbKeys] = useState<any[]>([]);
  const [userSearchEmail, setUserSearchEmail] = useState('');
  
  const [health, setHealth] = useState<SystemHealth>({
      gemini: { status: 'checking', latency: 0 },
      supabase: { status: 'checking', latency: 0 },
      storage: { status: 'checking', type: 'None' }
  });

  // Editing States
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [editingGiftcode, setEditingGiftcode] = useState<Giftcode | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<PromotionCampaign | null>(null);

  // UI States
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState>({ show: false, msg: '', onConfirm: () => {} });

  // --- HELPERS ---
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

  // --- EFFECTS ---
  useEffect(() => {
    if (isAdmin) {
        const init = async () => {
            await refreshData();
            const key = await getSystemApiKey();
            if (key) {
                setApiKey(key);
                setKeyStatus('checking'); 
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
          setPromotions(s.promotions || []);
          setGiftcodes(s.giftcodes || []);
          setTransactions((s.transactions || []).reverse()); 
          const imgs = await getAllImagesFromStorage();
          setAllImages(imgs);
      }
      const keys = await getApiKeysList();
      setDbKeys(keys);
  };

  const runSystemChecks = async (specificKey?: string) => {
      const startGemini = Date.now();
      const keyToUse = specificKey !== undefined ? specificKey : (apiKey || undefined);
      
      const geminiOk = await checkConnection(keyToUse);
      const geminiLatency = Date.now() - startGemini;
      
      const sbCheck = await checkSupabaseConnection();
      const r2Ok = await checkR2Connection();
      
      let storageStatus: 'connected' | 'disconnected' = 'disconnected';
      let storageType: 'R2' | 'Supabase' | 'None' = 'None';

      if (r2Ok) {
          storageStatus = 'connected';
          storageType = 'R2';
      } else if (sbCheck.storage) {
          storageStatus = 'connected';
          storageType = 'Supabase';
      }

      setHealth({
          gemini: { status: geminiOk ? 'connected' : 'disconnected', latency: geminiLatency },
          supabase: { status: sbCheck.db ? 'connected' : 'disconnected', latency: sbCheck.latency },
          storage: { status: storageStatus, type: storageType }
      });
      
      if (keyToUse || geminiOk) {
          setKeyStatus(geminiOk ? 'valid' : 'invalid');
      }
  };

  // --- HANDLERS ---

  // 1. API Key Handlers
  const handleSaveApiKey = async () => {
      if (!apiKey.trim()) return;
      setKeyStatus('checking');
      const isValid = await checkConnection(apiKey);
      
      if (isValid) {
          const result = await saveSystemApiKey(apiKey);
          if (result.success) {
              setKeyStatus('valid');
              showToast('Đã lưu API Key vào Database thành công!');
              await refreshData();
              runSystemChecks(apiKey);
          } else {
              setKeyStatus('unknown');
              if (result.error?.includes('permission') || result.error?.includes('policy') || result.error?.includes('RLS')) {
                  setConfirmDialog({
                      show: true,
                      title: '⚠️ Cần Cấp Quyền Database cho API Key',
                      msg: 'Database chưa cho phép lưu API Key mới. Vui lòng chạy lệnh SQL sau:',
                      sqlHelp: `ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable insert" ON public.api_keys FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable select" ON public.api_keys FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable update" ON public.api_keys FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete" ON public.api_keys FOR DELETE TO authenticated USING (true);`,
                      isAlertOnly: true,
                      onConfirm: () => {}
                  });
              } else {
                  showToast(`Lỗi Database: ${result.error}`, 'error');
              }
          }
      } else {
          setKeyStatus('invalid');
          showToast('API Key không hoạt động.', 'error');
      }
  };

  const handleTestKey = async (key: string) => {
      showToast('Đang kiểm tra...', 'info');
      const isValid = await checkConnection(key);
      if (isValid) showToast('Kết nối thành công!', 'success');
      else showToast('Key không hoạt động.', 'error');
  }

  const handleDeleteApiKey = async (id: string) => {
      showConfirm('Xóa API Key này?', async () => {
          await deleteApiKey(id);
          refreshData();
          showToast('Đã xóa API Key');
      });
  }

  // 2. User Handlers
  const handleSaveUser = async () => {
      if (editingUser) {
          await updateAdminUserProfile(editingUser);
          setEditingUser(null);
          await refreshData();
          showToast('Cập nhật người dùng thành công!');
      }
  };

  // 3. Package Handlers
  const handleSavePackage = async () => {
      if (editingPackage) {
          const result = await savePackage(editingPackage);
          if (result.success) {
              setEditingPackage(null);
              refreshData();
              showToast('Cập nhật gói nạp thành công!');
          } else {
              showToast(`Lỗi: ${result.error}`, 'error');
          }
      }
  };

  const handleDeletePackage = async (id: string) => {
      showConfirm('Xóa gói nạp này?', async () => {
          const result = await deletePackage(id);
          if (result.success) {
              refreshData();
              showToast(result.action === 'hidden' ? 'Gói đã ẩn (do có lịch sử)' : 'Đã xóa gói nạp');
          } else {
              showToast('Lỗi: ' + result.error, 'error');
          }
      });
  };

  const handleMovePackage = async (index: number, direction: number) => {
      const newPackages = [...packages];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= newPackages.length) return;
      [newPackages[index], newPackages[newIndex]] = [newPackages[newIndex], newPackages[index]];
      setPackages(newPackages);
      await updatePackageOrder(newPackages);
  };

  // 4. Giftcode Handlers
  const handleSaveGiftcode = async () => {
      if (editingGiftcode) {
          const result = await saveGiftcode(editingGiftcode);
          if (result.success) {
              setEditingGiftcode(null);
              refreshData();
              showToast('Lưu Giftcode thành công!');
          } else {
              showToast(`Lỗi: ${result.error}`, 'error');
          }
      }
  };

  const handleDeleteGiftcode = async (id: string) => {
      showConfirm('Xóa mã này?', async () => {
          await deleteGiftcode(id);
          refreshData();
          showToast('Đã xóa Giftcode');
      });
  };

  // 5. Promotion Handlers
  const handleSavePromotion = async () => {
      if (editingPromotion) {
          const result = await savePromotion(editingPromotion);
          if (result.success) {
              setEditingPromotion(null);
              refreshData();
              showToast('Lưu chiến dịch thành công!');
          } else {
              showToast(`Lỗi: ${result.error}`, 'error');
          }
      }
  };

  const handleDeletePromotion = async (id: string) => {
      showConfirm('Xóa chiến dịch này?', async () => {
          await deletePromotion(id);
          refreshData();
          showToast('Đã xóa chiến dịch');
      });
  };

  // 6. Transaction Handlers (IMPROVED)
  const handleApproveTransaction = async (txId: string) => {
      showConfirm('Xác nhận duyệt giao dịch và cộng Vcoin?', async () => {
          setProcessingTxId(txId);
          const res = await adminApproveTransaction(txId);
          if (res.success) {
              // Optimistic UI Update
              setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: 'paid' } : t));
              showToast('Đã duyệt thành công!');
          } else {
              showToast('Lỗi: ' + res.error, 'error');
          }
          setProcessingTxId(null);
      });
  }

  const handleRejectTransaction = async (txId: string) => {
      showConfirm('Từ chối giao dịch này?', async () => {
          setProcessingTxId(txId);
          const res = await adminRejectTransaction(txId);
          if (res.success) {
              // Optimistic UI Update
              setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: 'cancelled' } : t));
              showToast('Đã từ chối giao dịch', 'info');
          } else {
              showToast('Lỗi: ' + res.error, 'error');
              if (res.error?.includes('RLS') || res.error?.includes('permission')) {
                   setConfirmDialog({
                      show: true,
                      title: '⚠️ Cần Cấp Quyền Update',
                      msg: 'Database chưa cho phép Admin sửa trạng thái giao dịch. Chạy lệnh sau:',
                      sqlHelp: `CREATE POLICY "Enable update for admin" ON public.transactions FOR UPDATE USING (true);`,
                      isAlertOnly: true,
                      onConfirm: () => {}
                   });
              }
          }
          setProcessingTxId(null);
      });
  }

  const handleDeleteTransaction = async (txId: string) => {
      showConfirm('Xóa lịch sử giao dịch này?', async () => {
          const res = await deleteTransaction(txId);
          if (res.success) {
              setTransactions(prev => prev.filter(t => t.id !== txId));
              showToast('Đã xóa giao dịch', 'info');
          } else {
              if (res.error?.includes('policy') || res.error?.includes('phân quyền')) {
                   setConfirmDialog({
                      show: true,
                      title: '⚠️ Cần Cấp Quyền Xóa Giao Dịch',
                      msg: 'Database chưa cho phép xóa giao dịch. Chạy lệnh sau trong Supabase:',
                      sqlHelp: `CREATE POLICY "Enable delete for admin" ON public.transactions FOR DELETE USING (true);`,
                      isAlertOnly: true,
                      onConfirm: () => {}
                   });
              } else {
                   showToast('Lỗi xóa: ' + res.error, 'error');
              }
          }
      });
  }

  // --- RENDER ---
  if (!isAdmin) {
      return (
          <div className="flex flex-col items-center justify-center h-[70vh] text-center animate-fade-in">
              <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                  <Icons.Lock className="w-10 h-10 text-red-500" />
              </div>
              <h1 className="text-4xl font-game font-bold text-white mb-2">ACCESS DENIED</h1>
              <p className="text-slate-400 font-mono">Khu vực hạn chế. Cần quyền Admin.</p>
          </div>
      );
  }

  const StatusBadge = ({ status, latency }: { status: string, latency?: number }) => (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase ${
          status === 'connected' ? 'bg-green-500/10 border-green-500 text-green-500' :
          status === 'checking' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' :
          'bg-red-500/10 border-red-500 text-red-500'
      }`}>
          <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : status === 'checking' ? 'bg-yellow-500 animate-bounce' : 'bg-red-500'}`}></div>
          {status === 'connected' ? 'Online' : status === 'checking' ? 'Checking...' : 'Offline'}
          {latency !== undefined && latency > 0 && <span className="text-[9px] opacity-70 ml-1">({latency}ms)</span>}
      </div>
  );

  return (
    <div className="min-h-screen pb-24 animate-fade-in bg-[#05050A]">
      
      {/* Toast Notifications */}
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

      {/* Confirm Dialog */}
      {confirmDialog.show && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-[#12121a] border border-white/20 p-6 rounded-2xl max-w-lg w-full shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                  <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-4 text-audi-yellow mx-auto">
                      <Icons.Bell className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white text-center mb-2">{confirmDialog.title || 'Xác nhận'}</h3>
                  <p className="text-slate-400 text-center text-sm mb-6">{confirmDialog.msg}</p>
                  
                  {confirmDialog.sqlHelp && (
                      <div className="mb-6 relative">
                          <pre className="bg-black/50 p-4 rounded-lg border border-red-500/30 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                              {confirmDialog.sqlHelp}
                          </pre>
                          <button onClick={() => copySql(confirmDialog.sqlHelp!)} className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-white" title="Copy">
                              <Icons.Copy className="w-3 h-3" />
                          </button>
                      </div>
                  )}

                  <div className="flex gap-3">
                      {!confirmDialog.isAlertOnly && (
                          <button onClick={() => setConfirmDialog(prev => ({...prev, show: false}))} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold">Hủy</button>
                      )}
                      <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({...prev, show: false})) }} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold">
                          {confirmDialog.isAlertOnly ? 'Đã Hiểu' : 'Đồng ý'}
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {/* Top Bar */}
      <div className="bg-[#12121a] border-b border-white/10 sticky top-[72px] z-40 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-audi-pink flex items-center justify-center text-white font-bold shadow-lg shadow-audi-pink/30">
                      <Icons.Shield className="w-6 h-6" />
                  </div>
                  <div>
                      <h1 className="font-game text-xl font-bold text-white leading-none">QUẢN TRỊ VIÊN</h1>
                      <p className="text-[10px] text-audi-cyan font-mono tracking-widest mt-0.5">V42.0.0 • SYSTEM MONITOR</p>
                  </div>
              </div>
              <div className="flex items-center gap-2">
                  <div title="Gemini API" className={`w-3 h-3 rounded-full ${health.gemini.status === 'connected' ? 'bg-blue-500' : 'bg-red-500'}`}></div>
                  <div title="Database" className={`w-3 h-3 rounded-full ${health.supabase.status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <div title="Storage" className={`w-3 h-3 rounded-full ${health.storage.status === 'connected' ? 'bg-orange-500' : 'bg-red-500'}`}></div>
              </div>
          </div>

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
                          ? 'bg-white text-black shadow-lg' 
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
          
          {/* OVERVIEW */}
          {activeView === 'overview' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                          { title: 'Lượt truy cập (hôm nay)', value: stats?.dashboard?.visitsToday, icon: Icons.Menu, color: 'text-white' },
                          { title: 'Tổng lượt truy cập', value: new Intl.NumberFormat('de-DE').format(stats?.dashboard?.visitsTotal || 0), icon: Icons.Cloud, color: 'text-audi-cyan' },
                          { title: 'Người dùng mới', value: stats?.dashboard?.newUsersToday, icon: Icons.User, color: 'text-white' },
                          { title: 'Tổng người dùng', value: stats?.dashboard?.usersTotal, icon: Icons.User, color: 'text-green-500' },
                          { title: 'Ảnh tạo (hôm nay)', value: stats?.dashboard?.imagesToday, icon: Icons.Image, color: 'text-white' },
                          { title: 'Tổng số ảnh', value: new Intl.NumberFormat('de-DE').format(stats?.dashboard?.imagesTotal || 0), icon: Icons.Image, color: 'text-audi-pink' },
                      ].map((item, i) => (
                          <div key={i} className="bg-[#12121a] border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-lg hover:border-white/10 transition-all">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <p className="text-xs font-bold text-slate-400 uppercase mb-2">{item.title}</p>
                                      <h3 className={`text-4xl font-game font-bold ${item.color}`}>{item.value}</h3>
                                  </div>
                                  <div className="p-3 bg-white/5 rounded-xl text-slate-400">
                                      <item.icon className="w-6 h-6" />
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {/* TRANSACTIONS */}
          {activeView === 'transactions' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-white">Quản Lý Giao Dịch Nạp Tiền</h2>
                      <button onClick={refreshData} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold text-white flex items-center gap-2">
                          <Icons.Clock className="w-4 h-4" /> Làm mới
                      </button>
                  </div>

                  <div className="bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4">Thời gian</th>
                                  <th className="px-6 py-4">Mã đơn</th>
                                  <th className="px-6 py-4">User ID</th>
                                  <th className="px-6 py-4">Gói nạp</th>
                                  <th className="px-6 py-4 text-right">Số tiền</th>
                                  <th className="px-6 py-4">Trạng thái</th>
                                  <th className="px-6 py-4 text-right">Hành động</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {transactions.length === 0 ? (
                                  <tr><td colSpan={7} className="text-center py-8">Chưa có giao dịch nào.</td></tr>
                              ) : transactions.map(tx => (
                                  <tr key={tx.id} className="hover:bg-white/5">
                                      <td className="px-6 py-4 text-xs font-mono">{new Date(tx.createdAt).toLocaleString()}</td>
                                      <td className="px-6 py-4 font-mono font-bold text-white">{tx.code}</td>
                                      <td className="px-6 py-4 text-xs font-mono text-slate-500" title={tx.userId}>{tx.userId.substring(0,8)}...</td>
                                      <td className="px-6 py-4 text-audi-pink font-bold">+{tx.coins} Vcoin</td>
                                      <td className="px-6 py-4 text-right font-bold text-white">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}</td>
                                      <td className="px-6 py-4">
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                              tx.status === 'paid' ? 'bg-green-500/20 text-green-500' : 
                                              tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-500'
                                          }`}>
                                              {tx.status}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                          <div className="flex justify-end gap-2">
                                              {tx.status === 'pending' && (
                                                  <>
                                                      <button 
                                                        onClick={() => handleApproveTransaction(tx.id)} 
                                                        disabled={processingTxId === tx.id}
                                                        className="p-2 bg-green-500/20 text-green-500 rounded hover:bg-green-500 hover:text-white disabled:opacity-50" 
                                                        title="Duyệt"
                                                      >
                                                          {processingTxId === tx.id ? <Icons.Loader className="w-4 h-4 animate-spin" /> : <Icons.Check className="w-4 h-4" />}
                                                      </button>
                                                      <button 
                                                        onClick={() => handleRejectTransaction(tx.id)} 
                                                        disabled={processingTxId === tx.id}
                                                        className="p-2 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white disabled:opacity-50" 
                                                        title="Hủy"
                                                      >
                                                          {processingTxId === tx.id ? <Icons.Loader className="w-4 h-4 animate-spin" /> : <Icons.X className="w-4 h-4" />}
                                                      </button>
                                                  </>
                                              )}
                                              <button onClick={() => handleDeleteTransaction(tx.id)} className="p-2 bg-slate-500/20 text-slate-500 rounded hover:bg-slate-500 hover:text-white" title="Xóa">
                                                  <Icons.Trash className="w-4 h-4" />
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {/* USERS */}
          {activeView === 'users' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-white">Danh Sách Người Dùng</h2>
                      <div className="flex items-center gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-2 w-64">
                          <Icons.Search className="w-4 h-4 text-slate-500" />
                          <input 
                              type="text" 
                              placeholder="Tìm email..." 
                              value={userSearchEmail}
                              onChange={(e) => setUserSearchEmail(e.target.value)}
                              className="bg-transparent border-none outline-none text-sm text-white w-full placeholder-slate-500"
                          />
                      </div>
                  </div>
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4">User</th>
                                  <th className="px-6 py-4">Số dư</th>
                                  <th className="px-6 py-4">Vai trò</th>
                                  <th className="px-6 py-4 text-right">Hành động</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {stats?.usersList
                                  .filter((u: any) => u.email.toLowerCase().includes(userSearchEmail.toLowerCase()))
                                  .map((u: UserProfile) => (
                                  <tr key={u.id} className="hover:bg-white/5">
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <img src={u.avatar} className="w-8 h-8 rounded-full" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
                                              <div>
                                                  <div className="font-bold text-white">{u.username}</div>
                                                  <div className="text-xs text-slate-500">{u.email}</div>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-audi-yellow font-bold font-mono">{u.balance}</td>
                                      <td className="px-6 py-4">
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                              {u.role}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                          <button onClick={() => setEditingUser(u)} className="text-xs font-bold text-audi-cyan hover:bg-audi-cyan/20 px-3 py-1.5 rounded transition-colors">Sửa</button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  {/* Edit User Modal */}
                  {editingUser && (
                      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                          <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-white/20 shadow-2xl">
                              <h3 className="text-xl font-bold text-white mb-4">Sửa Người Dùng</h3>
                              <div className="space-y-4 mb-6">
                                  <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên</label><input value={editingUser.username || ''} onChange={e => setEditingUser({...editingUser, username: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div>
                                  <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Số dư</label><input type="number" value={editingUser.balance || 0} onChange={e => setEditingUser({...editingUser, balance: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div>
                              </div>
                              <div className="flex gap-3">
                                  <button onClick={() => setEditingUser(null)} className="flex-1 py-3 rounded-xl bg-white/5 text-slate-300 font-bold">Hủy</button>
                                  <button onClick={handleSaveUser} className="flex-1 py-3 rounded-xl bg-audi-pink text-white font-bold">Lưu</button>
                              </div>
                          </div>
                      </div>
                  )}
              </div>
          )}

          {/* PACKAGES */}
          {activeView === 'packages' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-white">Cấu Hình Gói Nạp</h2>
                      <button onClick={() => setEditingPackage({ id: `temp_${Date.now()}`, name: 'Gói Mới', coin: 100, price: 50000, currency: 'VND', bonusText: '', bonusPercent: 0, isPopular: false, isActive: true, displayOrder: packages.length, colorTheme: 'border-slate-600', transferContent: 'NAP 50K' })} className="px-4 py-2 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600">
                          <Icons.Plus className="w-4 h-4" /> Thêm Gói
                      </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                      {packages.map((pkg, idx) => (
                          <div key={pkg.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 flex items-center justify-between group hover:border-white/30 transition-all">
                              <div className="flex items-center gap-4">
                                  <div className="flex flex-col gap-1 pr-4 border-r border-white/10">
                                      <button onClick={() => handleMovePackage(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-white/10 rounded text-slate-500 disabled:opacity-30"><Icons.ArrowUp className="w-3 h-3" /></button>
                                      <button onClick={() => handleMovePackage(idx, 1)} disabled={idx === packages.length - 1} className="p-1 hover:bg-white/10 rounded text-slate-500 disabled:opacity-30"><Icons.ArrowUp className="w-3 h-3 rotate-180" /></button>
                                  </div>
                                  <div className={`w-10 h-10 rounded-full border-2 ${pkg.colorTheme} flex items-center justify-center bg-black/50`}>
                                      <Icons.Gem className="w-5 h-5 text-white" />
                                  </div>
                                  <div>
                                      <h4 className="font-bold text-white flex items-center gap-2">{pkg.name} {!pkg.isActive && <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded">HIDDEN</span>} {pkg.isPopular && <span className="text-[9px] bg-audi-pink text-white px-1.5 py-0.5 rounded">HOT</span>}</h4>
                                      <div className="flex gap-3 text-xs text-slate-400"><span>Giá: <b className="text-green-400">{pkg.price.toLocaleString()}đ</b></span><span>Vcoin: <b className="text-audi-yellow">{pkg.coin}</b></span></div>
                                  </div>
                              </div>
                              <div className="flex gap-2">
                                  <button onClick={() => setEditingPackage(pkg)} className="p-2 bg-blue-500/20 text-blue-500 rounded"><Icons.Settings className="w-4 h-4" /></button>
                                  <button onClick={() => handleDeletePackage(pkg.id)} className="p-2 bg-red-500/20 text-red-500 rounded"><Icons.Trash className="w-4 h-4" /></button>
                              </div>
                          </div>
                      ))}
                  </div>
                  {editingPackage && (
                      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                          <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
                              <h3 className="text-xl font-bold text-white mb-6">Sửa Gói Nạp</h3>
                              <div className="space-y-4 mb-6">
                                  <div className="grid grid-cols-2 gap-4">
                                      <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên gói</label><input value={editingPackage.name} onChange={e => setEditingPackage({...editingPackage, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div>
                                      <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tag</label><input value={editingPackage.bonusText} onChange={e => setEditingPackage({...editingPackage, bonusText: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                      <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Giá (VND)</label><input type="number" value={editingPackage.price} onChange={e => setEditingPackage({...editingPackage, price: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-green-400 font-bold" /></div>
                                      <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Vcoin</label><input type="number" value={editingPackage.coin} onChange={e => setEditingPackage({...editingPackage, coin: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold" /></div>
                                  </div>
                                  <div className="flex gap-4 pt-2">
                                      <label className="flex items-center gap-2 text-white"><input type="checkbox" checked={editingPackage.isPopular} onChange={e => setEditingPackage({...editingPackage, isPopular: e.target.checked})} /> Gói HOT</label>
                                      <label className="flex items-center gap-2 text-white"><input type="checkbox" checked={editingPackage.isActive} onChange={e => setEditingPackage({...editingPackage, isActive: e.target.checked})} /> Đang bán</label>
                                  </div>
                              </div>
                              <div className="flex gap-3">
                                  <button onClick={() => setEditingPackage(null)} className="flex-1 py-3 rounded-xl bg-white/5 text-slate-300 font-bold">Hủy</button>
                                  <button onClick={handleSavePackage} className="flex-1 py-3 rounded-xl bg-audi-pink text-white font-bold">Lưu</button>
                              </div>
                          </div>
                      </div>
                  )}
              </div>
          )}

          {/* GIFTCODES */}
          {activeView === 'giftcodes' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-white">Quản Lý Giftcode</h2><button onClick={() => setEditingGiftcode({ id: `temp_${Date.now()}`, code: '', reward: 10, totalLimit: 100, usedCount: 0, maxPerUser: 1, isActive: true })} className="px-4 py-2 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2"><Icons.Plus className="w-4 h-4" /> Tạo Code</button></div>
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase"><tr><th className="px-6 py-4">Code</th><th className="px-6 py-4">Reward</th><th className="px-6 py-4">Usage</th><th className="px-6 py-4 text-right">Action</th></tr></thead>
                          <tbody className="divide-y divide-white/5">
                              {giftcodes.map(c => (
                                  <tr key={c.id} className="hover:bg-white/5"><td className="px-6 py-4 font-mono font-bold text-white">{c.code}</td><td className="px-6 py-4 text-audi-yellow font-bold">+{c.reward}</td><td className="px-6 py-4">{c.usedCount}/{c.totalLimit}</td><td className="px-6 py-4 text-right"><button onClick={() => handleDeleteGiftcode(c.id)} className="p-2 bg-red-500/20 text-red-500 rounded"><Icons.Trash className="w-4 h-4" /></button></td></tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  {editingGiftcode && (
                      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                          <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-white/20 shadow-2xl">
                              <h3 className="text-xl font-bold text-white mb-6">Tạo Giftcode</h3>
                              <div className="space-y-4 mb-6">
                                  <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Code</label><input value={editingGiftcode.code} onChange={e => setEditingGiftcode({...editingGiftcode, code: e.target.value.toUpperCase()})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono" /></div>
                                  <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Vcoin</label><input type="number" value={editingGiftcode.reward} onChange={e => setEditingGiftcode({...editingGiftcode, reward: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div>
                              </div>
                              <div className="flex gap-3"><button onClick={() => setEditingGiftcode(null)} className="flex-1 py-3 bg-white/5 text-slate-300 font-bold rounded-xl">Hủy</button><button onClick={handleSaveGiftcode} className="flex-1 py-3 bg-audi-pink text-white font-bold rounded-xl">Lưu</button></div>
                          </div>
                      </div>
                  )}
              </div>
          )}

          {/* SYSTEM */}
          {activeView === 'system' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-white">Chẩn Đoán Hệ Thống</h2>
                      <button onClick={() => runSystemChecks(apiKey)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold text-white flex items-center gap-2"><Icons.Rocket className="w-4 h-4" /> Quét Ngay</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6"><h3 className="font-bold text-lg text-white mb-1">Gemini AI</h3><StatusBadge status={health.gemini.status} latency={health.gemini.latency} /></div>
                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6"><h3 className="font-bold text-lg text-white mb-1">Database</h3><StatusBadge status={health.supabase.status} latency={health.supabase.latency} /></div>
                      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6"><h3 className="font-bold text-lg text-white mb-1">Storage</h3><StatusBadge status={health.storage.status} /></div>
                  </div>
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <h3 className="font-bold text-lg text-white mb-4">Cấu hình API Key</h3>
                      <div className="flex gap-2 relative"><input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => { setApiKey(e.target.value); setKeyStatus('unknown'); }} placeholder="AIzaSy..." className="flex-1 bg-black/40 border border-white/10 rounded-lg p-3 text-white font-mono text-sm pr-12" /><button onClick={() => setShowKey(!showKey)} className="absolute right-36 top-3 text-slate-500 hover:text-white" title="Hiện/Ẩn Key">{showKey ? <Icons.Eye className="w-5 h-5" /> : <Icons.Lock className="w-5 h-5" />}</button><button onClick={handleSaveApiKey} disabled={keyStatus === 'checking'} className="px-6 py-3 bg-audi-pink text-white font-bold rounded-lg hover:bg-pink-600 disabled:opacity-50">{keyStatus === 'checking' ? <Icons.Loader className="animate-spin w-5 h-5"/> : 'Lưu Key'}</button></div>
                  </div>
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <h3 className="font-bold text-lg text-white mb-4">Danh sách Key</h3>
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead><tr><th className="px-4 py-2">ID</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Action</th></tr></thead>
                          <tbody>
                              {dbKeys.map(k => (
                                  <tr key={k.id} className="border-t border-white/5"><td className="px-4 py-2 font-mono">{k.id.substring(0,8)}...</td><td className="px-4 py-2">{k.status}</td><td className="px-4 py-2 text-right"><button onClick={() => handleDeleteApiKey(k.id)} className="text-red-500 hover:text-white"><Icons.Trash className="w-4 h-4" /></button></td></tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

      </div>
    </div>
  );
};
