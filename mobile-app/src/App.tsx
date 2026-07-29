import { useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useCallback, useState } from 'react';
import { AlertTriangle, Loader, Lock } from 'lucide-react';
import { NotificationProvider, useNotification } from './components/NotificationSystem';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { MobileLayout } from './components/layout/MobileLayout';
import { MobileV2Layout } from './v2/components/MobileV2Layout';
import { AuditionV2Logo } from './v2/components/AuditionV2Logo';
import { useMobileUiVersion } from './v2/mobileUiVersion';
import { syncPaymentTransaction } from './services/serverQueueService';
import { trackEvent, trackPageView } from './services/analyticsService';
import { getFeatureMaintenanceConfig, getSystemAnnouncementConfig, isFeatureInMaintenance, type FeatureMaintenanceConfig, type SystemAnnouncementConfig } from './services/economyService';
import { AppEventPopup, type AppEventPopupData, SystemAnnouncementModal } from '../../components/AppNotificationPopups';
import { AppTour } from '../../components/AppTour';
import './mobile-shell.css';

const HomeV2 = lazy(() => import('./v2/views/HomeV2').then((module) => ({ default: module.HomeV2 })));
const MobileV2Preview = lazy(() => import('./v2/views/MobileV2Preview').then((module) => ({ default: module.MobileV2Preview })));
const AuthV2 = lazy(() => import('./v2/views/AuthV2').then((module) => ({ default: module.AuthV2 })));
const ToolsHubV2 = lazy(() => import('./v2/views/ToolsHubV2').then((module) => ({ default: module.ToolsHubV2 })));
const loadV2Feature = <T extends keyof typeof import('./v2/views/V2FeatureViews')>(name: T) =>
  lazy(() => import('./v2/views/V2FeatureViews').then((module) => ({ default: module[name] })));
const AboutV2 = loadV2Feature('AboutV2');
const AdminV2 = loadV2Feature('AdminV2');
const EditStudioV2 = loadV2Feature('EditStudioV2');
const GalleryV2 = loadV2Feature('GalleryV2');
const GuideV2 = loadV2Feature('GuideV2');
const ImageStudioV2 = loadV2Feature('ImageStudioV2');
const PaymentGatewayV2 = loadV2Feature('PaymentGatewayV2');
const ProfileV2 = loadV2Feature('ProfileV2');
const PromptImageStudioV2 = loadV2Feature('PromptImageStudioV2');
const PromptLibraryV2 = loadV2Feature('PromptLibraryV2');
const SupportV2 = loadV2Feature('SupportV2');
const TopUpV2 = loadV2Feature('TopUpV2');
const VideoStudioV2 = loadV2Feature('VideoStudioV2');

const Splash = lazy(() => import('./views/Splash').then((module) => ({ default: module.Splash })));
const Home = lazy(() => import('./views/Home').then((module) => ({ default: module.Home })));
const WorkspaceImage = lazy(() => import('./views/WorkspaceImage').then((module) => ({ default: module.WorkspaceImage })));
const WorkspaceVideo = lazy(() => import('./views/WorkspaceVideo').then((module) => ({ default: module.WorkspaceVideo })));
const WorkspaceEdit = lazy(() => import('./views/WorkspaceEdit').then((module) => ({ default: module.WorkspaceEdit })));
const WorkspacePromptImage = lazy(() => import('./views/WorkspacePromptImage').then((module) => ({ default: module.WorkspacePromptImage })));
const Gallery = lazy(() => import('./views/Gallery').then((module) => ({ default: module.Gallery })));
const PromptLibrary = lazy(() => import('./views/PromptLibrary').then((module) => ({ default: module.PromptLibrary })));
const TopUp = lazy(() => import('./views/TopUp').then((module) => ({ default: module.TopUp })));
const Settings = lazy(() => import('./views/Settings').then((module) => ({ default: module.Settings })));
const About = lazy(() => import('./views/About').then((module) => ({ default: module.About })));
const Support = lazy(() => import('./views/Support').then((module) => ({ default: module.Support })));
const Guide = lazy(() => import('./views/Guide').then((module) => ({ default: module.Guide })));
const AdminView = lazy(() => import('./views/Admin').then((module) => ({ default: module.AdminView })));
const PaymentGatewayView = lazy(() => import('./views/PaymentGateway').then((module) => ({ default: module.PaymentGatewayView })));

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

const getMobileRouteFeatureId = (pathname: string) => {
  if (pathname === '/generate/image') return 'single_photo_gen';
  if (pathname === '/generate/video') return 'video_ai_gen';
  if (pathname === '/tools/ai-image') return 'ai_image_tool';
  if (pathname === '/tools/edit') return 'magic_editor_pro';
  if (pathname === '/tools/remove-bg') return 'remove_bg_pro';
  if (pathname === '/tools/enhance') return 'sharpen_upscale';
  return null;
};

const getMobileTourScreen = (pathname: string) => {
  if (pathname === '/home') return 'home';
  if (pathname.startsWith('/generate/') || pathname.startsWith('/tools/')) return 'tool_workspace';
  if (pathname === '/gallery') return 'gallery';
  if (pathname === '/prompt-library') return 'prompt_library';
  if (pathname === '/topup') return 'topup';
  if (pathname === '/profile') return 'settings';
  return pathname.replace(/^\/+/, '') || 'home';
};

function FeatureMaintenanceGuard({ children }: { children: React.ReactElement }) {
  const location = useLocation();
  const { userRole } = useAuth();
  const [featureMaintenance, setFeatureMaintenance] = useState<FeatureMaintenanceConfig>({ disabledFeatureIds: [] });

  useEffect(() => {
    getFeatureMaintenanceConfig().then(setFeatureMaintenance).catch(() => {
      setFeatureMaintenance({ disabledFeatureIds: [] });
    });
  }, []);

  const featureId = getMobileRouteFeatureId(location.pathname);
  if (userRole !== 'admin' && isFeatureInMaintenance(featureMaintenance, featureId)) {
    return <Navigate to="/home" replace />;
  }

  return children;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const mobileUiVersion = useMobileUiVersion();
  const isMobileV2 = mobileUiVersion === 'v2';

  if (isLoading) {
    if (isMobileV2) {
      return (
        <div className="mobile-v2-shell v2-loading-screen">
          <div className="v2-loading-screen__universe" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <AuditionV2Logo />
          <div className="v2-loading-screen__bar"><span /></div>
          <p>Đang mở Creative Universe…</p>
        </div>
      );
    }
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
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Đang tải trang">
        <Loader className="w-7 h-7 animate-spin text-fuchsia-500" />
      </div>
    }>
      <Routes>
      <Route element={<MobileV2Layout />}>
        <Route path="/mobile-v2-preview" element={<MobileV2Preview />} />
      </Route>
      {!isAuthenticated ? (
        isMobileV2 ? (
          <Route element={<MobileV2Layout />}>
            <Route path="/" element={<AuthV2 />} />
            <Route path="*" element={<Navigate to={`/${location.search}`} replace />} />
          </Route>
        ) : (
          <>
            <Route path="/" element={<Splash />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )
      ) : (
        <>
          <Route element={isMobileV2 ? <MobileV2Layout /> : <MobileLayout />}>
            <Route path="/home" element={isMobileV2 ? <HomeV2 /> : <Home />} />
            {isMobileV2 && <Route path="/tools-hub" element={<ToolsHubV2 />} />}
            {isMobileV2 && <Route path="/tools-hub/:category" element={<ToolsHubV2 />} />}
            <Route path="/generate/image" element={<FeatureMaintenanceGuard>{isMobileV2 ? <ImageStudioV2 /> : <WorkspaceImage />}</FeatureMaintenanceGuard>} />
            <Route path="/generate/video" element={<FeatureMaintenanceGuard>{isMobileV2 ? <VideoStudioV2 /> : <WorkspaceVideo />}</FeatureMaintenanceGuard>} />
            <Route path="/tools/ai-image" element={<FeatureMaintenanceGuard>{isMobileV2 ? <PromptImageStudioV2 /> : <WorkspacePromptImage />}</FeatureMaintenanceGuard>} />
            <Route path="/tools/:toolId" element={<FeatureMaintenanceGuard>{isMobileV2 ? <EditStudioV2 /> : <WorkspaceEdit />}</FeatureMaintenanceGuard>} />
            <Route path="/gallery" element={isMobileV2 ? <GalleryV2 /> : <Gallery />} />
            <Route path="/prompt-library" element={isMobileV2 ? <PromptLibraryV2 /> : <PromptLibrary />} />
            <Route path="/topup" element={isMobileV2 ? <TopUpV2 /> : <TopUp />} />
            <Route path="/payment-gateway" element={isMobileV2 ? <PaymentGatewayV2 /> : <PaymentGatewayView />} />
            <Route path="/profile" element={isMobileV2 ? <ProfileV2 /> : <Settings />} />
            <Route path="/about" element={isMobileV2 ? <AboutV2 /> : <About />} />
            <Route path="/support" element={isMobileV2 ? <SupportV2 /> : <Support />} />
            <Route path="/guide" element={isMobileV2 ? <GuideV2 /> : <Guide />} />
            <Route path="/admin" element={isMobileV2 ? <AdminV2 /> : <AdminView />} />
          </Route>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </>
      )}
      </Routes>
    </Suspense>
  );
}

function MobileRuntimeEffects() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { isAuthenticated, maintenanceMode, userRole, user, logout } = useAuth();

  const handledPaymentReturnRef = useRef<string | null>(null);
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
    trackEvent('payment_return_success', {
      amount_vnd: meta?.amount,
      vcoin: meta?.vcoin,
      payment_method: 'sepay',
    });
    trackEvent('purchase', {
      transaction_id: orderCode,
      value: meta?.amount,
      currency: 'VND',
      item_name: meta?.packageName,
    });
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
    if (!isAuthenticated) return;
    trackPageView(`${location.pathname}${location.search}`);
  }, [isAuthenticated, location.pathname, location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    const orderCode = params.get('orderCode');
    const gateway = params.get('gateway');

    if (!status) return;

    const returnKey = `${status}:${orderCode || ''}`;
    if (handledPaymentReturnRef.current === returnKey) return;
    handledPaymentReturnRef.current = returnKey;

    const handleReturn = async () => {
      if (status === 'PAID') {
        if (orderCode) {
          try {
            const result = await syncPaymentTransaction(orderCode, gateway);
            if (result?.settled === false) {
              notify('Thanh toán đã ghi nhận. Hệ thống đang đối soát ngân hàng và sẽ tự cộng Vcoin sau khi khớp giao dịch.', 'info');
            } else {
              window.dispatchEvent(new Event('balance_updated'));
              showPaymentSuccessPopup(orderCode);
              notify('Thanh toán thành công! Vcoin đã được cộng tự động.', 'success');
            }
          } catch (error) {
            console.error('Failed to sync payment transaction on mobile return:', error);
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
        trackEvent('payment_return_cancelled', { payment_method: gateway || 'sepay' });
        if (orderCode) {
          try {
            const result = await syncPaymentTransaction(orderCode, gateway);
            if (result?.settled === false) {
              notify('SePay đã đóng phiên thanh toán. Nếu bạn đã chuyển khoản, hệ thống đang tự đối soát và sẽ cộng Vcoin khi khớp giao dịch.', 'info');
            } else {
              window.dispatchEvent(new Event('balance_updated'));
              showPaymentSuccessPopup(orderCode);
              notify('Thanh toán đã được đối soát thành công! Vcoin đã được cộng tự động.', 'success');
            }
          } catch (error) {
            console.error('Failed to reconcile cancelled mobile payment return:', error);
            notify('SePay đã đóng phiên thanh toán. Nếu bạn đã chuyển khoản, hệ thống sẽ tiếp tục tự đối soát.', 'info');
          }
        } else {
          notify('SePay đã đóng phiên thanh toán. Nếu bạn đã chuyển khoản, hệ thống sẽ tiếp tục tự đối soát.', 'info');
        }
        navigate('/topup', { replace: true });
        return;
      }

      navigate(location.pathname, { replace: true });
    };

    void handleReturn();
  }, [location.pathname, location.search, navigate, notify, showPaymentSuccessPopup]);

  if (!isAuthenticated) {
    return null;
  }

  const isAccountLocked = user?.accountStatus === 'locked';
  const accountWarning = user?.accountWarning?.trim();
  const lockedAtText = user?.lockedAt
    ? new Date(user.lockedAt).toLocaleString('vi-VN', {
        hour12: false,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

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
      <AppTour
        surface="mobile"
        screen={getMobileTourScreen(location.pathname)}
        featureId={getMobileRouteFeatureId(location.pathname)}
        disabled={!isAuthenticated || location.pathname === '/admin' || location.pathname === '/'}
      />
      {accountWarning && !isAccountLocked && (
        <div className="fixed left-4 right-4 top-4 z-[110] rounded-[24px] border border-amber-300/40 bg-amber-50/95 p-4 shadow-2xl backdrop-blur dark:border-amber-400/20 dark:bg-amber-500/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <div className="text-sm font-black text-gray-900 dark:text-white">Cảnh báo tài khoản</div>
              <div className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-100">{accountWarning}</div>
            </div>
          </div>
        </div>
      )}
      {isAccountLocked && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-5 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[32px] border border-red-500/20 bg-white p-6 text-center shadow-2xl animate-slide-up dark:bg-[#18181B]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
              <Lock className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Tài khoản đã bị khóa</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-zinc-400">
              Tài khoản này đang bị tạm khóa do hệ thống phát hiện dấu hiệu vi phạm hoặc lạm dụng tính năng.
            </p>
            <div className="mt-5 space-y-3 rounded-[24px] bg-gray-50 p-4 text-left text-sm dark:bg-zinc-900">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-zinc-500">Lý do</div>
                <div className="mt-1 text-gray-900 dark:text-white">{user?.lockReason || 'Vi phạm quy định sử dụng hệ thống.'}</div>
              </div>
              {lockedAtText && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-zinc-500">Thời gian khóa</div>
                  <div className="mt-1 text-gray-900 dark:text-white">{lockedAtText}</div>
                </div>
              )}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-zinc-500">Tài khoản</div>
                <div className="mt-1 break-all text-gray-900 dark:text-white">{user?.email}</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3">
              <a href="mailto:support@auditionai.vn?subject=Yeu cau mo khoa tai khoan AUDITION AI" className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-bold text-white dark:bg-white dark:text-black">
                Liên hệ hỗ trợ
              </a>
              <button onClick={() => void logout()} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white">
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
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
