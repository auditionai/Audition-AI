
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { 
    getAdminStats, 
    getApiKeysList, 
    saveSystemApiKey, 
    deleteApiKey, 
    updateAdminUserProfile, 
    savePackage, 
    deletePackage, 
    updatePackageOrder, 
    saveGiftcode, 
    deleteGiftcode, 
    getGiftcodePromoConfig, 
    saveGiftcodePromoConfig, 
    savePromotion, 
    deletePromotion,
    adminApproveTransaction, 
    adminRejectTransaction, 
    adminBulkApproveTransactions,
    adminBulkRejectTransactions,
    deleteTransaction,
    getSystemApiKey,
    getUserProfile,
    getStylePresets,
    saveStylePreset,
    deleteStylePreset,
    getUnifiedHistory,
    getGiftcodeUsages,
    getGenerationPrices,
    saveGenerationPrices
} from '../services/economyService';
import { getAllImagesFromStorage, deleteImageFromStorage, checkR2Connection, getUserImagesFromStorage, cleanupExpiredImages, cleanupR2Directly } from '../services/storageService';
import { checkConnection, analyzeStyleImage } from '../services/geminiService';
import { checkSupabaseConnection } from '../services/supabaseClient';
import { Icons } from '../components/Icons';
import { UserProfile, CreditPackage, Giftcode, PromotionCampaign, Transaction, GeneratedImage, Language, StylePreset, HistoryItem } from '../types';

interface AdminProps {
  lang: Language;
  isAdmin: boolean;
}

interface SystemHealth {
    gemini: { status: string, latency: number };
    supabase: { status: string, latency: number };
    storage: { status: string, type: string };
}

interface ToastMsg {
    id: number;
    msg: string;
    type: 'success' | 'error' | 'info';
}

interface ConfirmState {
    show: boolean;
    msg: string;
    title?: string;
    isAlertOnly?: boolean;
    onConfirm: () => void;
}

// SQL Code for fixing Giftcode table issues
const GIFTCODE_FIX_SQL = `-- FIX DATABASE STRUCTURE (GIFTCODES & SETTINGS)

-- 1. GIFT CODES TABLE
CREATE TABLE IF NOT EXISTS public.gift_codes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL,
    reward numeric DEFAULT 0,
    total_limit numeric DEFAULT 100,
    used_count numeric DEFAULT 0,
    max_per_user numeric DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Ensure columns exist
DO $$
BEGIN
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS reward numeric DEFAULT 0;
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS total_limit numeric DEFAULT 100;
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS used_count numeric DEFAULT 0;
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS max_per_user numeric DEFAULT 1;
    ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
END $$;

-- 2. USAGE TRACKING TABLE
CREATE TABLE IF NOT EXISTS public.gift_code_usages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id),
    gift_code_id uuid REFERENCES public.gift_codes(id),
    created_at timestamptz DEFAULT now()
);

-- 3. SYSTEM SETTINGS (For Promo Banners)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value jsonb
);

-- 4. DIAMOND TRANSACTIONS LOG (For Usage Stats)
CREATE TABLE IF NOT EXISTS public.diamond_transactions_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id),
    amount numeric NOT NULL,
    reason text,
    type text, -- 'usage', 'topup', 'reward', etc.
    created_at timestamptz DEFAULT now()
);

-- 5. ENABLE RLS & POLICIES
ALTER TABLE public.gift_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diamond_transactions_log ENABLE ROW LEVEL SECURITY;

-- Policies for Giftcodes
DROP POLICY IF EXISTS "Public read giftcodes" ON public.gift_codes;
CREATE POLICY "Public read giftcodes" ON public.gift_codes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admin manage giftcodes" ON public.gift_codes;
CREATE POLICY "Admin manage giftcodes" ON public.gift_codes FOR ALL TO authenticated USING (true);

-- Policies for System Settings
DROP POLICY IF EXISTS "Public read settings" ON public.system_settings;
CREATE POLICY "Public read settings" ON public.system_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admin manage settings" ON public.system_settings;
CREATE POLICY "Admin manage settings" ON public.system_settings FOR ALL TO authenticated USING (true);

-- 6. API KEYS ROTATION SUPPORT
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS last_used_at timestamptz DEFAULT now();

-- 7. STYLE PRESETS (NEW)
CREATE TABLE IF NOT EXISTS public.style_presets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    image_url text NOT NULL,
    trigger_prompt text,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.style_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read styles" ON public.style_presets;
CREATE POLICY "Public read styles" ON public.style_presets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin manage styles" ON public.style_presets;
CREATE POLICY "Admin manage styles" ON public.style_presets FOR ALL TO authenticated USING (true);

-- Policies for Logs
DROP POLICY IF EXISTS "User read own logs" ON public.diamond_transactions_log;
CREATE POLICY "User read own logs" ON public.diamond_transactions_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User insert own logs" ON public.diamond_transactions_log;
CREATE POLICY "User insert own logs" ON public.diamond_transactions_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin read all logs" ON public.diamond_transactions_log;
CREATE POLICY "Admin read all logs" ON public.diamond_transactions_log FOR ALL TO authenticated USING (true); -- Ideally check is_admin

-- 8. RPC FOR ATOMIC INCREMENT (Fixes concurrency issues)
CREATE OR REPLACE FUNCTION public.increment_giftcode_usage(code_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.gift_codes
  SET used_count = used_count + 1
  WHERE id = code_id;
$$;

-- 9. APP VISITS TRACKING
CREATE TABLE IF NOT EXISTS public.app_visits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id),
    visit_date date DEFAULT CURRENT_DATE,
    user_agent text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_visits ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (logging visit)
DROP POLICY IF EXISTS "Public insert visits" ON public.app_visits;
CREATE POLICY "Public insert visits" ON public.app_visits FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Allow admins to read all
DROP POLICY IF EXISTS "Admin read visits" ON public.app_visits;
CREATE POLICY "Admin read visits" ON public.app_visits FOR SELECT TO authenticated USING (true);
`;

const USER_FIX_SQL = `
-- RECOVERY SCRIPT (Run in Supabase SQL Editor)

-- 1. Reset Policies to avoid recursion loops (Fixes 500 Error)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can do everything" ON public.users;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Public read access" ON public.users;
DROP POLICY IF EXISTS "Self update" ON public.users;
DROP POLICY IF EXISTS "Admin full access" ON public.users;

-- 2. Create SECURE function to check admin status (Bypasses RLS recursion)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true);
$$;

-- 3. Ensure columns exist (Fixes missing data)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS diamonds numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 4. Sync from auth.users (Restores Avatar/Name, preserves latest activity)
INSERT INTO public.users (id, email, display_name, photo_url, created_at, last_active)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'full_name', email), 
    COALESCE(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture'), 
    created_at, 
    last_sign_in_at
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.users.display_name, EXCLUDED.display_name),
    photo_url = COALESCE(public.users.photo_url, EXCLUDED.photo_url),
    last_active = GREATEST(public.users.last_active, EXCLUDED.last_active);

-- 5. Restore Admin Rights (Replace email if needed)
UPDATE public.users 
SET is_admin = true 
WHERE email = 'codycn2804@gmail.com';

-- 6. Re-enable RLS with SAFE policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read basic info
CREATE POLICY "Public read access" ON public.users FOR SELECT USING (true);

-- Policy: Users can update their own data
CREATE POLICY "Self update" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Policy: Admins can do everything (Uses SECURITY DEFINER function to avoid recursion)
CREATE POLICY "Admin full access" ON public.users FOR ALL USING (
  public.check_is_admin() = true
);

-- 7. Refresh Schema Cache (Fixes "column does not exist" errors)
NOTIFY pgrst, 'reload config';
`;

const BALANCE_FIX_SQL = `
-- FIX NEGATIVE BALANCES SCRIPT

-- 1. Reset negative balances to 0
UPDATE public.users 
SET diamonds = 0 
WHERE diamonds < 0;

-- 2. (Optional) Manually set balance for specific user (Uncomment to use)
-- UPDATE public.users SET diamonds = 2000 WHERE email = 'codycn2804@gmail.com';
`;

// Helper for time ago
const getTimeAgo = (dateString?: string) => {
    if (!dateString) return 'Chưa truy cập';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    return `${diffDays} ngày trước`;
};

const isUserOnline = (dateString?: string) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return diffMs < 5 * 60 * 1000; // Online if active within last 5 mins
};

export const Admin: React.FC<AdminProps> = ({ lang, isAdmin = false }) => {
  const [activeView, setActiveView] = useState<'overview' | 'transactions' | 'users' | 'packages' | 'promotion' | 'giftcodes' | 'system' | 'styles'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [allImages, setAllImages] = useState<GeneratedImage[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [giftcodes, setGiftcodes] = useState<Giftcode[]>([]);
  const [promotions, setPromotions] = useState<PromotionCampaign[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([]);
  const [editingStyle, setEditingStyle] = useState<StylePreset | null>(null);
  
  // --- NEW: GENERATION PRICES ---
  const [generationPrices, setGenerationPrices] = useState<any>({
      flash_1k: 1, flash_2k: 2, flash_4k: 4,
      pro_1k: 5, pro_2k: 10, pro_4k: 15,
      couple: 2, group3: 4, group4: 6
  });

  // API Key States
  const [apiKey, setApiKey] = useState('');
  const [apiKeyTier, setApiKeyTier] = useState<'flash' | 'pro'>('flash');
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'valid' | 'invalid' | 'unknown' | 'checking'>('unknown');
  const [dbKeys, setDbKeys] = useState<any[]>([]); 
  
  // Giftcode Promo Config
  const [giftcodePromo, setGiftcodePromo] = useState({ text: '', isActive: false });

  // Search States
  const [userSearchEmail, setUserSearchEmail] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  // Health State
  const [health, setHealth] = useState<SystemHealth>({
      gemini: { status: 'checking', latency: 0 },
      supabase: { status: 'checking', latency: 0 },
      storage: { status: 'checking', type: 'None' }
  });

  // Modal States
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [viewingUser, setViewingUser] = useState<UserProfile | null>(null);
  const [userHistory, setUserHistory] = useState<HistoryItem[]>([]);
  const [userImages, setUserImages] = useState<GeneratedImage[]>([]);
  const [totalImagesCreated, setTotalImagesCreated] = useState(0);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [imagesLimit, setImagesLimit] = useState(20);
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [editingGiftcode, setEditingGiftcode] = useState<Giftcode | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<PromotionCampaign | null>(null);
  const [viewingGiftcodeUsage, setViewingGiftcodeUsage] = useState<Giftcode | null>(null);
  const [giftcodeUsers, setGiftcodeUsers] = useState<any[]>([]);
  const [loadingGiftcodeUsers, setLoadingGiftcodeUsers] = useState(false);

  // Error Recovery States
  const [showGiftcodeFix, setShowGiftcodeFix] = useState(false);
  const [showUserFix, setShowUserFix] = useState(false);
  const [showBalanceFix, setShowBalanceFix] = useState(false);

  // UX States
  const [processingTxId, setProcessingTxId] = useState<string | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);

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

  // Load Data Sequence
  useEffect(() => {
    if (isAdmin) {
        const init = async () => {
            await refreshData();
            await runSystemChecks(undefined);
        };
        init();
    }
    // Get current user email for recovery instructions
    supabase.auth.getUser().then((response: any) => {
        const data = response.data;
        if (data?.user?.email) setCurrentUserEmail(data.user.email);
    });
  }, [isAdmin]);

  const refreshData = async () => {
      const s = await getAdminStats();
      if (s) {
          setStats(s);
          setPackages(s.packages || []);
          setPromotions(s.promotions || []);
          setGiftcodes(s.giftcodes || []);
          setTransactions(s.transactions || []); 
          const imgs = await getAllImagesFromStorage();
          setAllImages(imgs);
      }
      
      const keys = await getApiKeysList();
      setDbKeys(keys);

      const promoConfig = await getGiftcodePromoConfig();
      setGiftcodePromo(promoConfig);

      const styles = await getStylePresets();
      setStylePresets(styles || []);

      const prices = await getGenerationPrices();
      setGenerationPrices(prices);
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

  // --- ACTIONS ---

  const handleSaveApiKey = async () => {
      if (!apiKey.trim()) return;
      
      setKeyStatus('checking');
      const check = await checkConnection(apiKey);
      
      // Allow saving if valid OR if user confirms to bypass
      let shouldSave = check.success;
      if (!check.success) {
          setKeyStatus('invalid');
          if (window.confirm(`API Key này có vẻ không hoạt động:\n"${check.message}"\n\nBạn có chắc chắn muốn lưu nó vào Database không?`)) {
              shouldSave = true;
          }
      }

      if (shouldSave) {
          const result = await saveSystemApiKey(apiKey, apiKeyTier);
          if (result.success) {
              setKeyStatus('valid');
              showToast('Đã lưu API Key vào Database thành công!');
              setApiKey(''); // Clear input for security
              await refreshData(); 
              runSystemChecks();
          } else {
              setKeyStatus('unknown');
              showToast(`Lỗi Database: ${result.error}`, 'error');
          }
      } else {
          showToast(`Lỗi: ${check.message}`, 'error');
      }
  };

  const handleTestKey = async (key: string) => {
      showToast('Đang kiểm tra key...', 'info');
      const check = await checkConnection(key);
      if (check.success) {
          showToast('Kết nối thành công! Key hoạt động tốt.', 'success');
      } else {
          showToast(`Kết nối thất bại: ${check.message}`, 'error');
      }
  };

  const handleDeleteApiKey = async (id: string) => {
      showConfirm('Xóa API Key này khỏi database?', async () => {
          await deleteApiKey(id);
          refreshData();
          showToast('Đã xóa API Key');
      });
  }

  const handleViewUser = async (user: UserProfile) => {
      setViewingUser(user);
      setLoadingUserDetails(true);
      setHistoryLimit(20);
      setImagesLimit(20);
      try {
          const history = await getUnifiedHistory(user.id);
          setUserHistory(history);
          
          // Calculate total images created from history (type === 'usage')
          const totalCreated = history.filter(h => h.type === 'usage').length;
          setTotalImagesCreated(totalCreated);

          // Fetch images for this user
          const images = await getUserImagesFromStorage(user.id);
          setUserImages(images);
      } catch (e) {
          showToast('Lỗi tải dữ liệu người dùng', 'error');
      } finally {
          setLoadingUserDetails(false);
      }
  };

  const handleViewGiftcodeUsage = async (code: Giftcode) => {
      setViewingGiftcodeUsage(code);
      setLoadingGiftcodeUsers(true);
      try {
          const users = await getGiftcodeUsages(code.id);
          setGiftcodeUsers(users);
      } catch (e) {
          showToast('Lỗi tải danh sách người dùng', 'error');
      } finally {
          setLoadingGiftcodeUsers(false);
      }
  };

  const handleSaveUser = async () => {
      if (editingUser) {
          const result = await updateAdminUserProfile(editingUser);
          
          if (result.success) {
              setEditingUser(null);
              await refreshData();
              showToast('Cập nhật người dùng thành công!');
          } else {
              showToast(`Lỗi: ${result.error}`, 'error');
          }
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
              showToast(`Lỗi: ${result.error}`, 'error');
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

      [newPackages[index], newPackages[newIndex]] = [newPackages[newIndex], newPackages[index]];
      setPackages(newPackages);

      const result = await updatePackageOrder(newPackages);
      if (!result.success) {
          showToast('Lỗi khi lưu thứ tự: ' + result.error, 'error');
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
              showToast(`Lỗi: ${result.error}`, 'error');
              // Detect specific DB Error for missing column
              if (result.error?.includes('column') || result.error?.includes('schema cache')) {
                  setShowGiftcodeFix(true);
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
      if (giftcodePromo.isActive && !giftcodePromo.text.trim()) {
          showToast('Vui lòng nhập nội dung thông báo!', 'error');
          return;
      }
      const result = await saveGiftcodePromoConfig(giftcodePromo.text, giftcodePromo.isActive);
      if (result.success) {
          showToast('Đã lưu thông báo thành công!');
      } else {
          showToast('Lỗi lưu: ' + result.error, 'error');
          // If table system_settings is missing, trigger fix modal
          if (result.error?.includes('relation "public.system_settings" does not exist')) {
              setShowGiftcodeFix(true);
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
              showToast(`Lỗi: ${result.error}`, 'error');
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
              setTransactions(prev => prev.map(t => 
                  t.id === txId ? { ...t, status: 'paid' } : t
              ));
              showToast('Đã duyệt thành công!');
              await refreshData();
          } else {
              showToast('Lỗi: ' + result.error, 'error');
              await refreshData();
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
              setTransactions(prev => prev.map(t => 
                  t.id === txId ? { ...t, status: 'failed' } : t
              ));
              showToast('Đã từ chối giao dịch', 'info');
              await refreshData();
          } else {
              showToast('Lỗi: ' + result.error, 'error');
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
              setTransactions(prev => prev.filter(t => t.id !== txId));
              showToast('Đã xóa giao dịch vĩnh viễn', 'info');
          } else {
               showToast('Lỗi xóa: ' + res.error, 'error');
          }
          setProcessingTxId(null);
      });
  }

  const handleCleanupImages = async () => {
      showConfirm('Xóa toàn bộ ảnh trên R2 Cloud cũ hơn 1 ngày (không bao gồm ảnh đã public)?', async () => {
          showToast('Đang tiến hành xóa ảnh cũ...', 'info');
          try {
              const countDB = await cleanupExpiredImages(true);
              const countR2 = await cleanupR2Directly();
              showToast(`Đã xóa thành công ${countDB} ảnh từ DB và ${countR2} ảnh trực tiếp từ R2 Cloud.`);
              await refreshData();
          } catch (e: any) {
              showToast(`Lỗi khi xóa ảnh: ${e.message}`, 'error');
          }
      });
  };

  // --- BULK ACTIONS ---
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          setSelectedTxIds(transactions.map(t => t.id));
      } else {
          setSelectedTxIds([]);
      }
  };

  const handleSelectTx = (id: string) => {
      setSelectedTxIds(prev => 
          prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
      );
  };

  const handleBulkApprove = async () => {
      if (selectedTxIds.length === 0) return;
      showConfirm(`Duyệt ${selectedTxIds.length} giao dịch đã chọn?`, async () => {
          const res = await adminBulkApproveTransactions(selectedTxIds);
          if (res.success) {
              showToast(`Đã duyệt ${res.count} giao dịch thành công!`);
              await refreshData();
              setSelectedTxIds([]);
          } else {
              showToast('Lỗi: ' + res.error, 'error');
          }
      });
  };

  const handleBulkReject = async () => {
      if (selectedTxIds.length === 0) return;
      showConfirm(`Từ chối ${selectedTxIds.length} giao dịch đã chọn?`, async () => {
          const res = await adminBulkRejectTransactions(selectedTxIds);
          if (res.success) {
              showToast(`Đã từ chối ${res.count} giao dịch!`, 'info');
              await refreshData();
              setSelectedTxIds([]);
          } else {
              showToast('Lỗi: ' + res.error, 'error');
          }
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
                  { id: 'styles', icon: Icons.Palette, label: 'Style Mẫu' },
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
          
          {/* ... (Existing Views) ... */}
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

                  {/* AI Stats Table */}
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 md:p-6 shadow-xl">
                      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                          <Icons.BarChart className="w-5 h-5 text-audi-yellow" />
                          Thống Kê Sử Dụng
                      </h3>
                      {/* ... (Existing table) ... */}
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

          {activeView === 'transactions' && (
              // ... existing transaction view ...
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Giao Dịch</h2>
                      <div className="flex gap-2">
                          {selectedTxIds.length > 0 && (
                              <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg animate-fade-in">
                                  <span className="text-xs font-bold text-white">{selectedTxIds.length} đã chọn</span>
                                  <button onClick={handleBulkApprove} className="p-1.5 bg-green-500/20 text-green-500 rounded hover:bg-green-500 hover:text-white" title="Duyệt tất cả"><Icons.Check className="w-4 h-4" /></button>
                                  <button onClick={handleBulkReject} className="p-1.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white" title="Hủy tất cả"><Icons.X className="w-4 h-4" /></button>
                              </div>
                          )}
                          <button onClick={refreshData} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs md:text-sm font-bold text-white flex items-center gap-2">
                              <Icons.Clock className="w-3 h-3 md:w-4 md:h-4" /> Làm mới
                          </button>
                      </div>
                  </div>
                  {/* ... same table content ... */}
                  <div className="hidden md:block bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4 w-10">
                                      <input 
                                          type="checkbox" 
                                          className="rounded border-white/20 bg-white/5 checked:bg-audi-pink"
                                          checked={transactions.length > 0 && selectedTxIds.length === transactions.length}
                                          onChange={handleSelectAll}
                                      />
                                  </th>
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
                                  <tr><td colSpan={8} className="text-center py-8">Chưa có giao dịch nào.</td></tr>
                              ) : transactions.map(tx => (
                                  <tr key={tx.id} className={`hover:bg-white/5 transition-colors ${processingTxId === tx.id ? 'opacity-50 pointer-events-none' : ''} ${selectedTxIds.includes(tx.id) ? 'bg-white/5' : ''}`}>
                                      <td className="px-6 py-4">
                                          <input 
                                              type="checkbox" 
                                              className="rounded border-white/20 bg-white/5 checked:bg-audi-pink"
                                              checked={selectedTxIds.includes(tx.id)}
                                              onChange={() => handleSelectTx(tx.id)}
                                          />
                                      </td>
                                      <td className="px-6 py-4 text-xs font-mono">{new Date(tx.createdAt).toLocaleString()}</td>
                                      <td className="px-6 py-4 font-mono font-bold text-white">{tx.order_code || tx.code}</td>
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
                                      <td className="px-6 py-4 text-right font-bold text-white">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount || tx.price || 0)}</td>
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
                  {/* Mobile cards also same */}
                  <div className="md:hidden space-y-4">
                      {transactions.map(tx => (
                          <div key={tx.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 relative overflow-hidden shadow-md">
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
                                              <div className="text-xs text-slate-500 font-mono">{tx.order_code || tx.code}</div>
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
                                          <div className="text-white font-bold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount || tx.price || 0)}</div>
                                      </div>
                                      <div>
                                          <div className="text-[10px] text-slate-500 uppercase font-bold">Gói nạp</div>
                                          <div className="text-audi-pink font-bold">+{tx.coins} Vcoin</div>
                                      </div>
                                  </div>
                                  <div className="flex gap-2 border-t border-white/5 pt-3">
                                      {tx.status === 'pending' && (
                                          <>
                                              <button onClick={() => handleApproveTransaction(tx.id)} className="flex-1 py-2 bg-green-500 text-white rounded-lg font-bold text-xs shadow-lg shadow-green-500/20 active:scale-95 transition-all">DUYỆT</button>
                                              <button onClick={() => handleRejectTransaction(tx.id)} className="flex-1 py-2 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg font-bold text-xs active:scale-95 transition-all">HỦY</button>
                                          </>
                                      )}
                                      <button onClick={() => handleDeleteTransaction(tx.id)} className="px-3 py-2 bg-slate-800 text-slate-400 rounded-lg font-bold text-xs border border-white/10 active:scale-95"><Icons.Trash className="w-4 h-4" /></button>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {activeView === 'users' && (
              // ... existing users view ...
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Người Dùng</h2>
                      <div className="flex items-center gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-2 w-full md:w-64">
                          <Icons.Search className="w-4 h-4 text-slate-500" />
                          <input type="text" placeholder="Tìm email..." value={userSearchEmail} onChange={(e) => setUserSearchEmail(e.target.value)} className="bg-transparent border-none outline-none text-sm text-white w-full placeholder-slate-500" />
                      </div>
                  </div>
                  
                  <div className="hidden md:block bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-400">
                          <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                              <tr>
                                  <th className="px-6 py-4">User</th>
                                  <th className="px-6 py-4">Trạng thái</th>
                                  <th className="px-6 py-4">Số dư</th>
                                  <th className="px-6 py-4">Hoạt động (Gen)</th>
                                  <th className="px-6 py-4">Vai trò</th>
                                  <th className="px-6 py-4 text-right">Hành động</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {(stats?.usersList || [])
                                  .filter((u: any) => u.email.toLowerCase().includes(userSearchEmail.toLowerCase()))
                                  .sort((a: UserProfile, b: UserProfile) => {
                                      const aOnline = isUserOnline(a.lastActive);
                                      const bOnline = isUserOnline(b.lastActive);
                                      if (aOnline && !bOnline) return -1;
                                      if (!aOnline && bOnline) return 1;
                                      const timeA = a.lastActive ? new Date(a.lastActive).getTime() : 0;
                                      const timeB = b.lastActive ? new Date(b.lastActive).getTime() : 0;
                                      return timeB - timeA;
                                  })
                                  .map((u: UserProfile) => {
                                      const online = isUserOnline(u.lastActive);
                                      return (
                                          <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-3">
                                                      <div className="relative">
                                                          <img src={u.avatar} className="w-8 h-8 rounded-full border border-white/10 object-cover" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
                                                          {online && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-[#12121a] rounded-full animate-pulse"></div>}
                                                      </div>
                                                      <div>
                                                          <div className="font-bold text-white">{u.username}</div>
                                                          <div className="text-xs text-slate-500">{u.email}</div>
                                                      </div>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-2">
                                                      <div className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500' : 'bg-slate-600'}`}></div>
                                                      <span className={`text-xs font-bold ${online ? 'text-green-500' : 'text-slate-500'}`}>
                                                          {online ? 'Online' : getTimeAgo(u.lastActive)}
                                                      </span>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4 text-audi-yellow font-bold font-mono">{u.balance}</td>
                                              <td className="px-6 py-4">
                                                  <span className="text-white font-bold">{u.usageCount || 0}</span>
                                                  <span className="text-xs text-slate-500 ml-1">lượt</span>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                                      {u.role}
                                                  </span>
                                              </td>
                                              <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                  <button onClick={() => handleViewUser(u)} className="text-xs font-bold text-audi-pink hover:text-white bg-audi-pink/10 hover:bg-audi-pink/30 px-3 py-1.5 rounded transition-colors">Chi tiết</button>
                                                  <button onClick={() => setEditingUser(u)} className="text-xs font-bold text-audi-cyan hover:text-white bg-audi-cyan/10 hover:bg-audi-cyan/30 px-3 py-1.5 rounded transition-colors">Sửa</button>
                                              </td>
                                          </tr>
                                      );
                                  })}
                          </tbody>
                      </table>
                  </div>
                  
                  {/* Mobile View */}
                  <div className="md:hidden space-y-4">
                      {(stats?.usersList || [])
                          .filter((u: any) => u.email.toLowerCase().includes(userSearchEmail.toLowerCase()))
                          .sort((a: UserProfile, b: UserProfile) => {
                              const aOnline = isUserOnline(a.lastActive);
                              const bOnline = isUserOnline(b.lastActive);
                              if (aOnline && !bOnline) return -1;
                              if (!aOnline && bOnline) return 1;
                              const timeA = a.lastActive ? new Date(a.lastActive).getTime() : 0;
                              const timeB = b.lastActive ? new Date(b.lastActive).getTime() : 0;
                              return timeB - timeA;
                          })
                          .map((u: UserProfile) => {
                              const online = isUserOnline(u.lastActive);
                              return (
                                  <div key={u.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 relative overflow-hidden">
                                      <div className="flex justify-between items-start mb-3">
                                          <div className="flex items-center gap-3">
                                              <div className="relative">
                                                  <img src={u.avatar} className="w-10 h-10 rounded-full border border-white/10 object-cover" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
                                                  {online && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#12121a] rounded-full animate-pulse"></div>}
                                              </div>
                                              <div>
                                                  <div className="font-bold text-white text-sm">{u.username}</div>
                                                  <div className="text-xs text-slate-500">{u.email}</div>
                                              </div>
                                          </div>
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                              {u.role}
                                          </span>
                                      </div>
                                      
                                      <div className="grid grid-cols-3 gap-2 mb-3 bg-white/5 p-2 rounded-lg">
                                          <div className="text-center">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Trạng thái</div>
                                              <div className={`text-xs font-bold ${online ? 'text-green-500' : 'text-slate-400'}`}>
                                                  {online ? 'Online' : getTimeAgo(u.lastActive)}
                                              </div>
                                          </div>
                                          <div className="text-center border-l border-white/10">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Số dư</div>
                                              <div className="text-xs font-bold text-audi-yellow">{u.balance} VC</div>
                                          </div>
                                          <div className="text-center border-l border-white/10">
                                              <div className="text-[10px] text-slate-500 uppercase font-bold">Hoạt động</div>
                                              <div className="text-xs font-bold text-white">{u.usageCount || 0} gen</div>
                                          </div>
                                      </div>

                                      <div className="flex gap-2 border-t border-white/5 pt-3">
                                          <button onClick={() => handleViewUser(u)} className="flex-1 py-2 bg-audi-pink/10 text-audi-pink rounded-lg font-bold text-xs border border-audi-pink/30">Chi tiết</button>
                                          <button onClick={() => setEditingUser(u)} className="flex-1 py-2 bg-audi-cyan/10 text-audi-cyan rounded-lg font-bold text-xs border border-audi-cyan/30">Sửa</button>
                                      </div>
                                  </div>
                              );
                          })}
                  </div>
              </div>
          )}

          {activeView === 'packages' && (
              // ... existing packages view ...
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Gói Nạp</h2>
                      <button onClick={() => setEditingPackage({id: `temp_${Date.now()}`, name: 'Gói Mới', coin: 100, price: 50000, currency: 'VND', bonusText: '', bonusPercent: 0, isPopular: false, isActive: true, displayOrder: packages.length, colorTheme: 'border-slate-600', transferContent: 'NAP 50K'})} className="px-3 py-1.5 md:px-4 md:py-2 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"><Icons.Plus className="w-4 h-4" /> Thêm Gói</button>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                      {packages.map((pkg, idx) => (
                          <div key={pkg.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 flex items-center justify-between group hover:border-white/30 transition-all shadow-md">
                              <div className="flex items-center gap-3 md:gap-4">
                                  <div className="flex flex-col gap-1 pr-3 md:pr-4 border-r border-white/10">
                                      <button onClick={() => handleMovePackage(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-white/10 rounded text-slate-500 disabled:opacity-30"><Icons.ArrowUp className="w-3 h-3" /></button>
                                      <button onClick={() => handleMovePackage(idx, 1)} disabled={idx === packages.length - 1} className="p-1 hover:bg-white/10 rounded text-slate-500 disabled:opacity-30"><Icons.ArrowUp className="w-3 h-3 rotate-180" /></button>
                                  </div>
                                  <div className={`w-10 h-10 rounded-full border-2 ${pkg.colorTheme} flex items-center justify-center bg-black/50 shrink-0`}><Icons.Gem className="w-5 h-5 text-white" /></div>
                                  <div>
                                      <h4 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">{pkg.name} {!pkg.isActive && <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded">HIDDEN</span>} {pkg.isPopular && <span className="text-[9px] bg-audi-pink text-white px-1.5 py-0.5 rounded">HOT</span>}</h4>
                                      <div className="flex gap-3 text-xs text-slate-400 mt-1"><span><b className="text-green-400">{(pkg.price || 0).toLocaleString()}đ</b></span><span><b className="text-audi-yellow">{pkg.coin || 0} VC</b></span>{pkg.bonusPercent > 0 && <span className="text-audi-pink">+{pkg.bonusPercent}%</span>}</div>
                                  </div>
                              </div>
                              <div className="flex gap-2"><button onClick={() => setEditingPackage({ id: pkg.id || '', name: pkg.name || '', price: pkg.price || 0, coin: pkg.coin || 0, bonusPercent: pkg.bonusPercent || 0, bonusText: pkg.bonusText || '', transferContent: pkg.transferContent || '', isPopular: !!pkg.isPopular, isActive: pkg.isActive !== false, colorTheme: pkg.colorTheme || 'border-slate-600', displayOrder: pkg.displayOrder || 0, currency: pkg.currency || 'VND' })} className="p-2 bg-blue-500/20 text-blue-500 rounded hover:bg-blue-500 hover:text-white"><Icons.Settings className="w-4 h-4" /></button><button onClick={() => handleDeletePackage(pkg.id)} className="p-2 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white"><Icons.Trash className="w-4 h-4" /></button></div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {activeView === 'giftcodes' && (
              // ... existing giftcodes view ...
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Quản Lý Giftcode</h2>
                      <div className="flex gap-2">
                          <button onClick={refreshData} className="px-3 py-2 bg-white/10 text-white rounded-lg font-bold hover:bg-white/20" title="Làm mới dữ liệu"><Icons.Clock className="w-4 h-4" /></button>
                          <button onClick={() => setEditingGiftcode({id: `temp_${Date.now()}`, code: '', reward: 10, totalLimit: 100, usedCount: 0, maxPerUser: 1, isActive: true})} className="px-3 py-2 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"><Icons.Plus className="w-4 h-4" /> <span className="hidden md:inline">Tạo Code</span><span className="md:hidden">Tạo</span></button>
                      </div>
                  </div>
                  {/* ... same ... */}
                  <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 md:p-6 mb-6">
                      <h3 className="font-bold text-white mb-4 flex items-center gap-2"><Icons.Bell className="w-5 h-5 text-audi-yellow" /> Cấu Hình Thông Báo Sự Kiện (Nổi bật)</h3>
                      <div className="space-y-4">
                          <input type="text" value={giftcodePromo.text} onChange={(e) => setGiftcodePromo({...giftcodePromo, text: e.target.value})} placeholder="Ví dụ: Nhập CODE 'HELLO2026' để nhận 20Vcoin miễn phí" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-audi-cyan outline-none" />
                          <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer bg-white/5 px-4 py-2 rounded-lg border border-white/5 hover:bg-white/10 transition-colors"><input type="checkbox" checked={giftcodePromo.isActive} onChange={(e) => setGiftcodePromo({...giftcodePromo, isActive: e.target.checked})} className="accent-audi-cyan w-4 h-4" /><span className="text-sm font-bold text-white">Hiển thị thông báo này</span></label>
                              <button onClick={handleSaveGiftcodePromo} className="px-4 py-2 bg-audi-cyan/20 text-audi-cyan hover:bg-audi-cyan hover:text-black font-bold rounded-lg transition-colors border border-audi-cyan/30 text-xs md:text-sm">Lưu Cấu Hình</button>
                          </div>
                      </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {giftcodes.map(code => (
                          <div key={code.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 shadow-sm relative overflow-hidden">
                              <div className="flex justify-between items-start mb-3"><div><div className="font-mono font-bold text-white text-lg tracking-wider">{code.code}</div><div className="text-audi-yellow font-bold text-sm">+{code.reward} Vcoin</div></div>{code.isActive ? <span className="text-green-500 text-[10px] font-bold border border-green-500/20 px-2 py-1 rounded bg-green-500/10">ACTIVE</span> : <span className="text-red-500 text-[10px] font-bold border border-red-500/20 px-2 py-1 rounded bg-red-500/10">INACTIVE</span>}</div>
                              <div className="mb-3"><div className="flex justify-between text-[10px] text-slate-500 mb-1 font-bold uppercase"><span>Sử dụng</span><span>{code.usedCount}/{code.totalLimit}</span></div><div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${Math.min(100, (code.usedCount / code.totalLimit) * 100)}%` }}></div></div></div>
                              <div className="flex justify-between items-center border-t border-white/5 pt-3">
                                  <span className="text-[10px] text-slate-500">Max: {code.maxPerUser}/người</span>
                                  <div className="flex gap-2">
                                      <button onClick={() => handleViewGiftcodeUsage(code)} className="p-1.5 bg-green-500/20 text-green-500 rounded hover:bg-green-500 hover:text-white transition-colors" title="Xem người dùng"><Icons.Users className="w-4 h-4" /></button>
                                      <button onClick={() => setEditingGiftcode(code)} className="p-1.5 bg-blue-500/20 text-blue-500 rounded hover:bg-blue-500 hover:text-white transition-colors"><Icons.Settings className="w-4 h-4" /></button>
                                      <button onClick={() => handleDeleteGiftcode(code.id)} className="p-1.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {activeView === 'promotion' && (
              // ... existing promotion view ...
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Chiến Dịch Khuyến Mãi</h2>
                      <div className="flex gap-2"><button onClick={refreshData} className="px-3 py-2 bg-white/10 text-white rounded-lg font-bold hover:bg-white/20" title="Làm mới danh sách"><Icons.Clock className="w-4 h-4" /></button><button onClick={() => setEditingPromotion({id: `temp_${Date.now()}`, name: '', marqueeText: '', bonusPercent: 10, startTime: new Date().toISOString(), endTime: new Date(Date.now() + 86400000).toISOString(), isActive: true})} className="px-3 py-2 md:px-4 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"><Icons.Plus className="w-4 h-4" /> <span className="hidden md:inline">Tạo Chiến Dịch Mới</span><span className="md:hidden">Mới</span></button></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                      {promotions.map(p => {
                          const now = new Date().getTime(); const start = new Date(p.startTime).getTime(); const end = new Date(p.endTime).getTime();
                          let statusBadge = <span className="text-slate-500 text-xs font-bold border border-slate-500/20 px-2 py-1 rounded">Stopped</span>;
                          if (p.isActive) { if (now < start) statusBadge = <span className="text-yellow-500 text-xs font-bold border border-yellow-500/20 px-2 py-1 rounded flex items-center gap-1"><Icons.Clock className="w-3 h-3" /> Scheduled</span>; else if (now > end) statusBadge = <span className="text-slate-500 text-xs font-bold border border-slate-500/20 px-2 py-1 rounded">Expired</span>; else statusBadge = <span className="text-green-500 text-xs font-bold border border-green-500/20 px-2 py-1 rounded flex items-center gap-1 animate-pulse"><Icons.Zap className="w-3 h-3" /> Running</span>; } else { statusBadge = <span className="text-red-500 text-xs font-bold border border-red-500/20 px-2 py-1 rounded">Disabled</span>; }
                          return (<div key={p.id} className="bg-[#12121a] border border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"><div className="flex-1"><div className="flex justify-between items-start"><div><div className="font-bold text-white text-lg">{p.name}</div><div className="text-audi-pink font-bold text-sm">+{p.bonusPercent}% Vcoin Bonus</div></div><div className="md:hidden">{statusBadge}</div></div><div className="text-xs font-mono mt-2 space-y-1 bg-black/20 p-2 rounded-lg border border-white/5"><div className="text-green-400 flex items-center gap-2"><Icons.Calendar className="w-3 h-3"/> Start: {new Date(p.startTime).toLocaleString()}</div><div className="text-red-400 flex items-center gap-2"><Icons.Calendar className="w-3 h-3"/> End: {new Date(p.endTime).toLocaleString()}</div></div></div><div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-white/5 pt-3 md:pt-0"><div className="hidden md:block">{statusBadge}</div><div className="flex gap-2"><button onClick={() => setEditingPromotion(p)} className="px-3 py-2 bg-blue-500/20 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-white font-bold text-xs"><Icons.Settings className="w-4 h-4" /></button><button onClick={() => handleDeletePromotion(p.id)} className="px-3 py-2 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500 hover:text-white font-bold text-xs"><Icons.Trash className="w-4 h-4" /></button></div></div></div>);
                      })}
                  </div>
              </div>
          )}

           {/* ================= VIEW: STYLES ================= */}
           {activeView === 'styles' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Quản Lý Style Mẫu</h2>
                      <button 
                          onClick={() => setEditingStyle({
                              id: `temp_${Date.now()}`, 
                              name: '', 
                              image_url: '', 
                              trigger_prompt: '', 
                              is_active: true, 
                              is_default: false
                          })} 
                          className="px-3 py-2 md:px-4 bg-audi-pink text-white rounded-lg font-bold flex items-center gap-2 hover:bg-pink-600 text-xs md:text-sm"
                      >
                          <Icons.Plus className="w-4 h-4" /> <span className="hidden md:inline">Thêm Style Mới</span><span className="md:hidden">Thêm</span>
                      </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {stylePresets.map(style => (
                          <div key={style.id} className="bg-[#12121a] border border-white/10 rounded-2xl p-4 relative overflow-hidden group hover:border-white/30 transition-all">
                              <div className="aspect-[3/4] w-full bg-black/50 rounded-xl mb-4 overflow-hidden relative">
                                  <img src={style.image_url} alt={style.name} className="w-full h-full object-cover" />
                                  {style.is_default && (
                                      <div className="absolute top-2 right-2 bg-audi-yellow text-black text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                                          <Icons.Star className="w-3 h-3" /> DEFAULT
                                      </div>
                                  )}
                                  {!style.is_active && (
                                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                          <span className="text-red-500 font-bold border border-red-500 px-3 py-1 rounded uppercase">Disabled</span>
                                      </div>
                                  )}
                              </div>
                              
                              <div className="flex justify-between items-start mb-2">
                                  <div>
                                      <h3 className="font-bold text-white text-lg">{style.name}</h3>
                                      <p className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{style.trigger_prompt || 'No prompt'}</p>
                                  </div>
                                  <div className="flex gap-2">
                                      <button onClick={() => setEditingStyle(style)} className="p-2 bg-blue-500/20 text-blue-500 rounded hover:bg-blue-500 hover:text-white transition-colors"><Icons.Settings className="w-4 h-4" /></button>
                                      <button onClick={() => showConfirm('Xóa style này?', async () => { await deleteStylePreset(style.id); refreshData(); showToast('Đã xóa style'); })} className="p-2 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                                  </div>
                              </div>
                          </div>
                      ))}
                      
                      {stylePresets.length === 0 && (
                          <div className="col-span-full py-12 text-center text-slate-500 italic border border-dashed border-white/10 rounded-2xl">
                              Chưa có style mẫu nào. Hãy thêm mới!
                          </div>
                      )}
                  </div>
              </div>
           )}

           {/* ================= VIEW: SYSTEM ================= */}
           {activeView === 'system' && (
              <div className="space-y-6 animate-slide-in-right">
                  <div className="flex justify-between items-center">
                      <h2 className="text-lg md:text-2xl font-bold text-white">Hệ Thống</h2>
                      <button onClick={() => runSystemChecks(undefined)} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white flex items-center gap-2">
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

                  {/* Generation Prices Configuration */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-lg text-white flex items-center gap-2">
                              <Icons.Gem className="w-5 h-5 text-audi-yellow" />
                              Cấu hình giá tạo ảnh (VCOIN)
                          </h3>
                          <button 
                              onClick={async () => {
                                  const res = await saveGenerationPrices(generationPrices);
                                  if (res.success) notify("Đã lưu cấu hình giá thành công!", "success");
                                  else notify("Lỗi khi lưu cấu hình giá.", "error");
                              }}
                              className="px-4 py-2 bg-audi-yellow text-black font-bold rounded-lg text-sm hover:bg-yellow-400 transition-colors"
                          >
                              Lưu Cấu Hình Giá
                          </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Flash Prices */}
                          <div className="space-y-4 bg-black/30 p-4 rounded-xl border border-white/5">
                              <h4 className="text-audi-cyan font-bold uppercase text-sm mb-2">Flash Model</h4>
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">1K Resolution</label>
                                  <input type="number" value={generationPrices.flash_1k} onChange={e => setGenerationPrices({...generationPrices, flash_1k: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
                              </div>
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">2K Resolution</label>
                                  <input type="number" value={generationPrices.flash_2k} onChange={e => setGenerationPrices({...generationPrices, flash_2k: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
                              </div>
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">4K Resolution</label>
                                  <input type="number" value={generationPrices.flash_4k} onChange={e => setGenerationPrices({...generationPrices, flash_4k: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
                              </div>
                          </div>

                          {/* Pro Prices */}
                          <div className="space-y-4 bg-black/30 p-4 rounded-xl border border-white/5">
                              <h4 className="text-audi-pink font-bold uppercase text-sm mb-2">Pro Model</h4>
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">1K Resolution</label>
                                  <input type="number" value={generationPrices.pro_1k} onChange={e => setGenerationPrices({...generationPrices, pro_1k: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
                              </div>
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">2K Resolution</label>
                                  <input type="number" value={generationPrices.pro_2k} onChange={e => setGenerationPrices({...generationPrices, pro_2k: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
                              </div>
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">4K Resolution</label>
                                  <input type="number" value={generationPrices.pro_4k} onChange={e => setGenerationPrices({...generationPrices, pro_4k: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
                              </div>
                          </div>

                          {/* Multiplier Prices */}
                          <div className="space-y-4 bg-black/30 p-4 rounded-xl border border-white/5">
                              <h4 className="text-audi-purple font-bold uppercase text-sm mb-2">Phụ phí chế độ</h4>
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">Couple (2 người)</label>
                                  <input type="number" value={generationPrices.couple} onChange={e => setGenerationPrices({...generationPrices, couple: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
                              </div>
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">Group 3 (3 người)</label>
                                  <input type="number" value={generationPrices.group3} onChange={e => setGenerationPrices({...generationPrices, group3: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
                              </div>
                              <div>
                                  <label className="text-xs text-slate-400 mb-1 block">Group 4 (4 người)</label>
                                  <input type="number" value={generationPrices.group4} onChange={e => setGenerationPrices({...generationPrices, group4: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* API Key Configuration */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Lock className="w-5 h-5 text-audi-pink" />
                          Thêm mới Gemini API Key (System)
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
                                          {keyStatus === 'valid' ? 'VALID' :
                                           keyStatus === 'invalid' ? 'INVALID' :
                                           keyStatus === 'checking' ? 'CHECKING...' : 'IDLE'}
                                      </span>
                                  </div>
                              </div>
                              <div className="flex gap-2 relative">
                                  <select 
                                      value={apiKeyTier}
                                      onChange={(e) => setApiKeyTier(e.target.value as 'flash' | 'pro')}
                                      className="bg-black/40 border border-white/10 rounded-lg p-3 text-white font-bold text-sm"
                                  >
                                      <option value="flash">Flash Tier</option>
                                      <option value="pro">Pro Tier</option>
                                  </select>
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
                                      {keyStatus === 'checking' ? <Icons.Loader className="animate-spin w-5 h-5"/> : 'Thêm Key'}
                                  </button>
                              </div>
                              <p className="text-xs text-slate-500 mt-2">
                                  Key sẽ được lưu vào Database. Hệ thống sẽ tự động xoay vòng ngẫu nhiên giữa các key đang hoạt động để tránh quá tải.
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
                      
                      <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-sm text-slate-400">
                              <thead className="bg-black/30 text-xs font-bold text-slate-300 uppercase">
                                  <tr>
                                      <th className="px-4 py-3 w-24">Loại</th>
                                      <th className="px-4 py-3">Tên / ID</th>
                                      <th className="px-4 py-3">Key Value</th>
                                      <th className="px-4 py-3">Trạng thái</th>
                                      <th className="px-4 py-3">Ngày tạo</th>
                                      <th className="px-4 py-3 text-right">Thao tác</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {dbKeys.length === 0 ? (
                                      <tr><td colSpan={6} className="text-center py-6 text-slate-500">Chưa tìm thấy key nào trong database.</td></tr>
                                  ) : dbKeys.map((k) => {
                                      const isPro = k.name?.includes('[PRO]');
                                      const displayName = k.name?.replace('[PRO]', '').replace('[FLASH]', '').trim() || 'Unnamed Key';
                                      
                                      return (
                                      <tr key={k.id} className="hover:bg-white/5">
                                          <td className="px-4 py-3">
                                              {isPro ? (
                                                  <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-audi-pink/20 text-audi-pink border border-audi-pink/30 text-[10px] font-bold w-16">
                                                      PRO
                                                  </span>
                                              ) : (
                                                  <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-audi-cyan/20 text-audi-cyan border border-audi-cyan/30 text-[10px] font-bold w-16">
                                                      FLASH
                                                  </span>
                                              )}
                                          </td>
                                          <td className="px-4 py-3 font-bold text-white">
                                              <div className="text-sm">{displayName}</div>
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
                                              <button onClick={() => handleTestKey(k.key_value)} className="px-3 py-1 bg-audi-purple/20 text-audi-purple hover:bg-audi-purple hover:text-white rounded border border-audi-purple/50 text-xs font-bold transition-colors">Test</button>
                                              <button onClick={() => handleDeleteApiKey(k.id)} className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                                          </td>
                                      </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>
                      <div className="md:hidden space-y-4">
                          {dbKeys.length === 0 ? (
                              <div className="text-center py-4 text-slate-500 text-sm">Chưa có key.</div>
                          ) : dbKeys.map((k) => {
                              const isPro = k.name?.includes('[PRO]');
                              const displayName = k.name?.replace('[PRO]', '').replace('[FLASH]', '').trim() || 'Unnamed Key';
                              
                              return (
                              <div key={k.id} className="bg-white/5 rounded-xl p-4 border border-white/5 relative overflow-hidden">
                                  {/* Badge at top right */}
                                  <div className="absolute top-0 right-0">
                                      {isPro ? (
                                          <div className="bg-audi-pink text-white text-[9px] font-bold px-2 py-1 rounded-bl-lg">PRO TIER</div>
                                      ) : (
                                          <div className="bg-audi-cyan text-black text-[9px] font-bold px-2 py-1 rounded-bl-lg">FLASH TIER</div>
                                      )}
                                  </div>

                                  <div className="flex justify-between items-start mb-2 pr-12">
                                      <div>
                                          <div className="font-bold text-white text-sm">{displayName}</div>
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
                              );
                          })}
                      </div>
                  </div>

                  {/* Database Maintenance */}
                  <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10 mt-6">
                      <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                          <Icons.Database className="w-5 h-5 text-audi-cyan" />
                          Bảo trì Database
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button 
                              onClick={() => setShowGiftcodeFix(true)}
                              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-audi-purple/20 flex items-center justify-center text-audi-purple group-hover:scale-110 transition-transform">
                                      <Icons.Gift className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-white">Fix Giftcode Table</span>
                              </div>
                              <p className="text-xs text-slate-400">Sửa lỗi thiếu bảng gift_codes hoặc system_settings.</p>
                          </button>

                          <button 
                              onClick={() => setShowUserFix(true)}
                              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-audi-pink/20 flex items-center justify-center text-audi-pink group-hover:scale-110 transition-transform">
                                      <Icons.Users className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-white">Fix Users Table</span>
                              </div>
                              <p className="text-xs text-slate-400">Sửa lỗi thiếu bảng users hoặc lỗi phân quyền (RLS).</p>
                          </button>

                          <button 
                              onClick={() => setShowBalanceFix(true)}
                              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 group-hover:scale-110 transition-transform">
                                      <Icons.Gem className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-white">Fix Negative Balance</span>
                              </div>
                              <p className="text-xs text-slate-400">Sửa lỗi số dư âm (-Vcoin) cho tất cả tài khoản.</p>
                          </button>

                          <button 
                              onClick={handleCleanupImages}
                              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                          >
                              <div className="flex items-center gap-3 mb-2">
                                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                                      <Icons.Trash className="w-5 h-5" />
                                  </div>
                                  <span className="font-bold text-white">Xóa ảnh cũ (R2 Cloud)</span>
                              </div>
                              <p className="text-xs text-slate-400">Xóa toàn bộ ảnh trên R2 Cloud cũ hơn 1 ngày (giữ lại ảnh public).</p>
                          </button>
                      </div>
                  </div>
              </div>
           )}

      </div>

      {/* --- MOVED MODALS (ROOT LEVEL) --- */}
      
      {/* BALANCE FIX MODAL */}
      {showBalanceFix && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in bg-black/80 backdrop-blur-sm">
              <div className="bg-[#12121a] w-full max-w-2xl p-6 rounded-2xl border border-yellow-500/50 shadow-[0_0_50px_rgba(255,200,0,0.2)] flex flex-col max-h-[90vh]">
                  <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-500 animate-pulse">
                          <Icons.Gem className="w-6 h-6" />
                      </div>
                      <div>
                          <h3 className="text-xl font-bold text-white">SỬA LỖI SỐ DƯ ÂM</h3>
                          <p className="text-slate-400 text-xs">Reset số dư về 0 cho các tài khoản bị âm Vcoin</p>
                      </div>
                  </div>
                  
                  <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl mb-4">
                      <p className="text-sm text-yellow-300 font-bold mb-1">Cảnh báo:</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                          Hành động này sẽ đặt lại số dư của tất cả người dùng có số dư &lt; 0 về 0. Hãy chắc chắn rằng bạn muốn thực hiện điều này.
                      </p>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col">
                      <p className="text-sm font-bold text-green-400 mb-2 uppercase">Copy mã SQL này và chạy trong Supabase SQL Editor</p>
                      <div className="relative h-64 bg-black/50 border border-white/10 rounded-xl overflow-hidden">
                          <pre className="absolute inset-0 p-4 text-[10px] md:text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap selection:bg-audi-pink selection:text-white">
                              {BALANCE_FIX_SQL}
                          </pre>
                          <button 
                            onClick={() => {
                                navigator.clipboard.writeText(BALANCE_FIX_SQL);
                                showToast("Đã sao chép SQL!", 'info');
                            }}
                            className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
                          >
                              <Icons.Copy className="w-4 h-4" /> Sao chép
                          </button>
                      </div>
                  </div>
                  
                  <div className="flex justify-end gap-3 mt-6">
                      <button onClick={() => setShowBalanceFix(false)} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold transition-colors text-sm">Đóng</button>
                      <button onClick={() => window.open('https://supabase.com/dashboard/project/_/sql', '_blank')} className="px-6 py-2 bg-yellow-500 text-black hover:bg-yellow-400 rounded-lg font-bold transition-colors text-sm flex items-center gap-2">
                          <Icons.ExternalLink className="w-4 h-4" /> Mở SQL Editor
                      </button>
                  </div>
              </div>
          </div>
      )}
      {/* GIFTCODE ERROR FIX MODAL (NEW) */}
      {showGiftcodeFix && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-[#12121a] w-full max-w-2xl p-6 rounded-2xl border border-red-500/50 shadow-[0_0_50px_rgba(255,0,0,0.2)] flex flex-col max-h-[90vh]">
                  <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                          <Icons.Database className="w-6 h-6" />
                      </div>
                      <div>
                          <h3 className="text-xl font-bold text-white">LỖI DATABASE: BẢNG DỮ LIỆU</h3>
                          <p className="text-slate-400 text-xs">Phát hiện thiếu bảng Giftcode hoặc System Settings</p>
                      </div>
                  </div>
                  
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-4">
                      <p className="text-sm text-red-300 font-bold mb-1">Nguyên nhân:</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                          Supabase báo lỗi thiếu bảng <code>gift_codes</code> hoặc <code>system_settings</code>. Đây là lỗi phổ biến khi tạo dự án mới chưa chạy script khởi tạo.
                      </p>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col">
                      <p className="text-sm font-bold text-green-400 mb-2 uppercase">Giải pháp: Copy mã SQL này và chạy trong Supabase SQL Editor</p>
                      <div className="relative h-64 bg-black/50 border border-white/10 rounded-xl overflow-hidden">
                          <pre className="absolute inset-0 p-4 text-[10px] md:text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap selection:bg-audi-pink selection:text-white">
                              {GIFTCODE_FIX_SQL}
                          </pre>
                          <button 
                            onClick={() => {
                                navigator.clipboard.writeText(GIFTCODE_FIX_SQL);
                                showToast("Đã sao chép SQL!", 'info');
                            }}
                            className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
                          >
                              <Icons.Copy className="w-4 h-4" /> Sao chép
                          </button>
                      </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                      <a 
                        href="https://supabase.com/dashboard/project/_/sql" 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex-1 py-3 bg-audi-purple hover:bg-purple-600 text-white rounded-xl font-bold text-center transition-colors flex items-center justify-center gap-2"
                      >
                          <Icons.Database className="w-4 h-4" /> Mở SQL Editor
                      </a>
                      <button onClick={() => setShowGiftcodeFix(false)} className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors">
                          Đóng
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* USER DB FIX MODAL */}
      {showUserFix && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-[#12121a] w-full max-w-2xl p-6 rounded-2xl border border-red-500/50 shadow-[0_0_50px_rgba(255,0,0,0.2)] flex flex-col max-h-[90vh]">
                  <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                          <Icons.Database className="w-6 h-6" />
                      </div>
                      <div>
                          <h3 className="text-xl font-bold text-white">LỖI DATABASE: BẢNG USERS</h3>
                          <p className="text-slate-400 text-xs">Phát hiện thiếu bảng Users hoặc lỗi RLS Policy</p>
                      </div>
                  </div>
                  
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-4">
                      <p className="text-sm text-red-300 font-bold mb-1">Nguyên nhân:</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                          Supabase không cho phép đọc bảng <code>public.users</code> hoặc bảng chưa được tạo. Điều này thường xảy ra khi Row Level Security (RLS) chưa được cấu hình đúng.
                      </p>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col">
                      <p className="text-sm font-bold text-green-400 mb-2 uppercase">Giải pháp: Copy mã SQL này và chạy trong Supabase SQL Editor</p>
                      <div className="relative h-64 bg-black/50 border border-white/10 rounded-xl overflow-hidden">
                          <pre className="absolute inset-0 p-4 text-[10px] md:text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap selection:bg-audi-pink selection:text-white">
                              {USER_FIX_SQL}
                          </pre>
                          <button 
                            onClick={() => {
                                navigator.clipboard.writeText(USER_FIX_SQL);
                                showToast("Đã sao chép SQL!", 'info');
                            }}
                            className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
                          >
                              <Icons.Copy className="w-4 h-4" /> Sao chép
                          </button>
                      </div>
                      
                      <div className="mt-4 bg-audi-pink/10 border border-audi-pink/30 p-3 rounded-xl">
                          <p className="text-xs font-bold text-audi-pink mb-1 uppercase">Khôi phục quyền Admin:</p>
                          <div className="flex gap-2">
                              <code className="flex-1 bg-black/50 p-2 rounded text-[10px] font-mono text-white overflow-x-auto whitespace-nowrap">
                                  UPDATE public.users SET is_admin = true WHERE email = '{currentUserEmail || 'YOUR_EMAIL'}';
                              </code>
                              <button 
                                  onClick={() => {
                                      navigator.clipboard.writeText(`UPDATE public.users SET is_admin = true WHERE email = '${currentUserEmail || 'YOUR_EMAIL'}';`);
                                      showToast("Đã sao chép lệnh!", 'info');
                                  }}
                                  className="px-3 bg-audi-pink text-white rounded font-bold text-xs hover:bg-pink-600 transition-colors"
                              >
                                  Copy
                              </button>
                          </div>
                      </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                      <a 
                        href="https://supabase.com/dashboard/project/_/sql" 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex-1 py-3 bg-audi-purple hover:bg-purple-600 text-white rounded-xl font-bold text-center transition-colors flex items-center justify-center gap-2"
                      >
                          <Icons.Database className="w-4 h-4" /> Mở SQL Editor
                      </a>
                      <button onClick={() => setShowUserFix(false)} className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors">
                          Đóng
                      </button>
                  </div>
              </div>
          </div>
      )}

      {viewingUser && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 animate-fade-in overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-4xl p-6 rounded-2xl border border-white/20 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-4">
                          <img src={viewingUser.avatar || 'https://picsum.photos/100/100'} className="w-16 h-16 rounded-full border-2 border-audi-pink object-cover" />
                          <div>
                              <h3 className="text-2xl font-bold text-white">{viewingUser.username}</h3>
                              <p className="text-slate-400 text-sm">{viewingUser.email}</p>
                              <div className="flex gap-2 mt-1">
                                  <span className="text-audi-yellow font-bold text-xs bg-audi-yellow/10 px-2 py-0.5 rounded">{viewingUser.balance} Vcoin</span>
                                  <span className="text-blue-400 font-bold text-xs bg-blue-400/10 px-2 py-0.5 rounded uppercase">{viewingUser.role}</span>
                              </div>
                          </div>
                      </div>
                      <button onClick={() => setViewingUser(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors">
                          <Icons.X className="w-6 h-6" />
                      </button>
                  </div>

                  {loadingUserDetails ? (
                      <div className="flex-1 flex items-center justify-center py-12">
                          <Icons.Loader className="w-8 h-8 text-audi-pink animate-spin" />
                      </div>
                  ) : (
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-8">
                          {/* Lịch sử giao dịch */}
                          <div>
                              <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                  <Icons.History className="w-5 h-5 text-audi-cyan" />
                                  Lịch sử hoạt động
                              </h4>
                              <div className="bg-black/30 rounded-xl border border-white/5 overflow-hidden">
                                  <div className="max-h-80 overflow-y-auto custom-scrollbar">
                                      <table className="w-full text-left text-sm text-slate-400">
                                          <thead className="bg-black/80 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10 backdrop-blur-sm">
                                              <tr>
                                                  <th className="px-4 py-3">Thời gian</th>
                                                  <th className="px-4 py-3">Nội dung</th>
                                                  <th className="px-4 py-3 text-right">Biến động</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-white/5">
                                              {userHistory.length === 0 ? (
                                                  <tr><td colSpan={3} className="text-center py-8 text-slate-500 italic">Chưa có lịch sử giao dịch.</td></tr>
                                              ) : userHistory.slice(0, historyLimit).map(item => (
                                                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                                      <td className="px-4 py-3 text-xs font-mono">{new Date(item.createdAt).toLocaleString()}</td>
                                                      <td className="px-4 py-3 text-white">{item.description}</td>
                                                      <td className={`px-4 py-3 text-right font-bold ${item.vcoinChange > 0 ? 'text-green-400' : 'text-audi-pink'}`}>
                                                          {item.vcoinChange > 0 ? '+' : ''}{item.vcoinChange} VC
                                                      </td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                  </div>
                                  {userHistory.length > historyLimit && (
                                      <div className="p-2 border-t border-white/5 text-center">
                                          <button 
                                              onClick={() => setHistoryLimit(prev => prev + 20)}
                                              className="text-xs font-bold text-audi-cyan hover:text-white transition-colors py-2 px-4 rounded-lg hover:bg-white/5"
                                          >
                                              Xem thêm ({userHistory.length - historyLimit} giao dịch)
                                          </button>
                                      </div>
                                  )}
                              </div>
                          </div>

                          {/* Lịch sử tạo ảnh */}
                          <div>
                              <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                  <Icons.Image className="w-5 h-5 text-audi-pink" />
                                  Ảnh đã tạo ({userImages.length} tổng cộng)
                              </h4>
                              {userImages.length === 0 ? (
                                  <div className="text-center py-8 text-slate-500 italic bg-black/30 rounded-xl border border-white/5">
                                      Chưa có ảnh nào được tạo.
                                  </div>
                              ) : (
                                  <>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                          {userImages.slice(0, imagesLimit).map(img => (
                                              <div key={img.id} className="bg-black/30 rounded-xl border border-white/5 overflow-hidden group">
                                                  <div className="aspect-square relative">
                                                      <img src={img.url} className="w-full h-full object-cover" />
                                                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                                                          <p className="text-[10px] text-white text-center line-clamp-4">{img.prompt}</p>
                                                      </div>
                                                  </div>
                                                  <div className="p-2">
                                                      <div className="text-[10px] text-slate-400 font-mono truncate">{new Date(img.timestamp).toLocaleDateString()}</div>
                                                      <div className="text-xs font-bold text-audi-cyan truncate">{img.toolName}</div>
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                      {userImages.length > imagesLimit && (
                                          <div className="mt-4 text-center">
                                              <button 
                                                  onClick={() => setImagesLimit(prev => prev + 20)}
                                                  className="text-sm font-bold text-audi-pink hover:text-white transition-colors py-2 px-6 rounded-xl border border-audi-pink/30 hover:bg-audi-pink/20"
                                              >
                                                  Xem thêm ({userImages.length - imagesLimit} ảnh)
                                              </button>
                                          </div>
                                      )}
                                  </>
                              )}
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}

      {editingUser && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 animate-fade-in overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-white/20 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <h3 className="text-xl font-bold text-white mb-4">Sửa Người Dùng</h3>
                  <div className="space-y-4 mb-6">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên hiển thị</label>
                          <input value={editingUser.username || ''} onChange={e => setEditingUser({...editingUser, username: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-audi-pink outline-none" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Số dư Vcoin</label>
                          <input type="number" value={editingUser.balance || 0} onChange={e => setEditingUser({...editingUser, balance: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold focus:border-audi-pink outline-none" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Ảnh đại diện URL</label>
                          <input value={editingUser.avatar || ''} onChange={e => setEditingUser({...editingUser, avatar: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-slate-300 text-xs font-mono focus:border-audi-pink outline-none" />
                      </div>
                  </div>
                  <div className="flex gap-3"><button onClick={() => setEditingUser(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold">Hủy</button><button onClick={handleSaveUser} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold">Lưu</button></div>
              </div>
          </div>
      )}
      {/* ... Other modals ... */}
      {editingPackage && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <h3 className="text-xl font-bold text-white mb-6">{editingPackage.id.startsWith('temp_') ? 'Thêm Gói Mới' : 'Sửa Gói Nạp'}</h3>
                  <div className="space-y-4 mb-6">
                      <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên gói</label><input value={editingPackage.name} onChange={e => setEditingPackage({...editingPackage, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tag (VD: Mới)</label><input value={editingPackage.bonusText} onChange={e => setEditingPackage({...editingPackage, bonusText: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div></div>
                      <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Giá (VND)</label><input type="number" value={editingPackage.price} onChange={e => setEditingPackage({...editingPackage, price: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-green-400 font-bold" /></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Vcoin nhận</label><input type="number" value={editingPackage.coin} onChange={e => setEditingPackage({...editingPackage, coin: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold" /></div></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">% Bonus thêm (Mặc định)</label><div className="relative"><input type="number" value={editingPackage.bonusPercent} onChange={e => setEditingPackage({...editingPackage, bonusPercent: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-pink font-bold pl-3" /><span className="absolute right-3 top-3.5 text-xs text-slate-500 font-bold">%</span></div></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Cú pháp chuyển khoản</label><input value={editingPackage.transferContent} onChange={e => setEditingPackage({...editingPackage, transferContent: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono" /></div>
                      <div className="flex gap-4 pt-2"><label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors"><input type="checkbox" checked={editingPackage.isPopular} onChange={e => setEditingPackage({...editingPackage, isPopular: e.target.checked})} className="accent-audi-pink w-4 h-4" /><span className="text-sm font-bold text-white">Gói HOT (Nổi bật)</span></label><label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors"><input type="checkbox" checked={editingPackage.isActive} onChange={e => setEditingPackage({...editingPackage, isActive: e.target.checked})} className="accent-green-500 w-4 h-4" /><span className="text-sm font-bold text-white">Đang bán (Active)</span></label></div>
                  </div>
                  <div className="flex gap-3"><button onClick={() => setEditingPackage(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold">Hủy</button><button onClick={handleSavePackage} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold">Lưu Thay Đổi</button></div>
              </div>
          </div>
      )}
      {editingPromotion && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto"><div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh]"><h3 className="text-xl font-bold text-white mb-6 sticky top-0 bg-[#12121a] z-10 py-2 border-b border-white/10 shrink-0">{editingPromotion.id.startsWith('temp_') ? 'Tạo Chiến Dịch Mới' : 'Sửa Chiến Dịch'}</h3><div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên chiến dịch (Nội bộ)</label><input value={editingPromotion.name} onChange={e => setEditingPromotion({...editingPromotion, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" placeholder="Ví dụ: Sale 8/3"/></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Thông báo chạy (Marquee)</label><input value={editingPromotion.marqueeText} onChange={e => setEditingPromotion({...editingPromotion, marqueeText: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" placeholder="Khuyến mãi đặc biệt..."/></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">% Bonus Vcoin</label><div className="relative"><input type="number" value={editingPromotion.bonusPercent} onChange={e => setEditingPromotion({...editingPromotion, bonusPercent: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-pink font-bold pl-3" /><span className="absolute right-3 top-3.5 text-xs text-slate-500 font-bold">%</span></div></div><div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Bắt đầu</label><input type="datetime-local" value={editingPromotion.startTime ? new Date(editingPromotion.startTime).toISOString().slice(0, 16) : ''} onChange={e => setEditingPromotion({...editingPromotion, startTime: new Date(e.target.value).toISOString()})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono text-xs" /></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Kết thúc</label><input type="datetime-local" value={editingPromotion.endTime ? new Date(editingPromotion.endTime).toISOString().slice(0, 16) : ''} onChange={e => setEditingPromotion({...editingPromotion, endTime: new Date(e.target.value).toISOString()})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono text-xs" /></div></div><div className="bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setEditingPromotion({...editingPromotion, isActive: !editingPromotion.isActive})}><div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${editingPromotion.isActive ? 'bg-audi-lime border-audi-lime' : 'border-slate-500'}`}>{editingPromotion.isActive && <Icons.Check className="w-3 h-3 text-black" />}</div><label className="text-sm font-bold text-white cursor-pointer select-none">Kích hoạt (Manual Switch)</label></div><p className="text-[10px] text-slate-500 italic">Chiến dịch chỉ chạy khi BẬT và trong khoảng thời gian quy định.</p></div><div className="flex gap-3 pt-6 mt-2 border-t border-white/10 shrink-0"><button onClick={() => setEditingPromotion(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold transition-colors">Hủy</button><button onClick={handleSavePromotion} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold shadow-lg transition-all">Lưu Chiến Dịch</button></div></div></div>
      )}
      {editingGiftcode && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-white/20 shadow-2xl">
                  <h3 className="text-xl font-bold text-white mb-6">{editingGiftcode.id.startsWith('temp_') ? 'Tạo Giftcode' : 'Sửa Giftcode'}</h3>
                  <div className="space-y-4 mb-6"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Mã Code (Tự động in hoa)</label><input value={editingGiftcode.code} onChange={e => setEditingGiftcode({...editingGiftcode, code: e.target.value.toUpperCase()})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono font-bold" placeholder="Vd: CHAOMUNG"/></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Phần thưởng (Vcoin)</label><input type="number" value={editingGiftcode.reward} onChange={e => setEditingGiftcode({...editingGiftcode, reward: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-audi-yellow font-bold" /></div><div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Giới hạn tổng</label><input type="number" value={editingGiftcode.totalLimit} onChange={e => setEditingGiftcode({...editingGiftcode, totalLimit: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Max/Người</label><input type="number" value={editingGiftcode.maxPerUser} onChange={e => setEditingGiftcode({...editingGiftcode, maxPerUser: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white" /></div></div><label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors mt-2"><input type="checkbox" checked={editingGiftcode.isActive} onChange={e => setEditingGiftcode({...editingGiftcode, isActive: e.target.checked})} className="accent-green-500 w-4 h-4" /><span className="text-sm font-bold text-white">Kích hoạt ngay</span></label></div><div className="flex gap-3"><button onClick={() => setEditingGiftcode(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold">Hủy</button><button onClick={handleSaveGiftcode} className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold">Lưu Code</button></div>
              </div>
          </div>
      )}

      {editingStyle && (
          <div className="fixed inset-0 z-[2000] flex justify-center items-start p-4 pt-24 overflow-y-auto">
              <div className="bg-[#12121a] w-full max-w-lg p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col max-h-[90vh]">
                  <h3 className="text-xl font-bold text-white mb-6 sticky top-0 bg-[#12121a] z-10 py-2 border-b border-white/10 shrink-0">
                      {editingStyle.id.startsWith('temp_') ? 'Thêm Style Mới' : 'Sửa Style'}
                  </h3>
                  <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tên Style</label>
                          <input 
                              value={editingStyle.name} 
                              onChange={e => setEditingStyle({...editingStyle, name: e.target.value})} 
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" 
                              placeholder="Ví dụ: 3D Audition"
                          />
                      </div>
                      
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Ảnh Mẫu (Reference)</label>
                          <div className="flex gap-4 items-start">
                              <div className="w-24 h-32 bg-black/50 rounded-lg border border-white/10 overflow-hidden shrink-0">
                                  {editingStyle.image_url ? (
                                      <img src={editingStyle.image_url} className="w-full h-full object-cover" />
                                  ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-600"><Icons.Image className="w-8 h-8" /></div>
                                  )}
                              </div>
                              <div className="flex-1">
                                  <input 
                                      type="file" 
                                      accept="image/*"
                                      onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                              const reader = new FileReader();
                                              reader.onloadend = () => {
                                                  setEditingStyle({...editingStyle, image_url: reader.result as string});
                                              };
                                              reader.readAsDataURL(file);
                                          }
                                      }}
                                      className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-audi-pink file:text-white hover:file:bg-pink-600 mb-2"
                                  />
                                  <p className="text-[10px] text-slate-500">Upload ảnh chất lượng cao để làm mẫu chuẩn cho AI.</p>
                              </div>
                          </div>
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Trigger Prompt (Optional)</label>
                          <textarea 
                              value={editingStyle.trigger_prompt || ''} 
                              onChange={e => setEditingStyle({...editingStyle, trigger_prompt: e.target.value})} 
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono text-xs h-24" 
                              placeholder="Các từ khóa bổ sung để kích hoạt style này..."
                          />
                          <button 
                              onClick={async () => {
                                  if (!editingStyle.image_url) {
                                      showToast('Vui lòng upload ảnh trước!', 'error');
                                      return;
                                  }
                                  showToast('Đang phân tích style bằng AI...', 'info');
                                  try {
                                      const analysis = await analyzeStyleImage(editingStyle.image_url);
                                      setEditingStyle(prev => prev ? ({...prev, trigger_prompt: analysis}) : null);
                                      showToast('Đã phân tích xong!', 'success');
                                  } catch (e) {
                                      showToast('Lỗi phân tích: ' + (e as any).message, 'error');
                                  }
                              }}
                              className="mt-2 text-[10px] font-bold text-audi-cyan hover:text-white flex items-center gap-1 bg-audi-cyan/10 px-2 py-1 rounded border border-audi-cyan/30 transition-colors"
                          >
                              <Icons.Sparkles className="w-3 h-3" /> AI Phân Tích Style
                          </button>
                      </div>

                      <div className="flex gap-4 pt-2">
                          <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors">
                              <input 
                                  type="checkbox" 
                                  checked={editingStyle.is_default} 
                                  onChange={e => setEditingStyle({...editingStyle, is_default: e.target.checked})} 
                                  className="accent-audi-yellow w-4 h-4" 
                              />
                              <span className="text-sm font-bold text-white">Đặt làm Mặc Định</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10 flex-1 hover:bg-white/10 transition-colors">
                              <input 
                                  type="checkbox" 
                                  checked={editingStyle.is_active} 
                                  onChange={e => setEditingStyle({...editingStyle, is_active: e.target.checked})} 
                                  className="accent-green-500 w-4 h-4" 
                              />
                              <span className="text-sm font-bold text-white">Kích hoạt</span>
                          </label>
                      </div>
                  </div>
                  
                  <div className="flex gap-3 pt-6 mt-2 border-t border-white/10 shrink-0">
                      <button onClick={() => setEditingStyle(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold transition-colors">Hủy</button>
                      <button 
                          onClick={async () => {
                              if (!editingStyle.name || !editingStyle.image_url) {
                                  showToast('Vui lòng nhập tên và tải ảnh mẫu!', 'error');
                                  return;
                              }
                              const res = await saveStylePreset(editingStyle);
                              if (res.success) {
                                  setEditingStyle(null);
                                  refreshData();
                                  showToast('Lưu Style thành công!');
                              } else {
                                  showToast('Lỗi: ' + res.error, 'error');
                              }
                          }} 
                          className="flex-1 py-3 rounded-xl bg-audi-pink hover:bg-pink-600 text-white font-bold shadow-lg transition-all"
                      >
                          Lưu Style
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Modal Xem Người Dùng Giftcode */}
      {viewingGiftcodeUsage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-[#1a1a24] w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <Icons.Users className="w-6 h-6 text-green-500" />
                          Người dùng đã nhập code <span className="text-audi-yellow font-mono">{viewingGiftcodeUsage.code}</span>
                      </h3>
                      <button onClick={() => setViewingGiftcodeUsage(null)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"><Icons.X className="w-5 h-5" /></button>
                  </div>
                  
                  <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
                      {loadingGiftcodeUsers ? (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
                              <Icons.Loader className="w-8 h-8 animate-spin text-audi-cyan" />
                              <p>Đang tải danh sách...</p>
                          </div>
                      ) : giftcodeUsers.length === 0 ? (
                          <div className="text-center py-12 text-slate-500 italic">
                              Chưa có ai sử dụng mã này.
                          </div>
                      ) : (
                          <table className="w-full text-left text-sm text-slate-400">
                              <thead className="bg-black/40 text-xs font-bold text-slate-500 uppercase sticky top-0 backdrop-blur-md z-10">
                                  <tr>
                                      <th className="px-6 py-3">Người dùng</th>
                                      <th className="px-6 py-3">Email</th>
                                      <th className="px-6 py-3 text-right">Thời gian</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                  {giftcodeUsers.map((u, idx) => (
                                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                                          <td className="px-6 py-3 flex items-center gap-3">
                                              <img src={u.userAvatar} className="w-8 h-8 rounded-full bg-white/10" />
                                              <span className="font-bold text-white">{u.userName}</span>
                                          </td>
                                          <td className="px-6 py-3">{u.userEmail}</td>
                                          <td className="px-6 py-3 text-right font-mono text-xs">{new Date(u.usedAt).toLocaleString()}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      )}
                  </div>

                  <div className="p-4 border-t border-white/10 bg-black/20 shrink-0 text-right">
                      <button onClick={() => setViewingGiftcodeUsage(null)} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold transition-colors">Đóng</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
