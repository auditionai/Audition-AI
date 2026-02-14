
import React, { useState, useEffect } from 'react';
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
import { supabase } from './services/supabaseClient';
import { logVisit } from './services/economyService';
import { NotificationProvider, useNotification } from './components/NotificationSystem';

function AppContent() {
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

  // Custom Notification Hook
  const { notify } = useNotification();

  useEffect(() => {
    // Initial theme setup
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }

    // Log Visit (Tracks every reload)
    logVisit();

    // Check for existing session on load
    if (supabase) {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setIsAuthenticated(true);
                checkAdminRole(session.user.id);
            }
        });

        // Listen for auth changes (login/logout/oauth redirect)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                setIsAuthenticated(true);
                checkAdminRole(session.user.id);
            } else {
                setIsAuthenticated(false);
            }
        });

        return () => subscription.unsubscribe();
    }
  }, []);

  // --- HANDLE PAYOS RETURN ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    
    if (status) {
        // Clear params to avoid loop/dirty URL
        window.history.replaceState({}, '', window.location.pathname);
        
        if (status === 'PAID') {
             notify(
                 lang === 'vi' ? 'Thanh toán thành công! Vcoin sẽ được cộng trong giây lát.' : 'Payment successful! Vcoin will be added shortly.',
                 'success'
             );
             setCurrentView('topup');
        } else if (status === 'CANCELLED') {
             notify(
                 lang === 'vi' ? 'Đã hủy thanh toán.' : 'Payment cancelled.',
                 'error'
             );
             setCurrentView('topup');
        }
    }
  }, [lang, notify]); 

  const checkAdminRole = async (userId: string) => {
      if (!supabase) return;
      
      try {
          const { data, error } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', userId)
            .single();

          if (!error && data && data.is_admin === true) {
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
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
      if (supabase) {
          await supabase.auth.signOut();
      }
      setIsAuthenticated(false);
      setCurrentView('home');
      setUserRole('user'); // Reset role
  };

  const handleNavigate = (view: ViewId, data?: any) => {
    setCurrentView(view);
    if (view === 'payment_gateway' && data?.transaction) {
        setPendingTransaction(data.transaction);
    } else if (view !== 'tool_workspace') {
      setSelectedFeature(null);
    }
  };

  const handleSelectFeature = (feature: Feature) => {
    setSelectedFeature(feature);
    setCurrentView('tool_workspace');
  };

  // View Routing Logic
  const renderContent = () => {
    switch (currentView) {
      case 'home':
        return <Home lang={lang} onSelectFeature={handleSelectFeature} onNavigate={handleNavigate} onOpenCheckin={() => setShowCheckin(true)} />;
      case 'tool_workspace':
        return selectedFeature ? (
          <ToolWorkspace 
            feature={selectedFeature} 
            lang={lang} 
            onBack={() => handleNavigate('home')} 
          />
        ) : <Home lang={lang} onSelectFeature={handleSelectFeature} onNavigate={handleNavigate} onOpenCheckin={() => setShowCheckin(true)} />;
      case 'tools':
        return <Home lang={lang} onSelectFeature={handleSelectFeature} onNavigate={handleNavigate} onOpenCheckin={() => setShowCheckin(true)} />;
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
        return <Home lang={lang} onSelectFeature={handleSelectFeature} onNavigate={handleNavigate} onOpenCheckin={() => setShowCheckin(true)} />;
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
      {renderContent()}
    </Layout>
  );
}

// Wrap App with Global Providers
export default function App() {
    return (
        <NotificationProvider>
            <AppContent />
        </NotificationProvider>
    );
}
