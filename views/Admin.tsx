
import React, { useState, useEffect } from 'react';
import { Language, Transaction, UserProfile, CreditPackage, PromotionCampaign, Giftcode, GeneratedImage } from '../types';
import { Icons } from '../components/Icons';
import { checkConnection } from '../services/geminiService';
import { checkSupabaseConnection } from '../services/supabaseClient';
import { getAdminStats, savePackage, deletePackage, updateAdminUserProfile, savePromotion, deletePromotion, saveGiftcode, deleteGiftcode, adminApproveTransaction, adminRejectTransaction, saveSystemApiKey, deleteApiKey, deleteTransaction, getSystemApiKey, getApiKeysList, updatePackageOrder, getGiftcodePromoConfig, saveGiftcodePromoConfig } from '../services/economyService';
import { getAllImagesFromStorage, deleteImageFromStorage, checkR2Connection } from '../services/storageService';

interface AdminProps {
  lang: Language;
  isAdmin?: boolean; 
}

interface SystemHealth {
    gemini: { status: 'connected' | 'disconnected' | 'checking'; latency: number };
    supabase: { status: 'connected' | 'disconnected' | 'checking'; latency: number };
    storage: { status: 'connected' | 'disconnected' | 'checking'; type: 'R2' | 'Supabase' | 'None' };
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
  const [promotions, setPromotions] = useState<PromotionCampaign[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // API Key States
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'valid' | 'invalid' | 'unknown' | 'checking'>('unknown');
  const [dbKeys, setDbKeys] = useState<any[]>([]); // List of keys from DB
  
  // Giftcode Promo Config
  const [giftcodePromo, setGiftcodePromo] = useState({ text: '', isActive: false });

  // Search States
  const [userSearchEmail, setUserSearchEmail] = useState('');

  // Health State
  const [health, setHealth] = useState<SystemHealth>({
      gemini: { status: 'checking', latency: 0 },
      supabase: { status: 'checking', latency: 0 },
      storage: { status: 'checking', type: 'None' }
  });

  // Modal States
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [editingGiftcode, setEditingGiftcode] = useState<Giftcode | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<PromotionCampaign | null>(null);

  // UX States
  const [processingTxId, setProcessingTxId] = useState<string | null>(null);

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
          setPromotions(s.promotions || []);
          setGiftcodes(s.giftcodes || []);
          // Transactions are already sorted by DESC in getAdminStats now
          setTransactions(s.transactions || []); 
          const imgs = await getAllImagesFromStorage();
          setAllImages(imgs);
      }
      
      // Fetch DB Keys list
      const keys = await getApiKeysList();
      setDbKeys(keys);

      // Fetch Giftcode Config
      const promoConfig = await getGiftcodePromoConfig();
      setGiftcodePromo(promoConfig);
  };

  const runSystemChecks = async (specificKey?: string) => {
      const startGemini = Date.now();
      const keyToUse = specificKey !== undefined ? specificKey : (apiKey || undefined);
      
      // 1. Check Gemini
      const geminiOk = await checkConnection(keyToUse);
      const geminiLatency = Date.now() - startGemini;
      
      // 2. Check Supabase DB
      const sbCheck = await checkSupabaseConnection();

      // 3. Check R2 Storage
      const r2Ok = await checkR2Connection();
      
      // Determine Storage Status
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

  // --- ACTIONS ---

  const handleSaveApiKey = async () => {
      if (!apiKey.trim()) return;
      
      setKeyStatus('checking');
      const isValid = await checkConnection(apiKey);
      
      if (isValid) {
          const result = await saveSystemApiKey(apiKey);
          if (result.success) {
              setKeyStatus('valid');
              showToast('Đã lưu API Key vào Database thành công!');
              await refreshData(); // Refresh list
              runSystemChecks(apiKey);
          } else {
              setKeyStatus('unknown');
              if (result.error?.includes('permission') || result.error?.includes('policy') || result.error?.includes('RLS')) {
                  setConfirmDialog({
                      show: true,
                      title: '⚠️ Cần Cấp Quyền Database cho API Key',
                      msg: 'Database chưa cho phép lưu API Key mới. Vui lòng chạy lệnh SQL sau để cấp quyền:',
                      sqlHelp: `ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable insert for authenticated users only" ON public.api_keys FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable read for authenticated users only" ON public.api_keys FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable update for authenticated users only" ON public.api_keys FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users only" ON public.api_keys FOR DELETE TO authenticated USING (true);`,
                      isAlertOnly: true,
                      onConfirm: () => {}
                  });
              } else {
                  showToast(`Lỗi Database: ${result.error}`, 'error');
              }
          }
      } else {
          setKeyStatus('invalid');
          showToast('API Key không hoạt động. Vui lòng kiểm tra lại.', 'error');
      }
  };

  const handleTestKey = async (key: string) => {
      showToast('Đang kiểm tra key...', 'info');
      const isValid = await checkConnection(key);
      if (isValid) {
          showToast('Kết nối thành công! Key hoạt động tốt.', 'success');
      } else {
          showToast('Key không hoạt động hoặc hết hạn ngạch.', 'error');
      }
  }

  const handleDeleteApiKey = async (id: string) => {
      showConfirm('Xóa API Key này khỏi database?', async () => {
          await deleteApiKey(id);
          refreshData();
          showToast('Đã xóa API Key');
      });
  }

  const handleSaveUser = async () => {
      if (editingUser) {
          await updateAdminUserProfile(editingUser);
          setEditingUser(null);
          await refreshData(); // Await to ensure UI updates
          showToast('Cập nhật người dùng thành công!');
      }
  };

  const handleSavePackage = async () => {
      if (editingPackage) {
          const result = await savePackage(editingPackage);
          if (result.success) {
              setEditingPackage(null);
              refreshData();
              showToast('Cập nhật gói nạp thành công!');
          } else {
              // 1. Check for RLS Errors
              if (result.error?.includes('RLS') || result.error?.includes('permission') || result.error?.includes('policy')) {
                  setConfirmDialog({
                      show: true,
                      title: '⚠️ Cần Cấp Quyền Database (RLS)',
                      msg: 'Database đang chặn việc lưu Gói Nạp. Hãy copy đoạn mã dưới đây và chạy trong SQL Editor của Supabase:',
                      sqlHelp: `ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for credit packages" ON public.credit_packages FOR ALL USING (true) WITH CHECK (true);`,
                      isAlertOnly: true,
                      onConfirm: () => {}
                  });
              } 
              // 2. Check for Missing Column Errors (transfer_syntax)
              else if (result.error?.includes('transfer_syntax') || result.error?.includes('column')) {
                  setConfirmDialog({
                      show: true,
                      title: '⚠️ Cần Cập Nhật Database (Thiếu Cột)',
                      msg: 'Database thiếu cột "transfer_syntax" hoặc "bonus_credits". Hãy chạy lệnh SQL sau để sửa:',
                      sqlHelp: `ALTER TABLE public.credit_packages 
ADD COLUMN IF NOT EXISTS transfer_syntax text DEFAULT '',
ADD COLUMN IF NOT EXISTS bonus_credits int8 DEFAULT 0;`,
                      isAlertOnly: true,
                      onConfirm: () => {}
                  });
              }
              else {
                  showToast(`Lỗi: ${result.error}`, 'error');
              }
          }
      }
  };

  const handleDeletePackage = async (id: string) => {
      showConfirm('Bạn có chắc chắn muốn xóa gói nạp này?', async () => {
          const result = await deletePackage(id);
          if (result.success) {
              refreshData();
              if (result.action === 'hidden') {
                  showToast('Gói đã chuyển sang trạng thái ẨN (do có giao dịch lịch sử)', 'info');
              } else {
                  showToast('Đã xóa gói nạp vĩnh viễn');
              }
          } else {
              showToast('Lỗi khi xóa: ' + result.error, 'error');
          }
      });
  };

  const handleMovePackage = async (index: number, direction: number) => {
      const newPackages = [...packages];
      const newIndex = index + direction;

      if (newIndex < 0 || newIndex >= newPackages.length) return;

      // Swap elements
      [newPackages[index], newPackages[newIndex]] = [newPackages[newIndex], newPackages[index]];
      
      // Update local state immediately for UI response
      setPackages(newPackages);

      // Call service to update order in DB
      const result = await updatePackageOrder(newPackages);
      if (!result.success) {
          showToast('Lỗi khi lưu thứ tự: ' + result.error, 'error');
          // Revert if needed, but for now we let it stay locally
      }
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

  const handleSaveGiftcodePromo = async () => {
      const result = await saveGiftcodePromoConfig(giftcodePromo.text, giftcodePromo.isActive);
      if (result.success) {
          showToast('Đã lưu thông báo thành công!');
      } else {
          // Check for RLS
          if (result.error?.includes('permission') || result.error?.includes('policy')) {
              setConfirmDialog({
                  show: true,
                  title: '⚠️ Cần Cấp Quyền Settings',
                  msg: 'Cần mở quyền ghi cho bảng system_settings.',
                  sqlHelp: `ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access" ON public.system_settings FOR ALL USING (true) WITH CHECK (true);`,
                  isAlertOnly: true,
                  onConfirm: () => {}
              });
          } else {
              showToast('Lỗi lưu: ' + result.error, 'error');
          }
      }
  }

  const handleSavePromotion = async () => {
      if (editingPromotion) {
          const result = await savePromotion(editingPromotion);
          if (result.success) {
              setEditingPromotion(null);
              refreshData();
              showToast('Lưu chiến dịch thành công!');
          } else {
              // DETECT MISSING COLUMN ERROR AND SHOW SQL HELP
              if (result.error?.includes('column') || result.error?.includes('bonus_percent') || result.error?.includes('title')) {
                  setConfirmDialog({
                      show: true,
                      title: '⚠️ Cấu trúc Database chưa đồng bộ',
                      msg: 'Bảng "promotions" thiếu các cột quan trọng. Vui lòng chạy lệnh SQL sau trong Supabase Editor:',
                      sqlHelp: `ALTER TABLE public.promotions 
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS bonus_percent int8 DEFAULT 0,
ADD COLUMN IF NOT EXISTS start_time timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS end_time timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Enable RLS just in case
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable access" ON public.promotions FOR ALL USING (true) WITH CHECK (true);`,
                      isAlertOnly: true,
                      onConfirm: () => {}
                  });
              } else {
                  showToast(`Lỗi: ${result.error}`, 'error');
              }
          }
      }
  };

  const handleDeletePromotion = async (id: string) => {
      showConfirm('Xóa chiến dịch này vĩnh viễn?', async () => {
          await deletePromotion(id);
          refreshData();
          showToast('Đã xóa chiến dịch');
      });
  };

  const handleDeleteContent = async (id: string) => {
      showConfirm('Xóa vĩnh viễn hình ảnh này?', async () => {
          await deleteImageFromStorage(id);
          setAllImages(prev => prev.filter(img => img.id !== id));
          showToast('Đã xóa ảnh');
      });
  }

  const handleApproveTransaction = async (txId: string) => {
      if (processingTxId) return;

      showConfirm('Xác nhận duyệt giao dịch này và cộng Vcoin cho user?', async () => {
          setProcessingTxId(txId);
          const result = await adminApproveTransaction(txId);
          if (result.success) {
              // Optimistic update for UI smoothness
              setTransactions(prev => prev.map(t => 
                  t.id === txId ? { ...t, status: 'paid' } : t
              ));
              showToast('Đã duyệt thành công!');
              
              // Force Refresh Data to verify persistence
              await refreshData();
          } else {
              if (result.error?.includes('RLS') || result.error?.includes('permission') || result.error?.includes('policy')) {
                  setConfirmDialog({
                      show: true,
                      title: '⚠️ Cần Cấp Quyền Duyệt Giao Dịch',
                      msg: 'Database chưa cho phép tài khoản của bạn cập nhật trạng thái giao dịch. Chạy lệnh sau để sửa:',
                      sqlHelp: `ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);`,
                      isAlertOnly: true,
                      onConfirm: () => {}
                  });
              } else {
                  showToast('Lỗi: ' + result.error, 'error');
                  // Revert if failed
                  await refreshData();
              }
          }
          setProcessingTxId(null);
      });
  }

  const handleRejectTransaction = async (txId: string) => {
      if (processingTxId) return;

      showConfirm('Từ chối giao dịch này?', async () => {
          setProcessingTxId(txId);
          const result = await adminRejectTransaction(txId);
          if (result.success) {
              // Optimistic update
              setTransactions(prev => prev.map(t => 
                  t.id === txId ? { ...t, status: 'failed' } : t
              ));
              showToast('Đã từ chối giao dịch', 'info');
              
              // Force refresh to verify
              await refreshData();
          } else {
              if (result.error?.includes('RLS') || result.error?.includes('permission') || result.error?.includes('policy')) {
                  setConfirmDialog({
                      show: true,
                      title: '⚠️ Cần Cấp Quyền Duyệt Giao Dịch',
                      msg: 'Database chưa cho phép tài khoản của bạn cập nhật trạng thái giao dịch. Chạy lệnh sau để sửa:',
                      sqlHelp: `ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);`,
                      isAlertOnly: true,
                      onConfirm: () => {}
                  });
              } else {
                  showToast('Lỗi: ' + result.error, 'error');
              }
          }
          setProcessingTxId(null);
      });
  }

  const handleDeleteTransaction = async (txId: string) => {
      if (processingTxId) return;

      showConfirm('Xóa lịch sử giao dịch này khỏi hệ thống?', async () => {
          setProcessingTxId(txId);
          const res = await deleteTransaction(txId);
          if (res.success) {
              // Optimistic update
              setTransactions(prev => prev.filter(t => t.id !== txId));
              showToast('Đã xóa giao dịch vĩnh viễn', 'info');
          } else {
              // Handle known errors (RLS or not found)
              if (res.error?.includes('policy') || res.error?.includes('phân quyền') || res.error?.includes('RLS')) {
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
          setProcessingTxId(null);
      });
  }

  const handleFixShowcasePermissions = () => {
      setConfirmDialog({
          show: true,
          title: '🔧 Sửa lỗi Showcase (Ảnh không hiện)',
          msg: 'Lỗi này xảy ra do Database chưa cấp quyền "Công Khai" cho các ảnh được chia sẻ (is_public = true). Hãy chạy lệnh SQL dưới đây trong Supabase Editor:',
          sqlHelp: `-- 1. Cho phép mọi người (anon) xem ảnh đã public
create policy "Allow public viewing of shared images"
on public.generated_images
for select
to anon
using (is_public = true);

-- 2. (Tùy chọn) Cho phép lấy tên tác giả
create policy "Allow public reading of basic user info"
on public.users
for select
to anon
using (true);`,
          isAlertOnly: true,
          onConfirm: () => {}
      });
  };

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
          {status === 'connected' ? 'Ổn định' : status === 'checking' ? 'Checking' : 'Mất kết nối'}
          {latency !== undefined && latency > 0 && <span className="text-[9px] opacity-70 ml-1">({latency}ms)</span>}
      </div>
  );

  return (
    <div className="min-h-screen pb-24 animate-fade-in bg-[#05050A]">
      
      {/* --- TOASTS CONTAINER --- */}
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4 md:px-0">
          {toasts.map(t => (
              <div key={t.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl animate-fade-in backdrop-blur-md ${
                  t.type === 'success' ? 'bg-[#0f1f12]/90 border-green-500/50 text-green-400' : 
                  t.type === 'error' ? 'bg-[#1f0f0f]/90 border-red-500/50 text-red-400' : 'bg-[#0f151f]/90 border-blue-500/50 text-blue-400'
              }`}>
                  {t.type === 'success' && <Icons.Check className="w-5 h-5 shrink-0" />}
                  {t.type === 'error' && <Icons.X className="w-5 h-5 shrink-0" />}
                  {t.type === 'info' && <Icons.Info className="w-5 h-5 shrink-0" />}
                  <span className="text-sm font-bold break-words">{t.msg}</span>
              </div>
          ))}
      </div>

      {/* --- CONFIRM / ALERT DIALOG (Updated Overlay) --- */}
      {confirmDialog.show && (
          <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 pt-24 animate-fade-in overflow-y-auto">
              <div className="bg-[#12121a] border border-white/20 p-6 rounded-2xl max-w-lg w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] transform scale-100 transition-all m-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-4 text-audi-yellow mx-auto">
                      <Icons.Bell className="w-6 h-6 animate-swing" />
                  </div>
                  <h3 className="text-lg font-bold text-white text-center mb-2">{confirmDialog.title || 'Thông báo'}</h3>
                  <p className="text-slate-400 text-center text-sm mb-6 leading-relaxed">{confirmDialog.msg}</p>
                  
                  {confirmDialog.sqlHelp && (
                      <div className="mb-6 relative">
                          <pre className="bg-black/50 p-4 rounded-lg border border-red-500/30 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap max-h-40">
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
      
      {/* Top Command Bar */}
      <div className="bg-[#12121a] border-b border-white/10 sticky top-[72px] z-40 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-audi-pink flex items-center justify-center text-white font-bold shadow-lg shadow-audi-pink/30">
                      <Icons.Shield className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div>
                      <h1 className="font-game text-base md:text-xl font-bold text-white leading-none">QUẢN TRỊ</h1>
                      <p className="text-[9px] md:text-[10px] text-audi-cyan font-mono tracking-widest mt-0.5 hidden md:block">V42.0.0-RELEASE • SYSTEM MONITOR</p>
                  </div>
              </div>

              {/* Quick Health Indicators (Compact Mobile) */}
              <div className="flex items-center gap-2 bg-black/40 px-2 py-1 rounded-full border border-white/5">
                  <div title="Gemini" className={`w-2 h-2 rounded-full ${health.gemini.status === 'connected' ? 'bg-blue-500' : 'bg-red-500'}`}></div>
                  <div title="DB" className={`w-2 h-2 rounded-full ${health.supabase.status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <div title="Storage" className={`w-2 h-2 rounded-full ${health.storage.status === 'connected' ? 'bg-orange-500' : 'bg-red-500'}`}></div>
              </div>
          </div>

          {/* Navigation Tabs (Scrollable) */}
          <div className="max-w-7xl mx-auto px-4 flex gap-2 overflow-x-auto no-scrollbar py-2 border-t border-white/5">
              {[
                  { id: 'overview', icon: Icons.Home, label: 'Tổng Quan' },
                  { id: 'transactions', icon: Icons.Gem, label: 'Giao Dịch' },
                  { id: 'users', icon: Icons.User, label: 'Người Dùng' },
                  { id: 'packages', icon: Icons.ShoppingBag, label: 'Gói Nạp' },
                  { id: 'giftcodes', icon: Icons.Gift, label: 'Code' },
                  { id: 'promotion', icon: Icons.Zap, label: 'Sự Kiện' },
                  { id: 'system', icon: Icons.Cpu, label: 'Hệ Thống' },
              ].map(tab => (
                  <button
                      key={tab.id}
                      onClick={() => setActiveView(tab.id as any)}
                      className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                          activeView === tab.id 
                          ? 'bg-white text-black shadow-md' 
                          : 'text-slate-400 hover:text-white hover:bg-white/5 bg-white/5 border border-white/5'
                      }`}
                  >
                      <tab.icon className="w-3 h-3 md:w-4 md:h-4" />
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
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                      {[
                          { title: 'Truy cập hôm nay', value: stats?.dashboard?.visitsToday, icon: Icons.Menu, color: 'text-white' },
                          { title: 'Tổng truy cập', value: new Intl.NumberFormat('de-DE').format(stats?.dashboard?.visitsTotal || 0), icon: Icons.Cloud, color: 'text-audi-cyan' },
                          { title: 'User mới hôm nay', value: stats?.dashboard?.newUsersToday, icon: Icons.User, color: 'text-white' },
                          { title: 'Tổng User', value: stats?.dashboard?.usersTotal, icon: Icons.User, color: 'text-green-500' },
                          { title: 'Ảnh hôm nay', value: stats?.dashboard?.imagesToday, icon: Icons.Image, color: 'text-white' },
                          { title: 'Tổng số ảnh', value: new Intl.NumberFormat('de-DE').format(stats?.dashboard?.imagesTotal || 0), icon: Icons.Image, color: 'text-audi-pink' },
                      ].map((item, i) => (
                          <div key={i} className="bg-[#12121a] border border-white/5 rounded-2xl p-4 md:p-6 relative overflow-hidden shadow-lg hover:border-white/10 transition-all">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <p className="text-[9px] md:text-xs font-bold text-slate-400 uppercase mb-1 md:mb-2 truncate">{item.title}</p>
                                      <h3 className={`text-2xl md:text-4xl font-game font-bold ${item.color} drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]`}>
                                          {item.value}
                                      </h3>
                                  </div>
                                  <div className="p-2 md:p-3 bg-white/5 rounded-xl text-slate-400 hidden md:block">
                                      <item.icon className="w-6 h-6" />
                                  </div>
                              </div>
                              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                          </div>
                      ))}
                  </div>

                  {/* AI Stats Table (Mobile Card View) */}
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 md:p-6 shadow-xl">
                      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                          <Icons.BarChart className="w-5 h-5 text-audi-yellow" />
                          Thống Kê Sử Dụng
                      </h3>
                      
                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-400">
                              <thead className="bg-[#090014] text-xs font-bold text-slate-500 uppercase">
                                  <tr>
                                      <th className="px-6 py-4">Tính năng</th>
                                      <th className="px-6 py-4 text-audi-cyan">Số lượt</th>
                                      <th className="px-6 py-4 text-audi-pink">Vcoin tiêu thụ</th>
                                      <th className="px-6 py-4 text-right text-green-500">Doanh Thu (Ước tính)</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {stats?.dashboard?.aiUsage && stats.dashboard.aiUsage.length > 0 ? (
                                      stats.dashboard.aiUsage.map((row: any, i: number) => (
                                          <tr key={i} className="hover:bg-white/5 transition-colors">
                                              <td className="px-6 py-4 font-bold text-white capitalize">{row.feature}</td>
                                              <td className="px-6 py-4 text-audi-cyan font-mono">{new Intl.NumberFormat('de-DE').format(row.count)}</td>
                                              <td className="px-6 py-4 text-audi-pink font-bold">{new Intl.NumberFormat('de-DE').format(row.vcoins)} Vcoin</td>
                                              <td className="px-6 py-4 text-right text-green-500 font-bold">
                                                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.revenue)}
                                              </td>
                                          </tr>
                                      ))
                                  ) : (
                                      <tr>
                                          <td colSpan={4} className="px-6 py-8 text-center text-slate-500 italic">Chưa có dữ liệu.</td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>

                      {/* Mobile Card List */}
                      <div className="md:hidden space-y-3">
                          {stats?.dashboard?.aiUsage && stats.dashboard.aiUsage.length > 0 ? (
                              stats.dashboard.aiUsage.map((row: any, i: number) => (
                                  <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/5 flex justify-between items-center">
                                      <div>
                                          <div className="font-bold text-white capitalize text-sm">{row.feature}</div>
                                          <div className="text-xs text-slate-500">{new Intl.NumberFormat('de-DE').format(row.count)} lượt</div>
                                      </div>
                                      <div className="text-right">
                                          <div className="text-audi-pink font-bold text-sm">{new Intl.NumberFormat('de-DE').format(row.vcoins)} VC</div>
                                          <div className="text-green-500 text-[10px] font-bold">
                                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.revenue)}
                                          </div>
                                      </div>
                                  </div>
                              ))
                          ) : (
                              <div className="text-center text-slate-500 italic text-sm py-4">Chưa có dữ liệu.</div>
                          )}
                      </div>
                  </div>
              </div>
          )}

          {/* ================= VIEW: TRANSACTIONS (MOBILE OPTIMIZED) ================= */}
          {activeView === 'transactions' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Giao Dịch</h2>
                      <button onClick={refreshData} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs md:text-sm font-bold text-white flex items-center gap-2">
                          <Icons.Clock className="w-3 h-3 md:w-4 md:h-4" /> Làm mới
                      </button>
                  </div>

                  {/* DESKTOP TABLE */}
                  <div className="hidden md:block bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4">Thời gian</th>
                                  <th className="px-6 py-4">Mã đơn</th>
                                  <th className="px-6 py-4">Người dùng</th>
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
                                  <tr key={tx.id} className={`hover:bg-white/5 transition-colors ${processingTxId === tx.id ? 'opacity-50 pointer-events-none' : ''}`}>
                                      <td className="px-6 py-4 text-xs font-mono">{new Date(tx.createdAt).toLocaleString()}</td>
                                      <td className="px-6 py-4 font-mono font-bold text-white">{tx.code}</td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <img src={tx.userAvatar || 'https://picsum.photos/100/100'} className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                                              <div className="flex flex-col">
                                                  <span className="font-bold text-white text-xs">{tx.userName || 'Unknown'}</span>
                                                  <span className="text-[10px] text-slate-500">{tx.userEmail || 'No Email'}</span>
                                              </div>
                                          </div>
                                      </td>
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
                                                      <button onClick={() => handleApproveTransaction(tx.id)} className="p-2 bg-green-500/20 text-green-500 rounded hover:bg-green-500 hover:text-white" title="Duyệt"><Icons.Check className="w-4 h-4" /></button>
                                                      <button onClick={() => handleRejectTransaction(tx.id)} className="p-2 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white" title="Hủy"><Icons.X className="w-4 h-4" /></button>
                                                  </>
                                              )}
                                              <button onClick={() => handleDeleteTransaction(tx.id)} className="p-2 bg-slate-500/20 text-slate-500 rounded hover:bg-slate-500 hover:text-white" title="Xóa"><Icons.Trash className="w-4 h-4" /></button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {/* MOBILE CARDS */}
                  <div className="md:hidden space-y-4">
                      {transactions.length === 0 ? (
                          <div className="text-center text-slate-500 py-8">Chưa có giao dịch nào.</div>
                      ) : transactions.map(tx => (
                          <div key={tx.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 relative overflow-hidden shadow-md">
                              {/* Status Line */}
                              <div className={`absolute top-0 left-0 w-1 h-full ${
                                  tx.status === 'paid' ? 'bg-green-500' : 
                                  tx.status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
                              }`}></div>
                              
                              <div className="pl-3">
                                  <div className="flex justify-between items-start mb-3">
                                      <div className="flex items-center gap-3">
                                          <img src={tx.userAvatar || 'https://picsum.photos/100/100'} className="w-10 h-10 rounded-full border border-white/10 object-cover bg-black" />
                                          <div>
                                              <div className="font-bold text-white text-sm">{tx.userName || 'Unknown'}</div>
                                              <div className="text-xs text-slate-500 font-mono">{tx.code}</div>
                                          </div>
                                      </div>
                                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                          tx.status === 'paid' ? 'bg-green-500/10 text-green-500 border border-green-500/30' : 
                                          tx.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30' : 
                                          'bg-red-500/10 text-red-500 border border-red-500/30'
                                      }`}>
                                          {tx.status}
                                      </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4 mb-3 bg-white/5 p-3 rounded-lg">
                                      <div>
                                          <div className="text-[10px] text-slate-500 uppercase font-bold">Số tiền</div>
                                          <div className="text-white font-bold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}</div>
                                      </div>
                                      <div>
                                          <div className="text-[10px] text-slate-500 uppercase font-bold">Gói nạp</div>
                                          <div className="text-audi-pink font-bold">+{tx.coins} Vcoin</div>
                                      </div>
                                  </div>
                                  
                                  <div className="text-[10px] text-slate-600 font-mono mb-3 text-right">{new Date(tx.createdAt).toLocaleString()}</div>

                                  <div className="flex gap-2 border-t border-white/5 pt-3">
                                      {tx.status === 'pending' && (
                                          <>
                                              <button onClick={() => handleApproveTransaction(tx.id)} className="flex-1 py-2 bg-green-500 text-white rounded-lg font-bold text-xs shadow-lg shadow-green-500/20 active:scale-95 transition-all">
                                                  DUYỆT ĐƠN
                                              </button>
                                              <button onClick={() => handleRejectTransaction(tx.id)} className="flex-1 py-2 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg font-bold text-xs active:scale-95 transition-all">
                                                  HỦY
                                              </button>
                                          </>
                                      )}
                                      <button onClick={() => handleDeleteTransaction(tx.id)} className="px-3 py-2 bg-slate-800 text-slate-400 rounded-lg font-bold text-xs border border-white/10 active:scale-95">
                                          <Icons.Trash className="w-4 h-4" />
                                      </button>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {activeView === 'users' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Người Dùng</h2>
                      <div className="flex items-center gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-2 w-full md:w-64">
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

                  {/* Desktop Table */}
                  <div className="hidden md:block bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4">User</th>
                                  <th className="px-6 py-4">Số dư</th>
                                  <th className="px-6 py-4">Vai trò</th>
                                  <th className="px-6 py-4">Ngày tham gia</th>
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
                                              <img src={u.avatar} className="w-8 h-8 rounded-full border border-white/10" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
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
                                      <td className="px-6 py-4 text-xs font-mono">{u.lastCheckin ? new Date(u.lastCheckin).toLocaleDateString() : 'N/A'}</td>
                                      <td className="px-6 py-4 text-right">
                                          <button onClick={() => setEditingUser(u)} className="text-xs font-bold text-audi-cyan hover:text-white bg-audi-cyan/10 hover:bg-audi-cyan/30 px-3 py-1.5 rounded transition-colors">
                                              Sửa
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden grid grid-cols-1 gap-4">
                        {stats?.usersList
                            .filter((u: any) => u.email.toLowerCase().includes(userSearchEmail.toLowerCase()))
                            .map((u: UserProfile) => (
                            <div key={u.id} className="bg-[#12121a] p-4 rounded-xl border border-white/10 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <img src={u.avatar} className="w-12 h-12 rounded-full border border-white/10 shrink-0" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
                                    <div className="min-w-0">
                                        <div className="font-bold text-white text-sm truncate">{u.username}</div>
                                        <div className="text-xs text-slate-500 truncate">{u.email}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-audi-yellow font-mono font-bold text-xs">{u.balance} VC</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${u.role === 'admin' ? 'text-red-500 border-red-500/30' : 'text-blue-500 border-blue-500/30'}`}>
                                                {u.role}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setEditingUser(u)} 
                                    className="ml-2 p-2 bg-white/5 rounded-lg text-slate-400 hover:text-white border border-white/5 shrink-0"
                                >
                                    <Icons.Settings className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                  </div>
              </div>
          )}

          {activeView === 'packages' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Gói Nạp</h2>
                      <button 
                          onClick={() => setEditingPackage({
                              id: `temp_${Date.now()}`, name: 'Gói Mới', coin: 100, price: 50000, currency: 'VND', bonusText: '', bonusPercent: 0, isPopular: false, isActive: true, displayOrder: packages.length, colorTheme: 'border-slate-600', transferContent: 'NAP 50K'
                          })}
                          className="px-3 py-1.5 md:px-4 md:py-2 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"
                      >
                          <Icons.Plus className="w-4 h-4" /> Thêm Gói
                      </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                      {packages.map((pkg, idx) => (
                          <div key={pkg.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 flex items-center justify-between group hover:border-white/30 transition-all shadow-md">
                              <div className="flex items-center gap-3 md:gap-4">
                                  <div className="flex flex-col gap-1 pr-3 md:pr-4 border-r border-white/10">
                                      <button onClick={() => handleMovePackage(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-white/10 rounded text-slate-500 disabled:opacity-30"><Icons.ArrowUp className="w-3 h-3" /></button>
                                      <button onClick={() => handleMovePackage(idx, 1)} disabled={idx === packages.length - 1} className="p-1 hover:bg-white/10 rounded text-slate-500 disabled:opacity-30"><Icons.ArrowUp className="w-3 h-3 rotate-180" /></button>
                                  </div>
                                  <div className={`w-10 h-10 rounded-full border-2 ${pkg.colorTheme} flex items-center justify-center bg-black/50 shrink-0`}>
                                      <Icons.Gem className="w-5 h-5 text-white" />
                                  </div>
                                  <div>
                                      <h4 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">
                                          {pkg.name}
                                          {!pkg.isActive && <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded">HIDDEN</span>}
                                          {pkg.isPopular && <span className="text-[9px] bg-audi-pink text-white px-1.5 py-0.5 rounded">HOT</span>}
                                      </h4>
                                      <div className="flex gap-3 text-xs text-slate-400 mt-1">
                                          <span><b className="text-green-400">{pkg.price.toLocaleString()}đ</b></span>
                                          <span><b className="text-audi-yellow">{pkg.coin} VC</b></span>
                                          {pkg.bonusPercent > 0 && <span className="text-audi-pink">+{pkg.bonusPercent}%</span>}
                                      </div>
                                  </div>
                              </div>
                              <div className="flex gap-2">
                                  <button onClick={() => setEditingPackage(pkg)} className="p-2 bg-blue-500/20 text-blue-500 rounded hover:bg-blue-500 hover:text-white"><Icons.Settings className="w-4 h-4" /></button>
                                  <button onClick={() => handleDeletePackage(pkg.id)} className="p-2 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white"><Icons.Trash className="w-4 h-4" /></button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {activeView === 'promotion' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Chiến Dịch Khuyến Mãi</h2>
                      <div className="flex gap-2">
                          <button 
                            onClick={refreshData} 
                            className="px-3 py-2 bg-white/10 text-white rounded-lg font-bold hover:bg-white/20"
                            title="Làm mới danh sách"
                          >
                             <Icons.Clock className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setEditingPromotion({
                                id: `temp_${Date.now()}`, name: '', marqueeText: '', bonusPercent: 10, startTime: new Date().toISOString(), endTime: new Date(Date.now() + 86400000).toISOString(), isActive: true
                            })}
                            className="px-3 py-2 md:px-4 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"
                          >
                              <Icons.Plus className="w-4 h-4" /> <span className="hidden md:inline">Tạo Chiến Dịch Mới</span><span className="md:hidden">Mới</span>
                          </button>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                      {promotions.length === 0 ? (
                          <div className="text-center py-8 text-slate-500">Chưa có chiến dịch nào.</div>
                      ) : promotions.map(p => {
                          const now = new Date().getTime();
                          const start = new Date(p.startTime).getTime();
                          const end = new Date(p.endTime).getTime();
                          
                          let statusBadge = <span className="text-slate-500 text-xs font-bold border border-slate-500/20 px-2 py-1 rounded">Stopped</span>;
                          
                          if (p.isActive) {
                              if (now < start) statusBadge = <span className="text-yellow-500 text-xs font-bold border border-yellow-500/20 px-2 py-1 rounded flex items-center gap-1"><Icons.Clock className="w-3 h-3" /> Scheduled</span>;
                              else if (now > end) statusBadge = <span className="text-slate-500 text-xs font-bold border border-slate-500/20 px-2 py-1 rounded">Expired</span>;
                              else statusBadge = <span className="text-green-500 text-xs font-bold border border-green-500/20 px-2 py-1 rounded flex items-center gap-1 animate-pulse"><Icons.Zap className="w-3 h-3" /> Running</span>;
                          } else {
                              statusBadge = <span className="text-red-500 text-xs font-bold border border-red-500/20 px-2 py-1 rounded">Disabled</span>;
                          }

                          return (
                              <div key={p.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                                  <div className="flex-1">
                                      <div className="flex justify-between items-start">
                                          <div>
                                              <div className="font-bold text-white text-lg">{p.name}</div>
                                              <div className="text-audi-pink font-bold text-sm">+{p.bonusPercent}% Vcoin Bonus</div>
                                          </div>
                                          <div className="md:hidden">{statusBadge}</div>
                                      </div>
                                      <div className="text-xs font-mono mt-2 space-y-1 bg-black/20 p-2 rounded-lg border border-white/5">
                                          <div className="text-green-400 flex items-center gap-2"><Icons.Calendar className="w-3 h-3"/> Start: {new Date(p.startTime).toLocaleString()}</div>
                                          <div className="text-red-400 flex items-center gap-2"><Icons.Calendar className="w-3 h-3"/> End: {new Date(p.endTime).toLocaleString()}</div>
                                      </div>
                                  </div>
                                  
                                  <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                                      <div className="hidden md:block">{statusBadge}</div>
                                      <div className="flex gap-2">
                                        <button onClick={() => setEditingPromotion(p)} className="px-3 py-2 bg-blue-500/20 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-white font-bold text-xs"><Icons.Settings className="w-4 h-4" /></button>
                                        <button onClick={() => handleDeletePromotion(p.id)} className="px-3 py-2 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500 hover:text-white font-bold text-xs"><Icons.Trash className="w-4 h-4" /></button>
                                      </div>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          )}

          {activeView === 'giftcodes' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Quản Lý Giftcode</h2>
                      <button 
                          onClick={() => setEditingGiftcode({
                              id: `temp_${Date.now()}`, code: '', reward: 10, totalLimit: 100, usedCount: 0, maxPerUser: 1, isActive: true
                          })}
                          className="px-3 py-2 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"
                      >
                          <Icons.Plus className="w-4 h-4" /> <span className="hidden md:inline">Tạo Code</span><span className="md:hidden">Tạo</span>
                      </button>
                  </div>

                  {/* GIFTCODE ANNOUNCEMENT CONFIG - NEWLY ADDED */}
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 md:p-6 mb-6">
                      <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                          <Icons.Bell className="w-5 h-5 text-audi-yellow" />
                          Cấu Hình Thông Báo Sự Kiện (Nổi bật)
                      </h3>
                      <div className="space-y-4">
                          <input 
                              type="text" 
                              value={giftcodePromo.text}
                              onChange={(e) => setGiftcodePromo({...giftcodePromo, text: e.target.value})}
                              placeholder="Ví dụ: Nhập CODE 'HELLO2026' để nhận 20Vcoin miễn phí"
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-audi-cyan outline-none"
                          />
                          <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer bg-white/5 px-4 py-2 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                                  <input 
                                      type="checkbox" 
                                      checked={giftcodePromo.isActive} 
                                      onChange={(e) => setGiftcodePromo({...giftcodePromo, isActive: e.target.checked})}
                                      className="accent-audi-cyan w-4 h-4"
                                  />
                                  <span className="text-sm font-bold text-white">Hiển thị thông báo này</span>
                              </label>
                              <button 
                                  onClick={handleSaveGiftcodePromo}
                                  className="px-4 py-2 bg-audi-cyan/20 text-audi-cyan hover:bg-audi-cyan hover:text-black font-bold rounded-lg transition-colors border border-audi-cyan/30 text-xs md:text-sm"
                              >
                                  Lưu Cấu Hình
                              </button>
                          </div>
                          <p className="text-[10px] text-slate-500">Thông báo này sẽ xuất hiện nổi bật phía trên ô nhập Giftcode của người dùng.</p>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {giftcodes.length === 0 ? (
                          <div className="text-center py-8 text-slate-500 col-span-full">Chưa có Giftcode nào.</div>
                      ) : giftcodes.map(code => (
                          <div key={code.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 shadow-sm relative overflow-hidden">
                              <div className="flex justify-between items-start mb-3">
                                  <div>
                                      <div className="font-mono font-bold text-white text-lg tracking-wider">{code.code}</div>
                                      <div className="text-audi-yellow font-bold text-sm">+{code.reward} Vcoin</div>
                                  </div>
                                  {code.isActive ? (
                                      <span className="text-green-500 text-[10px] font-bold border border-green-500/20 px-2 py-1 rounded bg-green-500/10">ACTIVE</span>
                                  ) : (
                                      <span className="text-red-500 text-[10px] font-bold border border-red-500/20 px-2 py-1 rounded bg-red-500/10">INACTIVE</span>
                                  )}
                              </div>
                              
                              <div className="mb-3">
                                  <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-bold uppercase">
                                      <span>Sử dụng</span>
                                      <span>{code.usedCount}/{code.totalLimit}</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                      <div className="h-full bg-green-500" style={{ width: `${Math.min(100, (code.usedCount / code.totalLimit) * 100)}%` }}></div>
                                  </div>
                              </div>

                              <div className="flex justify-between items-center border-t border-white/5 pt-3">
                                  <span className="text-[10px] text-slate-500">Max: {code.maxPerUser}/người</span>
                                  <div className="flex gap-2">
                                      <button onClick={() => setEditingGiftcode(code)} className="p-1.5 bg-blue-500/20 text-blue-500 rounded hover:bg-blue-500 hover:text-white transition-colors"><Icons.Settings className="w-4 h-4" /></button>
                                      <button onClick={() => handleDeleteGiftcode(code.id)} className="p-1.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

           {/* ================= VIEW: SYSTEM ================= */}
           {activeView === 'system' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Hệ Thống</h2>
                      <button onClick={() => runSystemChecks(apiKey)} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white flex items-center gap-2">
                          <Icons.Rocket className="w-4 h-4" /> <span className="hidden md:inline">Quét Ngay</span>
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
                              <span className="text-sm text-slate-400">Loại: {health.storage.type}</span>
                              <StatusBadge status={health.storage.status} />
                          </div>
                      </div>
                  </div>

                  {/* SQL Helper Tools */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Wand className="w-5 h-5 text-audi-yellow" />
                          Công Cụ Sửa Lỗi Nhanh (Database Fixer)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                              <h4 className="font-bold text-white mb-2">Sửa Lỗi Showcase (Ảnh không hiện)</h4>
                              <p className="text-xs text-slate-400 mb-4">
                                  Dùng khi khách vào trang chủ không thấy ảnh mặc dù đã share. Do Supabase chặn quyền xem public.
                              </p>
                              <button 
                                onClick={handleFixShowcasePermissions}
                                className="w-full py-2 bg-audi-purple/20 border border-audi-purple text-audi-purple hover:bg-audi-purple hover:text-white rounded-lg font-bold transition-all text-sm"
                              >
                                  Lấy Mã SQL Sửa Lỗi
                              </button>
                          </div>
                          {/* Future tools can go here */}
                      </div>
                  </div>

                  {/* API Key Configuration */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Lock className="w-5 h-5 text-audi-pink" />
                          Cấu hình Gemini API Key (System Active)
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
                              <div className="flex gap-2 relative">
                                  <input 
                                      type={showKey ? "text" : "password"}
                                      value={apiKey}
                                      onChange={(e) => {
                                          setApiKey(e.target.value);
                                          setKeyStatus('unknown');
                                      }}
                                      placeholder="AIzaSy..."
                                      className="flex-1 bg-black/40 border border-white/10 rounded-lg p-3 text-white font-mono text-sm pr-12"
                                  />
                                  <button 
                                    onClick={() => setShowKey(!showKey)} 
                                    className="absolute right-36 top-3 text-slate-500 hover:text-white hidden md:block"
                                    title="Hiện/Ẩn Key"
                                  >
                                      {showKey ? <Icons.Eye className="w-5 h-5" /> : <Icons.Lock className="w-5 h-5" />}
                                  </button>
                                  <button onClick={handleSaveApiKey} disabled={keyStatus === 'checking'} className="px-6 py-3 bg-audi-pink text-white font-bold rounded-lg hover:bg-pink-600 disabled:opacity-50 text-sm whitespace-nowrap">
                                      {keyStatus === 'checking' ? <Icons.Loader className="animate-spin w-5 h-5"/> : 'Lưu Key'}
                                  </button>
                              </div>
                              <p className="text-xs text-slate-500 mt-2">
                                  Key sẽ được lưu vào Database (Bảng api_keys) và sử dụng cho toàn hệ thống.
                              </p>
                          </div>
                      </div>
                  </div>

                  {/* List of Keys in DB */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Database className="w-5 h-5 text-audi-cyan" />
                          Danh sách API Key trong Database
                      </h3>
                      
                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-400">
                              <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                                  <tr>
                                      <th className="px-4 py-3">Tên / ID</th>
                                      <th className="px-4 py-3">Key Value</th>
                                      <th className="px-4 py-3">Trạng thái</th>
                                      <th className="px-4 py-3">Ngày tạo</th>
                                      <th className="px-4 py-3 text-right">Thao tác</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {dbKeys.length === 0 ? (
                                      <tr><td colSpan={5} className="text-center py-6 text-slate-500">Chưa tìm thấy key nào trong database.</td></tr>
                                  ) : dbKeys.map((k) => (
                                      <tr key={k.id} className="hover:bg-white/5">
                                          <td className="px-4 py-3 font-bold text-white">
                                              {k.name || 'Unnamed Key'}
                                              <div className="text-[10px] text-slate-600 font-mono">{k.id.substring(0,8)}...</div>
                                          </td>
                                          <td className="px-4 py-3 font-mono text-xs">
                                              {k.key_value ? `${k.key_value.substring(0, 8)}...${k.key_value.substring(k.key_value.length - 6)}` : 'N/A'}
                                          </td>
                                          <td className="px-4 py-3">
                                              <span className={`text-[10px] font-bold px-2 py-1 rounded border ${k.status === 'active' ? 'bg-green-500/20 text-green-500 border-green-500/50' : 'bg-slate-500/20 text-slate-500 border-slate-500/50'}`}>
                                                  {k.status?.toUpperCase() || 'UNKNOWN'}
                                              </span>
                                          </td>
                                          <td className="px-4 py-3 text-xs">{new Date(k.created_at).toLocaleString()}</td>
                                          <td className="px-4 py-3 text-right flex justify-end gap-2">
                                              <button 
                                                onClick={() => handleTestKey(k.key_value)} 
                                                className="px-3 py-1 bg-audi-purple/20 text-audi-purple hover:bg-audi-purple hover:text-white rounded border border-audi-purple/50 text-xs font-bold transition-colors"
                                              >
                                                  Test Nhanh
                                              </button>
                                              <button 
                                                onClick={() => handleDeleteApiKey(k.id)}
                                                className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded transition-colors"
                                              >
                                                  <Icons.Trash className="w-4 h-4" />
                                              </button>
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>

                      {/* Mobile Cards */}
                      <div className="md:hidden space-y-4">
                          {dbKeys.length === 0 ? (
                              <div className="text-center py-4 text-slate-500 text-sm">Chưa có key.</div>
                          ) : dbKeys.map((k) => (
                              <div key={k.id} className="bg-white/5 rounded-xl p-4 border border-white/5">
                                  <div className="flex justify-between items-start mb-2">
                                      <div>
                                          <div className="font-bold text-white text-sm">{k.name || 'Unnamed'}</div>
                                          <div className="font-mono text-[10px] text-slate-500">{k.id}</div>
                                      </div>
                                      <span className={`text-[10px] font-bold px-2 py-1 rounded border ${k.status === 'active' ? 'bg-green-500/20 text-green-500 border-green-500/50' : 'bg-slate-500/20 text-slate-500 border-slate-500/50'}`}>
                                          {k.status?.toUpperCase()}
                                      </span>
                                  </div>
                                  <div className="font-mono text-xs text-slate-300 break-all mb-3 bg-black/30 p-2 rounded">
                                      {k.key_value ? `${k.key_value.substring(0, 15)}...` : 'N/A'}
                                  </div>
                                  <div className="flex justify-between items-center mt-3 border-t border-white/5 pt-3">
                                      <span className="text-[10px] text-slate-500">{new Date(k.created_at).toLocaleDateString()}</span>
                                      <div className="flex gap-2">
                                          <button onClick={() => handleTestKey(k.key_value)} className="px-3 py-1.5 bg-audi-purple/20 text-audi-purple rounded text-xs font-bold border border-audi-purple/30">Test</button>
                                          <button onClick={() => handleDeleteApiKey(k.id)} className="px-3 py-1.5 bg-red-500/10 text-red-500 rounded text-xs font-bold border border-red-500/30">Xóa</button>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
           )}

      </div>

      {/* --- MOVED MODALS (ROOT LEVEL) - UPDATED OVERLAYS TO TRANSPARENT --- */}
      
      {/* EDIT USER MODAL - TOP ALIGNED */}
      {editingUser && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 animate-fade-in overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-white/20 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <h3 className="text-xl font-bold text-white mb-4">Sửa Người Dùng</h3>
                  <div className="space-y-4 mb-6">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên hiển thị</label>
                          <input 
                              value={editingUser.username || ''} 
                              onChange={e => setEditingUser({...editingUser, username: e.target.value})}
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-audi-pink outline-none" 
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Số dư Vcoin</label>
                          <input 
                              type="number" 
                              value={editingUser.balance || 0} 
                              onChange={e => setEditingUser({...editingUser, balance: Number(e.target.value)})}
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold focus:border-audi-pink outline-none" 
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Ảnh đại diện URL</label>
                          <input 
                              value={editingUser.avatar || ''} 
                              onChange={e => setEditingUser({...editingUser, avatar: e.target.value})}
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-slate-300 text-xs font-mono focus:border-audi-pink outline-none" 
                          />
                      </div>
                  </div>
                  <div className="flex gap-3">
                      <button onClick={() => setEditingUser(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold">Hủy</button>
                      <button onClick={handleSaveUser} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold">Lưu</button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT PACKAGE MODAL - TOP ALIGNED */}
      {editingPackage && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <h3 className="text-xl font-bold text-white mb-6">
                      {editingPackage.id.startsWith('temp_') ? 'Thêm Gói Mới' : 'Sửa Gói Nạp'}
                  </h3>
                  <div className="space-y-4 mb-6">
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên gói</label>
                              <input value={editingPackage.name} onChange={e => setEditingPackage({...editingPackage, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tag (VD: Mới)</label>
                              <input value={editingPackage.bonusText} onChange={e => setEditingPackage({...editingPackage, bonusText: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" />
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Giá (VND)</label>
                              <input type="number" value={editingPackage.price} onChange={e => setEditingPackage({...editingPackage, price: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-green-400 font-bold" />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Vcoin nhận</label>
                              <input type="number" value={editingPackage.coin} onChange={e => setEditingPackage({...editingPackage, coin: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold" />
                          </div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">% Bonus thêm (Mặc định)</label>
                          <div className="relative">
                              <input type="number" value={editingPackage.bonusPercent} onChange={e => setEditingPackage({...editingPackage, bonusPercent: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-pink font-bold pl-3" />
                              <span className="absolute right-3 top-3.5 text-xs text-slate-500 font-bold">%</span>
                          </div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Cú pháp chuyển khoản</label>
                          <input value={editingPackage.transferContent} onChange={e => setEditingPackage({...editingPackage, transferContent: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono" />
                      </div>
                      <div className="flex gap-4 pt-2">
                          <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors">
                              <input type="checkbox" checked={editingPackage.isPopular} onChange={e => setEditingPackage({...editingPackage, isPopular: e.target.checked})} className="accent-audi-pink w-4 h-4" />
                              <span className="text-sm font-bold text-white">Gói HOT (Nổi bật)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors">
                              <input type="checkbox" checked={editingPackage.isActive} onChange={e => setEditingPackage({...editingPackage, isActive: e.target.checked})} className="accent-green-500 w-4 h-4" />
                              <span className="text-sm font-bold text-white">Đang bán (Active)</span>
                          </label>
                      </div>
                  </div>
                  <div className="flex gap-3">
                      <button onClick={() => setEditingPackage(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold">Hủy</button>
                      <button onClick={handleSavePackage} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold">Lưu Thay Đổi</button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT PROMOTION MODAL - TOP ALIGNED */}
      {editingPromotion && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh]">
                  <h3 className="text-xl font-bold text-white mb-6 sticky top-0 bg-[#12121a] z-10 py-2 border-b border-white/10 shrink-0">
                      {editingPromotion.id.startsWith('temp_') ? 'Tạo Chiến Dịch Mới' : 'Sửa Chiến Dịch'}
                  </h3>
                  
                  <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên chiến dịch (Nội bộ)</label>
                          <input 
                            value={editingPromotion.name} 
                            onChange={e => setEditingPromotion({...editingPromotion, name: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" 
                            placeholder="Ví dụ: Sale 8/3"
                          />
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Thông báo chạy (Marquee)</label>
                          <input 
                            value={editingPromotion.marqueeText} 
                            onChange={e => setEditingPromotion({...editingPromotion, marqueeText: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" 
                            placeholder="Khuyến mãi đặc biệt..."
                          />
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">% Bonus Vcoin</label>
                          <div className="relative">
                              <input 
                                type="number" 
                                value={editingPromotion.bonusPercent} 
                                onChange={e => setEditingPromotion({...editingPromotion, bonusPercent: Number(e.target.value)})}
                                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-pink font-bold pl-3" 
                              />
                              <span className="absolute right-3 top-3.5 text-xs text-slate-500 font-bold">%</span>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Bắt đầu</label>
                              <input 
                                type="datetime-local" 
                                value={editingPromotion.startTime ? new Date(editingPromotion.startTime).toISOString().slice(0, 16) : ''}
                                onChange={e => setEditingPromotion({...editingPromotion, startTime: new Date(e.target.value).toISOString()})}
                                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono text-xs" 
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Kết thúc</label>
                              <input 
                                type="datetime-local" 
                                value={editingPromotion.endTime ? new Date(editingPromotion.endTime).toISOString().slice(0, 16) : ''}
                                onChange={e => setEditingPromotion({...editingPromotion, endTime: new Date(e.target.value).toISOString()})}
                                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono text-xs" 
                              />
                          </div>
                      </div>

                      <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setEditingPromotion({...editingPromotion, isActive: !editingPromotion.isActive})}>
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${editingPromotion.isActive ? 'bg-audi-lime border-audi-lime' : 'border-slate-500'}`}>
                              {editingPromotion.isActive && <Icons.Check className="w-3 h-3 text-black" />}
                          </div>
                          <label className="text-sm font-bold text-white cursor-pointer select-none">Kích hoạt (Manual Switch)</label>
                      </div>
                      <p className="text-[10px] text-slate-500 italic">Chiến dịch chỉ chạy khi BẬT và trong khoảng thời gian quy định.</p>
                  </div>

                  <div className="flex gap-3 pt-6 mt-2 border-t border-white/10 shrink-0">
                      <button onClick={() => setEditingPromotion(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold transition-colors">Hủy</button>
                      <button onClick={handleSavePromotion} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold shadow-lg transition-all">
                          Lưu Chiến Dịch
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT GIFTCODE MODAL - TOP ALIGNED */}
      {editingGiftcode && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-white/20 shadow-2xl">
                  <h3 className="text-xl font-bold text-white mb-6">
                      {editingGiftcode.id.startsWith('temp_') ? 'Tạo Giftcode' : 'Sửa Giftcode'}
                  </h3>
                  <div className="space-y-4 mb-6">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Mã Code (Tự động in hoa)</label>
                          <input 
                              value={editingGiftcode.code} 
                              onChange={e => setEditingGiftcode({...editingGiftcode, code: e.target.value.toUpperCase()})}
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono font-bold" 
                              placeholder="Vd: CHAOMUNG"
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Phần thưởng (Vcoin)</label>
                          <input 
                              type="number" 
                              value={editingGiftcode.reward} 
                              onChange={e => setEditingGiftcode({...editingGiftcode, reward: Number(e.target.value)})}
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold" 
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Giới hạn tổng</label>
                              <input 
                                  type="number" 
                                  value={editingGiftcode.totalLimit} 
                                  onChange={e => setEditingGiftcode({...editingGiftcode, totalLimit: Number(e.target.value)})}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" 
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Max/Người</label>
                              <input 
                                  type="number" 
                                  value={editingGiftcode.maxPerUser} 
                                  onChange={e => setEditingGiftcode({...editingGiftcode, maxPerUser: Number(e.target.value)})}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" 
                              />
                          </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors mt-2">
                          <input type="checkbox" checked={editingGiftcode.isActive} onChange={e => setEditingGiftcode({...editingGiftcode, isActive: e.target.checked})} className="accent-green-500 w-4 h-4" />
                          <span className="text-sm font-bold text-white">Kích hoạt ngay</span>
                      </label>
                  </div>
                  <div className="flex gap-3">
                      <button onClick={() => setEditingGiftcode(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold">Hủy</button>
                      <button onClick={handleSaveGiftcode} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold">Lưu Code</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
