import { useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useState } from 'react';
import { AlertTriangle, Loader } from 'lucide-react';
import { NotificationProvider, useNotification } from './components/NotificationSystem';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { MobileLayout } from './components/layout/MobileLayout';
import { Splash } from './views/Splash';
import { Home } from './views/Home';
import { WorkspaceImage } from './views/WorkspaceImage';
import { WorkspaceVideo } from './views/WorkspaceVideo';
import { WorkspaceEdit } from './views/WorkspaceEdit';
import { WorkspacePromptImage } from './views/WorkspacePromptImage';
import { Gallery } from './views/Gallery';
import { TopUp } from './views/TopUp';
import { Settings } from './views/Settings';
import { About } from './views/About';
import { Support } from './views/Support';
import { Guide } from './views/Guide';
import { AdminView } from './views/Admin';
import { PaymentGatewayView } from './views/PaymentGateway';
import { syncPayOSTransaction } from './services/serverQueueService';
import { getSystemAnnouncementConfig, type SystemAnnouncementConfig } from './services/economyService';
import { getSupabaseUser, supabase } from './services/supabaseClient';
import { AppEventPopup, type AppEventPopupData, SystemAnnouncementModal } from '../../components/AppNotificationPopups';
import './mobile-shell.css';

const SYSTEM_ANNOUNCEMENT_DISMISS_STORAGE_KEY = 'auditionai:system-announcement-dismissed';
const SYSTEM_ANNOUNCEMENT_DISMISS_MS = 12 * 60 * 60 * 1000;

const shouldShowSystemAnnouncement = (config: SystemAnnouncementConfig | null) => {
  if (!config?.isActive) return false;
  if (typeof window === 'undefined') return true;

  try {
    const raw = window.localStorage.getItem(SYSTEM_ANNOUNCEMENT_DISMISS_STORAGE_KEY);
    if (!raw) return true;

    const parsed = JSON.parse(raw) as { dismissedAt?: number; updatedAt?: string };
    if (parsed.updatedAt !== (config.updatedAt || '')) return true;
    if (!parsed.dismissedAt) return true;

    return Date.now() - parsed.dismissedAt >= SYSTEM_ANNOUNCEMENT_DISMISS_MS;
  } catch {
    return true;
  }
};

const dismissSystemAnnouncementForTwelveHours = (config: SystemAnnouncementConfig | null) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SYSTEM_ANNOUNCEMENT_DISMISS_STORAGE_KEY,
      JSON.stringify({
        dismissedAt: Date.now(),
        updatedAt: config?.updatedAt || '',
      }),
    );
  } catch {
    // Ignore storage failures.
  }
};

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#18181B]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#111] to-[#444] shadow-2xl flex items-center justify-center">
            <span className="text-white text-3xl font-bold">A</span>
          </div>
          <Loader className="w-6 h-6 animate-spin text-gray-400 dark:text-zinc-500" />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {!isAuthenticated ? (
        <>
          <Route path="/" element={<Splash />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          <Route element={<MobileLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/generate/image" element={<WorkspaceImage />} />
            <Route path="/generate/video" element={<WorkspaceVideo />} />
            <Route path="/tools/ai-image" element={<WorkspacePromptImage />} />
            <Route path="/tools/:toolId" element={<WorkspaceEdit />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/topup" element={<TopUp />} />
            <Route path="/payment-gateway" element={<PaymentGatewayView />} />
            <Route path="/profile" element={<Settings />} />
            <Route path="/about" element={<About />} />
            <Route path="/support" element={<Support />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/admin" element={<AdminView />} />
          </Route>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </>
      )}
    </Routes>
  );
}

function MobileRuntimeEffects() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { isAuthenticated, maintenanceMode, userRole } = useAuth();

  const handledPayOsReturnRef = useRef<string | null>(null);
  const notifiedTerminalJobsRef = useRef<Set<string>>(new Set());
  const [systemAnnouncement, setSystemAnnouncement] = useState<SystemAnnouncementConfig | null>(null);
  const [showSystemAnnouncement, setShowSystemAnnouncement] = useState(false);
  const [eventPopup, setEventPopup] = useState<AppEventPopupData | null>(null);

  const readPendingPaymentMeta = useCallback((orderCode?: string | null) => {
    if (!orderCode || typeof window === 'undefined') return null;
    try {
      const storageKey = `auditionai:pending-payment:${orderCode}`;
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return null;
      window.sessionStorage.removeItem(storageKey);
      return JSON.parse(raw) as { amount?: number; vcoin?: number; packageName?: string };
    } catch (error) {
      console.warn('[Mobile] Failed to read pending payment metadata', error);
      return null;
    }
  }, []);

  const showPaymentSuccessPopup = useCallback((orderCode?: string | null) => {
    const meta = readPendingPaymentMeta(orderCode);
    const amountText = typeof meta?.amount === 'number' ? `${meta.amount.toLocaleString('vi-VN')}đ` : 'giao dịch';
    const vcoinText = typeof meta?.vcoin === 'number' ? `${meta.vcoin.toLocaleString('vi-VN')} Vcoin` : 'Vcoin';
    setEventPopup({
      type: 'payment_success',
      title: 'Nạp tiền thành công',
      message: `Bạn đã nạp thành công ${amountText}, hệ thống đã cộng ${vcoinText} vào tài khoản.`,
      actionLabel: 'Xem giao dịch',
    });
  }, [readPendingPaymentMeta]);

  useEffect(() => {
    getSystemAnnouncementConfig().then((config) => {
      setSystemAnnouncement(config);
      setShowSystemAnnouncement(shouldShowSystemAnnouncement(config));
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    const orderCode = params.get('orderCode');

    if (!status) return;

    const returnKey = `${status}:${orderCode || ''}`;
    if (handledPayOsReturnRef.current === returnKey) return;
    handledPayOsReturnRef.current = returnKey;

    const handleReturn = async () => {
      if (status === 'PAID') {
        if (orderCode) {
          try {
            await syncPayOSTransaction(orderCode);
            window.dispatchEvent(new Event('balance_updated'));
            showPaymentSuccessPopup(orderCode);
            notify('Thanh toán thành công! Vcoin đã được cộng tự động.', 'success');
          } catch (error) {
            console.error('Failed to sync PayOS transaction on mobile return:', error);
            notify('Thanh toán đã ghi nhận. Hệ thống đang đồng bộ giao dịch...', 'info');
          }
        } else {
          showPaymentSuccessPopup(orderCode);
          notify('Thanh toán thành công! Vcoin sẽ được cộng trong giây lát.', 'success');
        }
        navigate('/topup', { replace: true });
        return;
      }

      if (status === 'CANCELLED') {
        notify('Đã hủy thanh toán.', 'error');
        navigate('/topup', { replace: true });
        return;
      }

      navigate(location.pathname, { replace: true });
    };

    void handleReturn();
  }, [location.pathname, location.search, navigate, notify, showPaymentSuccessPopup]);

  useEffect(() => {
    if (!isAuthenticated || !supabase) return;

    let isDisposed = false;
    let channel: any = null;

    getSupabaseUser().then((authUser: any) => {
      if (isDisposed || !authUser?.id) return;

      channel = supabase
        .channel(`mobile-terminal-events:${authUser.id}:${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'generated_images',
            filter: `user_id=eq.${authUser.id}`,
          },
          (payload: any) => {
            const row = payload?.new || {};
            const status = row.status;
            if (status !== 'completed' && status !== 'failed') return;

            const eventKey = `${row.id || row.job_id || payload.commit_timestamp}:${status}`;
            if (notifiedTerminalJobsRef.current.has(eventKey)) return;
            notifiedTerminalJobsRef.current.add(eventKey);

            const assetLabel = row.asset_type === 'video' ? 'Video' : 'Ảnh';
            if (status === 'completed') {
              setEventPopup({
                type: 'generation_success',
                title: `${assetLabel} đã tạo thành công`,
                message: `${assetLabel} của bạn đã tạo thành công bởi AUDITION AI.`,
                actionLabel: 'Xem kết quả',
              });
              return;
            }

            setEventPopup({
              type: 'generation_failed',
              title: `${assetLabel} tạo thất bại`,
              message: row.error_message || `${assetLabel} của bạn tạo thất bại. Vui lòng kiểm tra lịch sử tạo để xem chi tiết.`,
              actionLabel: 'Xem lịch sử',
            });
          },
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[Mobile] Realtime terminal event subscription failed.');
          }
        });
    });

    return () => {
      isDisposed = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <SystemAnnouncementModal
        config={showSystemAnnouncement ? systemAnnouncement : null}
        mode="mobile"
        onClose={() => {
          dismissSystemAnnouncementForTwelveHours(systemAnnouncement);
          setShowSystemAnnouncement(false);
        }}
      />
      <AppEventPopup
        data={eventPopup}
        mode="mobile"
        onClose={() => setEventPopup(null)}
        onAction={() => {
          const target = eventPopup?.type === 'payment_success' ? '/topup' : '/gallery';
          setEventPopup(null);
          navigate(target);
        }}
      />
      {maintenanceMode.isActive && userRole !== 'admin' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-md p-5">
          <div className="w-full max-w-sm rounded-[32px] border border-red-500/20 bg-white p-6 text-center shadow-2xl animate-slide-up dark:bg-[#18181B]">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Hệ thống đang bảo trì</h2>
            <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed mb-6">
              {maintenanceMode.message || 'Hệ thống đang bảo trì, vui lòng quay lại sau.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-black py-3 text-sm font-semibold"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function MobileAppShell() {
  return (
    <>
      <AppRoutes />
      <MobileRuntimeEffects />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <NotificationProvider>
          <AuthProvider>
            <MobileAppShell />
          </AuthProvider>
        </NotificationProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
