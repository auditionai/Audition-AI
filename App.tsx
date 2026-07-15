
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Layout } from './components/Layout';
import { Home } from './views/Home';
import { Settings } from './views/Settings';
import { About } from './views/About';
import { Guide } from './views/Guide';
import { Support } from './views/Support';
import { PromptLibrary } from './views/PromptLibrary';
import { Landing } from './views/Landing';
import { TopUp } from './views/TopUp';
import { ManualPaymentGateway } from './views/ManualPaymentGateway'; 
import { Language, Theme, ViewId, Feature } from './types';
import { APP_CONFIG } from './constants';
import { getSupabaseSession, getSupabaseUser, supabase } from './services/supabaseClient';
import { getUserProfile, getTopupGiftcodes, logVisit, updateLastActive, subscribeMaintenanceMode, getSystemAnnouncementConfig, getFeatureMaintenanceConfig, isFeatureInMaintenance, type FeatureMaintenanceConfig, type SystemAnnouncementConfig } from './services/economyService';
import { NotificationProvider, useNotification } from './components/NotificationSystem';
import { AppEventPopup, AppEventPopupData, SystemAnnouncementModal } from './components/AppNotificationPopups';
import { AppTour } from './components/AppTour';
import { Icons } from './components/Icons';
import { syncPaymentTransaction } from './services/serverQueueService';
import { setAnalyticsUser, trackEvent, trackPageView } from './services/analyticsService';

const ToolWorkspace = lazy(() => import('./views/ToolWorkspace').then((module) => ({ default: module.ToolWorkspace })));
const Admin = lazy(() => import('./views/Admin').then((module) => ({ default: module.Admin })));
const Gallery = lazy(() => import('./views/Gallery').then((module) => ({ default: module.Gallery })));
const MobileApp = lazy(() => import('./mobile-app/src/App'));

const AppLoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-[#05050A]">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-audi-cyan" />
  </div>
);

const PHONE_USER_AGENT_PATTERN = /iphone|ipod|android.+mobile|windows phone|blackberry|opera mini|mobile safari/i;
const SHELL_OVERRIDE_STORAGE_KEY = 'auditionai:shell-override';
const LEGACY_SHELL_PREFERENCE_STORAGE_KEY = 'auditionai:shell-preference';
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
    // Ignore storage failures; the modal can still be closed for this render.
  }
};

const clearLegacyShellPreference = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LEGACY_SHELL_PREFERENCE_STORAGE_KEY);
};

const readShellOverride = () => {
  if (typeof window === 'undefined') return null;
  const saved = window.localStorage.getItem(SHELL_OVERRIDE_STORAGE_KEY);
  return saved === 'mobile' || saved === 'desktop' ? saved : null;
};

const writeShellOverride = (value: 'mobile' | 'desktop') => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SHELL_OVERRIDE_STORAGE_KEY, value);
  clearLegacyShellPreference();
};

const detectPhoneBrowserShell = () => {
  const navigatorWithUAData = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (typeof navigatorWithUAData.userAgentData?.mobile === 'boolean') {
    return navigatorWithUAData.userAgentData.mobile;
  }

  return PHONE_USER_AGENT_PATTERN.test(navigator.userAgent.toLowerCase());
};

const shouldUseMobileShell = () => {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get('desktop') === '1') {
    writeShellOverride('desktop');
    return false;
  }
  if (params.get('mobile') === '1') {
    writeShellOverride('mobile');
    return true;
  }

  clearLegacyShellPreference();
  const savedOverride = readShellOverride();
  if (savedOverride === 'mobile') return true;
  if (savedOverride === 'desktop') return false;

  return detectPhoneBrowserShell();
};

const DEFAULT_IMAGE_FEATURE = APP_CONFIG.main_features.find((feature) => feature.toolType === 'generation') || APP_CONFIG.main_features[0] || null;
const DEFAULT_VIDEO_FEATURE = APP_CONFIG.main_features.find((feature) => feature.id === 'video_ai_gen' || feature.toolType === 'video') || DEFAULT_IMAGE_FEATURE;
const DEFAULT_EDIT_FEATURE = APP_CONFIG.main_features.find((feature) => feature.toolType === 'editing') || DEFAULT_IMAGE_FEATURE;

const findFeatureById = (featureId?: string | null) => {
  if (!featureId) return null;
  return APP_CONFIG.main_features.find((feature) => feature.id === featureId) || null;
};

const normalizeDesktopPathname = (pathname: string) => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
};

const resolveDesktopRoute = () => {
  if (typeof window === 'undefined') {
    return { view: 'home' as ViewId, feature: DEFAULT_IMAGE_FEATURE };
  }

  const pathname = normalizeDesktopPathname(window.location.pathname);
  const params = new URLSearchParams(window.location.search);

  if (pathname === '/' || pathname === '/home') return { view: 'home' as ViewId, feature: null };
  if (pathname === '/admin') return { view: 'admin' as ViewId, feature: null };
  if (pathname === '/profile') return { view: 'settings' as ViewId, feature: null };
  if (pathname === '/guide') return { view: 'guide' as ViewId, feature: null };
  if (pathname === '/about') return { view: 'about' as ViewId, feature: null };
  if (pathname === '/support') return { view: 'support' as ViewId, feature: null };
  if (pathname === '/gallery') return { view: 'gallery' as ViewId, feature: null };
  if (pathname === '/prompt-library') return { view: 'prompt_library' as ViewId, feature: null };
  if (pathname === '/topup') return { view: 'topup' as ViewId, feature: null };
  if (pathname === '/payment-gateway') return { view: 'payment_gateway' as ViewId, feature: null };
  if (pathname === '/generate/image') {
    return { view: 'tool_workspace' as ViewId, feature: findFeatureById(params.get('tool')) || DEFAULT_IMAGE_FEATURE };
  }
  if (pathname === '/generate/video') {
    return { view: 'tool_workspace' as ViewId, feature: findFeatureById(params.get('tool')) || DEFAULT_VIDEO_FEATURE };
  }
  if (pathname === '/tools') {
    return { view: 'tool_workspace' as ViewId, feature: DEFAULT_EDIT_FEATURE };
  }

  const toolMatch = pathname.match(/^\/tools\/([^/]+)$/);
  if (toolMatch) {
    return { view: 'tool_workspace' as ViewId, feature: findFeatureById(decodeURIComponent(toolMatch[1])) || DEFAULT_EDIT_FEATURE };
  }

  return { view: 'home' as ViewId, feature: null };
};

const buildDesktopPath = (view: ViewId, selectedFeature: Feature | null) => {
  if (view === 'tool_workspace') {
    const feature = selectedFeature || DEFAULT_IMAGE_FEATURE;
    if (!feature) return '/home';

    if (feature.toolType === 'video') {
      return feature.id === DEFAULT_VIDEO_FEATURE?.id ? '/generate/video' : `/generate/video?tool=${encodeURIComponent(feature.id)}`;
    }

    if (feature.toolType === 'editing') {
      return `/tools/${encodeURIComponent(feature.id)}`;
    }

    return feature.id === DEFAULT_IMAGE_FEATURE?.id ? '/generate/image' : `/generate/image?tool=${encodeURIComponent(feature.id)}`;
  }

  switch (view) {
    case 'admin':
      return '/admin';
    case 'settings':
      return '/profile';
    case 'guide':
      return '/guide';
    case 'about':
      return '/about';
    case 'support':
      return '/support';
    case 'gallery':
      return '/gallery';
    case 'prompt_library':
      return '/prompt-library';
    case 'topup':
      return '/topup';
    case 'payment_gateway':
      return '/payment-gateway';
    case 'home':
    default:
      return '/home';
  }
};

function AppContent() {
  const desktopHistoryModeRef = useRef<'replace' | 'push'>('replace');
  const notifiedTerminalJobsRef = useRef<Set<string>>(new Set());
  const warmedUserDataRef = useRef<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const [lang, setLang] = useState<Language>(APP_CONFIG.ui.default_language);
  const [theme, setTheme] = useState<Theme>('light');
  const [currentView, setCurrentView] = useState<ViewId>('home');
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  
  // State for Payment Flow
  const [pendingTransaction, setPendingTransaction] = useState<any>(null);

  // Daily check-in modal state
  const [showCheckin, setShowCheckin] = useState(false);

  // Maintenance Mode State
  const [maintenanceMode, setMaintenanceMode] = useState({ isActive: false, message: "" });
  const [featureMaintenance, setFeatureMaintenance] = useState<FeatureMaintenanceConfig>({ disabledFeatureIds: [] });
  const [systemAnnouncement, setSystemAnnouncement] = useState<SystemAnnouncementConfig | null>(null);
  const [showSystemAnnouncement, setShowSystemAnnouncement] = useState(false);
  const [eventPopup, setEventPopup] = useState<AppEventPopupData | null>(null);

  // Custom Notification Hook
  const { notify } = useNotification();

  const readPendingPaymentMeta = useCallback((orderCode?: string | null) => {
    if (!orderCode || typeof window === 'undefined') return null;
    try {
      const storageKey = `auditionai:pending-payment:${orderCode}`;
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return null;
      window.sessionStorage.removeItem(storageKey);
      return JSON.parse(raw) as { amount?: number; vcoin?: number; packageName?: string };
    } catch (error) {
      console.warn('Failed to read pending payment metadata', error);
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

  const warmupAuthenticatedData = useCallback((userId: string) => {
    if (!userId || warmedUserDataRef.current === userId) return;
    warmedUserDataRef.current = userId;

    // Keep startup light. Top-up giftcodes are loaded only when the user opens
    // the top-up flow, because the authenticated API can be slow during DB load.
  }, []);

  const applyDesktopRouteFromLocation = useCallback(() => {
    const resolved = resolveDesktopRoute();
    setCurrentView(resolved.view);
    if (resolved.feature) {
      setSelectedFeature(resolved.feature);
    }
  }, []);

  useEffect(() => {
    // Initial theme setup
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }

    // Log Visit (Tracks every reload)
    logVisit();
    updateLastActive();
    getSystemAnnouncementConfig().then((config) => {
        setSystemAnnouncement(config);
        setShowSystemAnnouncement(shouldShowSystemAnnouncement(config));
    });
    getFeatureMaintenanceConfig().then(setFeatureMaintenance);

    // Update last active every 5 minutes
    const activeInterval = setInterval(() => {
        updateLastActive();
    }, 5 * 60 * 1000);

    // Update on visibility change (tab switch/mobile app switch)
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            updateLastActive();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check for existing session on load
    if (supabase) {
        const unsubscribeMaintenanceMode = subscribeMaintenanceMode(setMaintenanceMode);

        getSupabaseSession().then((session: any) => {
            if (session) {
                setIsAuthenticated(true);
                setAnalyticsUser(session.user.id);
                if (resolveDesktopRoute().view === 'admin') {
                    checkAdminRole(session.user.id);
                }
                warmupAuthenticatedData(session.user.id);
            }
        });

        // Listen for auth changes (login/logout/oauth redirect)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
            if (session) {
                setIsAuthenticated(true);
                setAnalyticsUser(session.user.id);
                if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    if (event === 'SIGNED_IN') {
                        trackEvent('login', { method: 'supabase' });
                    }
                    if (resolveDesktopRoute().view === 'admin') {
                        checkAdminRole(session.user.id);
                    }
                    warmupAuthenticatedData(session.user.id);
                    updateLastActive();
                }
            } else {
                setAnalyticsUser(null);
                warmedUserDataRef.current = null;
                if (event === 'SIGNED_OUT') {
                    trackEvent('logout');
                }
                setIsAuthenticated(false);
            }
        });

        return () => {
            subscription.unsubscribe();
            unsubscribeMaintenanceMode();
            clearInterval(activeInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }
  }, []);

  // --- HANDLE PAYMENT RETURN ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const orderCode = params.get('orderCode');
    const gateway = params.get('gateway');

    if (status) {
        window.history.replaceState({}, '', window.location.pathname);

        if (status === 'PAID') {
             desktopHistoryModeRef.current = 'replace';
             if (orderCode) {
                 syncPaymentTransaction(orderCode, gateway)
                    .then((result) => {
                        if (result?.settled === false) {
                            notify(
                                lang === 'vi' ? 'Thanh toán đã ghi nhận. Hệ thống đang đối soát ngân hàng và sẽ tự cộng Vcoin sau khi khớp giao dịch.' : 'Payment recorded. The system is reconciling the bank transaction.',
                                'info'
                            );
                        } else {
                            window.dispatchEvent(new Event('balance_updated'));
                            showPaymentSuccessPopup(orderCode);
                            notify(
                                lang === 'vi' ? 'Thanh to\u00e1n th\u00e0nh c\u00f4ng! Vcoin \u0111\u00e3 \u0111\u01b0\u1ee3c c\u1ed9ng t\u1ef1 \u0111\u1ed9ng.' : 'Payment successful! Vcoin has been added automatically.',
                                'success'
                            );
                        }
                    })
                    .catch((error) => {
                        console.error('Failed to sync payment transaction on return:', error);
                        notify(
                            lang === 'vi' ? 'Thanh to\u00e1n \u0111\u00e3 ghi nh\u1eadn. H\u1ec7 th\u1ed1ng \u0111ang \u0111\u1ed3ng b\u1ed9 giao d\u1ecbch...' : 'Payment recorded. Syncing transaction...',
                            'info'
                        );
                    });
             } else {
                 showPaymentSuccessPopup(orderCode);
                 notify(
                     lang === 'vi' ? 'Thanh to\u00e1n th\u00e0nh c\u00f4ng! Vcoin s\u1ebd \u0111\u01b0\u1ee3c c\u1ed9ng trong gi\u00e2y l\u00e1t.' : 'Payment successful! Vcoin will be added shortly.',
                     'success'
                 );
             }
             setCurrentView('topup');
        } else if (status === 'CANCELLED') {
             desktopHistoryModeRef.current = 'replace';
             trackEvent('payment_return_cancelled', { payment_method: gateway || 'sepay' });
             if (orderCode) {
                 syncPaymentTransaction(orderCode, gateway)
                    .then((result) => {
                        if (result?.settled === false) {
                            notify(
                                lang === 'vi' ? 'SePay đã đóng phiên thanh toán. Nếu bạn đã chuyển khoản, hệ thống đang tự đối soát và sẽ cộng Vcoin khi khớp giao dịch.' : 'SePay closed the payment session. If you transferred money, reconciliation will continue automatically.',
                                'info'
                            );
                        } else {
                            window.dispatchEvent(new Event('balance_updated'));
                            showPaymentSuccessPopup(orderCode);
                            notify(
                                lang === 'vi' ? 'Thanh toán đã được đối soát thành công! Vcoin đã được cộng tự động.' : 'Payment reconciled successfully. Vcoin has been added automatically.',
                                'success'
                            );
                        }
                    })
                    .catch((error) => {
                        console.error('Failed to reconcile cancelled payment return:', error);
                        notify(
                            lang === 'vi' ? 'SePay đã đóng phiên thanh toán. Nếu bạn đã chuyển khoản, hệ thống sẽ tiếp tục tự đối soát.' : 'SePay closed the payment session. If you transferred money, reconciliation will continue automatically.',
                            'info'
                        );
                    });
             } else {
                 notify(
                     lang === 'vi' ? 'SePay đã đóng phiên thanh toán. Nếu bạn đã chuyển khoản, hệ thống sẽ tiếp tục tự đối soát.' : 'SePay closed the payment session. If you transferred money, reconciliation will continue automatically.',
                     'info'
                 );
             }
             setCurrentView('topup');
        }
    }
  }, [lang, notify, showPaymentSuccessPopup]);

  useEffect(() => {
    if (!isAuthenticated) return;

    applyDesktopRouteFromLocation();
    const handlePopState = () => {
      desktopHistoryModeRef.current = 'replace';
      applyDesktopRouteFromLocation();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [applyDesktopRouteFromLocation, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !supabase) return;

    let isDisposed = false;
    let channel: any = null;

    getSupabaseUser().then((authUser: any) => {
      if (isDisposed || !authUser?.id) return;

      channel = supabase
        .channel(`app-terminal-events:${authUser.id}:${Date.now()}`)
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
              trackEvent('generation_job_completed', {
                asset_type: row.asset_type || 'unknown',
                tool_id: row.tool_id,
              });
              setEventPopup({
                type: 'generation_success',
                title: `${assetLabel} đã tạo thành công`,
                message: `${assetLabel} của bạn đã tạo thành công bởi AUDITION AI.`,
                actionLabel: 'Xem kết quả',
              });
              return;
            }

            trackEvent('generation_job_failed', {
              asset_type: row.asset_type || 'unknown',
              tool_id: row.tool_id,
              error_message: row.error_message ? String(row.error_message).slice(0, 120) : 'unknown',
            });
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
            console.warn('[App] Realtime terminal event subscription failed.');
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

  useEffect(() => {
    if (!isAuthenticated) return;

    const targetPath = buildDesktopPath(currentView, selectedFeature);
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath === targetPath) return;

    if (desktopHistoryModeRef.current === 'push') {
      window.history.pushState({}, '', targetPath);
    } else {
      window.history.replaceState({}, '', targetPath);
    }
    desktopHistoryModeRef.current = 'replace';
  }, [currentView, isAuthenticated, selectedFeature]);

  useEffect(() => {
    if (!isAuthenticated) return;
    trackPageView(buildDesktopPath(currentView, selectedFeature));
  }, [currentView, isAuthenticated, selectedFeature]);

  useEffect(() => {
    if (!isAuthenticated || userRole === 'admin' || currentView !== 'tool_workspace' || !selectedFeature) return;
    if (!isFeatureInMaintenance(featureMaintenance, selectedFeature.id)) return;

    notify(featureMaintenance.message || 'Tính năng đang bảo trì. Vui lòng quay lại sau.', 'warning');
    desktopHistoryModeRef.current = 'replace';
    setCurrentView('home');
  }, [currentView, featureMaintenance, isAuthenticated, notify, selectedFeature, userRole]);

  const checkAdminRole = async (userId: string) => {
      if (!supabase) return;
      
      try {
          const user = await getSupabaseUser();
          const profile = await getUserProfile();

          if (user?.email === 'khoknightyb97@gmail.com' || (profile?.id === userId && profile?.role === 'admin')) {
              console.log("Admin privileges granted.");
              setUserRole('admin');
          } else {
              setUserRole('user');
          }
      } catch (e) {
          console.error("Error checking admin role:", e);
      }
  };

  const handleLogin = () => {
    desktopHistoryModeRef.current = 'replace';
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
      if (supabase) {
          await supabase.auth.signOut();
      }
      setAnalyticsUser(null);
      warmedUserDataRef.current = null;
      desktopHistoryModeRef.current = 'replace';
      setIsAuthenticated(false);
      setCurrentView('home');
      setUserRole('user'); // Reset role
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/');
      }
  };

  const handleNavigate = (view: ViewId, data?: any) => {
    desktopHistoryModeRef.current = 'push';
    if (view === 'tools') {
      if (!selectedFeature) {
        setSelectedFeature(DEFAULT_IMAGE_FEATURE || APP_CONFIG.main_features[0]);
      }
      setCurrentView('tool_workspace');
      return;
    }

    setCurrentView(view);
    if (view === 'payment_gateway' && data?.transaction) {
        setPendingTransaction(data.transaction);
    }
  };

  const handleSelectFeature = (feature: Feature) => {
    if (maintenanceMode.isActive && userRole !== 'admin') {
        notify(maintenanceMode.message, 'warning');
        return;
    }
    if (userRole !== 'admin' && isFeatureInMaintenance(featureMaintenance, feature.id)) {
        notify(featureMaintenance.message || 'Tính năng đang bảo trì. Vui lòng quay lại sau.', 'warning');
        return;
    }
    desktopHistoryModeRef.current = 'push';
    setSelectedFeature(feature);
    setCurrentView('tool_workspace');
  };

  const handleNavigateToFeature = (featureId: string) => {
    const feature = APP_CONFIG.main_features.find(f => f.id === featureId);
    if (feature) {
      handleSelectFeature(feature);
    }
  };

  const handleUsePromptLibraryPrompt = () => {
    desktopHistoryModeRef.current = 'push';
    setSelectedFeature(DEFAULT_IMAGE_FEATURE || APP_CONFIG.main_features[0] || null);
    setCurrentView('tool_workspace');
  };

  // View Routing Logic
  const renderContent = () => {
    switch (currentView) {
      case 'home':
        return <Home lang={lang} onSelectFeature={handleSelectFeature} onNavigate={handleNavigate} onOpenCheckin={() => setShowCheckin(true)} isMaintenance={maintenanceMode.isActive && userRole !== 'admin'} maintenanceMessage={maintenanceMode.message} featureMaintenance={userRole !== 'admin' ? featureMaintenance : undefined} />;
      case 'admin':
        return <Admin lang={lang} isAdmin={userRole === 'admin'} />;
      case 'settings':
        return <Settings lang={lang} onLogout={handleLogout} onNavigate={handleNavigate} isAdmin={userRole === 'admin'} />;
      case 'guide':
        return <Guide lang={lang} />;
      case 'about':
        return <About lang={lang} />;
      case 'support':
        return <Support lang={lang} onNavigate={handleNavigate} />;
      case 'gallery':
        return <Gallery lang={lang} />;
      case 'prompt_library':
        return <PromptLibrary onUsePrompt={handleUsePromptLibraryPrompt} />;
      case 'topup':
        return <TopUp lang={lang} onNavigate={handleNavigate} />;
      case 'payment_gateway':
        return pendingTransaction ? (
            <ManualPaymentGateway 
                transaction={pendingTransaction} 
                onSuccess={() => {
                    notify('Giao dịch đã được ghi nhận! Vui lòng chờ Admin duyệt.', 'info');
                    handleNavigate('topup');
                }}
                onCancel={() => handleNavigate('topup')}
            />
        ) : <TopUp lang={lang} onNavigate={handleNavigate} />;
      default:
        return null;
    }
  };

  if (!isAuthenticated) {
    return <Landing onEnter={handleLogin} />;
  }

  return (
    <Layout
      currentView={currentView}
      onNavigate={handleNavigate}
      lang={lang}
      setLang={setLang}
      theme={theme}
      setTheme={setTheme}
      showCheckin={showCheckin}
      setShowCheckin={setShowCheckin}
      onLogout={handleLogout}
    >
      <SystemAnnouncementModal
        config={showSystemAnnouncement ? systemAnnouncement : null}
        mode="desktop"
        onClose={() => {
          dismissSystemAnnouncementForTwelveHours(systemAnnouncement);
          setShowSystemAnnouncement(false);
        }}
      />
      <AppEventPopup
        data={eventPopup}
        mode="desktop"
        onClose={() => setEventPopup(null)}
        onAction={() => {
          setEventPopup(null);
          handleNavigate(eventPopup?.type === 'payment_success' ? 'topup' : 'gallery');
        }}
      />
      {/* Maintenance Modal Overlay */}
      {maintenanceMode.isActive && userRole !== 'admin' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-[#12121a] border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl animate-fade-in">
                  <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Icons.AlertTriangle className="w-10 h-10 text-red-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-4">Hệ Thống Đang Bảo Trì</h2>
                  <p className="text-slate-400 leading-relaxed mb-8">
                      {maintenanceMode.message || "Hệ thống đang bảo trì, vui lòng quay lại sau."}
                  </p>
                  <button 
                      onClick={() => window.location.reload()}
                      className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition-colors w-full"
                  >
                      Tải lại trang
                  </button>
              </div>
          </div>
      )}
      
      {/* Tool Workspace - Kept mounted to preserve state */}
      <div style={{ display: currentView === 'tool_workspace' ? 'block' : 'none', height: '100%' }}>
        {selectedFeature && userRole !== 'admin' && isFeatureInMaintenance(featureMaintenance, selectedFeature.id) ? (
          <Home lang={lang} onSelectFeature={handleSelectFeature} onNavigate={handleNavigate} onOpenCheckin={() => setShowCheckin(true)} isMaintenance={false} featureMaintenance={featureMaintenance} />
        ) : selectedFeature ? (
          <ToolWorkspace 
            feature={selectedFeature} 
            lang={lang} 
            onBack={() => handleNavigate('home')} 
            onNavigateToFeature={handleNavigateToFeature}
            onNavigateView={handleNavigate}
          />
        ) : (
          currentView === 'tool_workspace' && <Home lang={lang} onSelectFeature={handleSelectFeature} onNavigate={handleNavigate} onOpenCheckin={() => setShowCheckin(true)} isMaintenance={maintenanceMode.isActive && userRole !== 'admin'} maintenanceMessage={maintenanceMode.message} featureMaintenance={userRole !== 'admin' ? featureMaintenance : undefined} />
        )}
      </div>

      {currentView !== 'tool_workspace' && renderContent()}
      <AppTour
        surface="desktop"
        screen={currentView}
        featureId={currentView === 'tool_workspace' ? selectedFeature?.id : undefined}
        disabled={!isAuthenticated || currentView === 'admin'}
      />
    </Layout>
  );
}

function DesktopApp() {
    return (
        <NotificationProvider>
            <AppContent />
        </NotificationProvider>
    );
}

export default function App() {
    const [useMobileShell, setUseMobileShell] = useState(() => shouldUseMobileShell());

    useEffect(() => {
        const refreshShellMode = () => {
            setUseMobileShell(shouldUseMobileShell());
        };

        refreshShellMode();
        window.addEventListener('popstate', refreshShellMode);
        window.addEventListener('resize', refreshShellMode);

        return () => {
            window.removeEventListener('popstate', refreshShellMode);
            window.removeEventListener('resize', refreshShellMode);
        };
    }, []);

    return (
      <Suspense fallback={<AppLoadingFallback />}>
        {useMobileShell ? <MobileApp /> : <DesktopApp />}
      </Suspense>
    );
}
