
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layout } from './components/Layout';
import { Home } from './views/Home';
import { ToolWorkspace } from './views/ToolWorkspace';
import { Admin } from './views/Admin';
import { Settings } from './views/Settings';
import { About } from './views/About';
import { Guide } from './views/Guide';
import { Support } from './views/Support';
import { Gallery } from './views/Gallery';
import { Landing } from './views/Landing';
import { TopUp } from './views/TopUp';
import { PayOSGateway } from './views/PayOSGateway'; 
import { Language, Theme, ViewId, Feature } from './types';
import { APP_CONFIG } from './constants';
import { getSupabaseSession, getSupabaseUser, supabase } from './services/supabaseClient';
import { getUserProfile, logVisit, updateLastActive, getMaintenanceMode } from './services/economyService';
import { NotificationProvider, useNotification } from './components/NotificationSystem';
import { Icons } from './components/Icons';
import { syncPayOSTransaction, triggerServerQueueTick } from './services/serverQueueService';
import MobileApp from './mobile-app/src/App';

const PHONE_USER_AGENT_PATTERN = /iphone|ipod|android.+mobile|windows phone|blackberry|opera mini|mobile safari/i;
const SHELL_PREFERENCE_STORAGE_KEY = 'auditionai:shell-preference';

const shouldUseMobileShell = () => {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get('desktop') === '1') {
    window.localStorage.setItem(SHELL_PREFERENCE_STORAGE_KEY, 'desktop');
    return false;
  }
  if (params.get('mobile') === '1') {
    window.localStorage.setItem(SHELL_PREFERENCE_STORAGE_KEY, 'mobile');
    return true;
  }

  const savedPreference = window.localStorage.getItem(SHELL_PREFERENCE_STORAGE_KEY);
  if (savedPreference === 'mobile') return true;
  if (savedPreference === 'desktop') return false;

  const navigatorWithUAData = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (typeof navigatorWithUAData.userAgentData?.mobile === 'boolean') {
    if (navigatorWithUAData.userAgentData.mobile) {
      window.localStorage.setItem(SHELL_PREFERENCE_STORAGE_KEY, 'mobile');
      return true;
    }
    return false;
  }

  const isPhoneBrowser = PHONE_USER_AGENT_PATTERN.test(navigator.userAgent.toLowerCase());
  if (isPhoneBrowser) {
    window.localStorage.setItem(SHELL_PREFERENCE_STORAGE_KEY, 'mobile');
  }
  return isPhoneBrowser;
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
  const queueHeartbeatLeaseKey = 'auditionai:queue-heartbeat:leader';
  const queueHeartbeatIntervalMs = 30000;
  const queueHeartbeatLeaseMs = 35000;
  const heartbeatInstanceIdRef = useRef(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `tab-${Date.now()}`);
  const desktopHistoryModeRef = useRef<'replace' | 'push'>('replace');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const [lang, setLang] = useState<Language>(APP_CONFIG.ui.default_language);
  const [theme, setTheme] = useState<Theme>('light');
  const [currentView, setCurrentView] = useState<ViewId>('home');
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  
  // State for Payment Flow
  const [pendingTransaction, setPendingTransaction] = useState<any>(null);

  // Lifted state for Daily Checkin Modal
  const [showCheckin, setShowCheckin] = useState(false);

  // Maintenance Mode State
  const [maintenanceMode, setMaintenanceMode] = useState({ isActive: false, message: "" });

  // Custom Notification Hook
  const { notify } = useNotification();

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
        // Fetch Maintenance Mode periodically
        const fetchMaintenance = () => {
            getMaintenanceMode().then(res => {
                setMaintenanceMode(res);
            });
        };
        fetchMaintenance();
        const maintenanceInterval = setInterval(fetchMaintenance, 300000); // Check every 5 minutes

        getSupabaseSession().then((session: any) => {
            if (session) {
                setIsAuthenticated(true);
                checkAdminRole(session.user.id);
            }
        });

        // Listen for auth changes (login/logout/oauth redirect)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
            if (session) {
                setIsAuthenticated(true);
                if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    checkAdminRole(session.user.id);
                    updateLastActive();
                }
            } else {
                setIsAuthenticated(false);
            }
        });

        return () => {
            subscription.unsubscribe();
            clearInterval(activeInterval);
            clearInterval(maintenanceInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }
  }, []);

  // --- HANDLE PAYOS RETURN ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const orderCode = params.get('orderCode');

    if (status) {
        window.history.replaceState({}, '', window.location.pathname);

        if (status === 'PAID') {
             desktopHistoryModeRef.current = 'replace';
             if (orderCode) {
                 syncPayOSTransaction(orderCode)
                    .then(() => {
                        window.dispatchEvent(new Event('balance_updated'));
                        notify(
                            lang === 'vi' ? 'Thanh to\u00e1n th\u00e0nh c\u00f4ng! Vcoin \u0111\u00e3 \u0111\u01b0\u1ee3c c\u1ed9ng t\u1ef1 \u0111\u1ed9ng.' : 'Payment successful! Vcoin has been added automatically.',
                            'success'
                        );
                    })
                    .catch((error) => {
                        console.error('Failed to sync PayOS transaction on return:', error);
                        notify(
                            lang === 'vi' ? 'Thanh to\u00e1n \u0111\u00e3 ghi nh\u1eadn. H\u1ec7 th\u1ed1ng \u0111ang \u0111\u1ed3ng b\u1ed9 giao d\u1ecbch...' : 'Payment recorded. Syncing transaction...',
                            'info'
                        );
                    });
             } else {
                 notify(
                     lang === 'vi' ? 'Thanh to\u00e1n th\u00e0nh c\u00f4ng! Vcoin s\u1ebd \u0111\u01b0\u1ee3c c\u1ed9ng trong gi\u00e2y l\u00e1t.' : 'Payment successful! Vcoin will be added shortly.',
                     'success'
                 );
             }
             setCurrentView('topup');
        } else if (status === 'CANCELLED') {
             desktopHistoryModeRef.current = 'replace';
             notify(
                 lang === 'vi' ? '\u0110\u00e3 h\u1ee7y thanh to\u00e1n.' : 'Payment cancelled.',
                 'error'
             );
             setCurrentView('topup');
        }
    }
  }, [lang, notify]);

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

    const heartbeatInstanceId = heartbeatInstanceIdRef.current;

    const releaseLease = () => {
      try {
        const raw = window.localStorage.getItem(queueHeartbeatLeaseKey);
        if (!raw) return;
        const current = JSON.parse(raw);
        if (current?.id === heartbeatInstanceId) {
          window.localStorage.removeItem(queueHeartbeatLeaseKey);
        }
      } catch (error) {
        console.warn('[App] Failed to release queue heartbeat lease:', error);
      }
    };

    const tryBecomeHeartbeatLeader = () => {
      try {
        const now = Date.now();
        const raw = window.localStorage.getItem(queueHeartbeatLeaseKey);
        const current = raw ? JSON.parse(raw) : null;
        if (!current || !current.id || Number(current.expiresAt || 0) <= now || current.id === heartbeatInstanceId) {
          window.localStorage.setItem(
            queueHeartbeatLeaseKey,
            JSON.stringify({
              id: heartbeatInstanceId,
              expiresAt: now + queueHeartbeatLeaseMs,
            }),
          );
          return true;
        }
        return false;
      } catch (error) {
        console.warn('[App] Failed to acquire queue heartbeat lease:', error);
        return true;
      }
    };

    const runHeartbeat = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (!tryBecomeHeartbeatLeader()) {
        return;
      }
      triggerServerQueueTick().catch((error) => {
        console.warn('[App] Queue heartbeat failed:', error);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runHeartbeat();
      }
    };

    runHeartbeat();
    const interval = setInterval(runHeartbeat, queueHeartbeatIntervalMs);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', releaseLease);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', releaseLease);
      releaseLease();
    };
  }, [isAuthenticated]);

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

  // View Routing Logic
  const renderContent = () => {
    switch (currentView) {
      case 'home':
        return <Home lang={lang} onSelectFeature={handleSelectFeature} onNavigate={handleNavigate} onOpenCheckin={() => setShowCheckin(true)} isMaintenance={maintenanceMode.isActive && userRole !== 'admin'} maintenanceMessage={maintenanceMode.message} />;
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
      case 'topup':
        return <TopUp lang={lang} onNavigate={handleNavigate} />;
      case 'payment_gateway':
        return pendingTransaction ? (
            <PayOSGateway 
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
    >
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
        {selectedFeature ? (
          <ToolWorkspace 
            feature={selectedFeature} 
            lang={lang} 
            onBack={() => handleNavigate('home')} 
            onNavigateToFeature={handleNavigateToFeature}
            onNavigateView={handleNavigate}
          />
        ) : (
          currentView === 'tool_workspace' && <Home lang={lang} onSelectFeature={handleSelectFeature} onNavigate={handleNavigate} onOpenCheckin={() => setShowCheckin(true)} isMaintenance={maintenanceMode.isActive && userRole !== 'admin'} maintenanceMessage={maintenanceMode.message} />
        )}
      </div>

      {currentView !== 'tool_workspace' && renderContent()}
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

        window.localStorage.setItem(SHELL_PREFERENCE_STORAGE_KEY, useMobileShell ? 'mobile' : 'desktop');

        refreshShellMode();
        window.addEventListener('popstate', refreshShellMode);

        return () => {
            window.removeEventListener('popstate', refreshShellMode);
        };
    }, [useMobileShell]);

    return useMobileShell ? <MobileApp /> : <DesktopApp />;
}
