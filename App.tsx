
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
import { Language, Theme, ViewId, Feature } from './types';
import { APP_CONFIG } from './constants';
import { supabase } from './services/supabaseClient';
import { logVisit } from './services/economyService';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false); // New state to control render
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const [lang, setLang] = useState<Language>(APP_CONFIG.ui.default_language);
  const [theme, setTheme] = useState<Theme>('light');
  const [currentView, setCurrentView] = useState<ViewId>('home');
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  
  // Lifted state for Daily Checkin Modal
  const [showCheckin, setShowCheckin] = useState(false);

  useEffect(() => {
    // 1. IMMEDIATE UI SETUP
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
    
    // Mark App as ready to render immediately to prevent white/black screen
    setIsAppReady(true);

    // 2. DEFERRED BACKGROUND TASKS (Network Calls)
    // We use setTimeout to push these tasks to the end of the event loop,
    // allowing the UI to paint first.
    const initNetworkServices = async () => {
        try {
            console.log("[App] Starting background services...");
            
            // Log Visit
            logVisit().catch(e => console.warn("Visit log failed", e));

            // Check Auth
            if (supabase) {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    setIsAuthenticated(true);
                    checkAdminRole(session.user.id);
                }

                // Listen for auth changes
                supabase.auth.onAuthStateChange((_event, session) => {
                    if (session) {
                        setIsAuthenticated(true);
                        checkAdminRole(session.user.id);
                    } else {
                        setIsAuthenticated(false);
                    }
                });
            }
        } catch (error) {
            console.warn("[App] Background service error:", error);
            // Even if network fails, we stay in unauthenticated mode (Landing Page)
            // instead of crashing.
        }
    };

    setTimeout(initNetworkServices, 100);

  }, []);

  const checkAdminRole = async (userId: string) => {
      if (!supabase) return;
      
      try {
          const { data, error } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', userId)
            .single();

          if (!error && data && data.is_admin === true) {
              console.log("[Auth] Admin privileges granted.");
              setUserRole('admin');
          } else {
              setUserRole('user');
          }
      } catch (e) {
          console.error("[Auth] Error checking admin role:", e);
      }
  };

  const handleLogin = () => {
    // Fallback login flow
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
      if (supabase) {
          await supabase.auth.signOut();
      }
      setIsAuthenticated(false);
      setCurrentView('home');
      setUserRole('user');
  };

  const handleNavigate = (view: ViewId) => {
    setCurrentView(view);
    if (view !== 'tool_workspace') {
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
        return <TopUp lang={lang} />;
      default:
        return <Home lang={lang} onSelectFeature={handleSelectFeature} onNavigate={handleNavigate} onOpenCheckin={() => setShowCheckin(true)} />;
    }
  };

  // 3. RENDER UI IMMEDIATELY
  // While 'isAppReady' is technically true almost instantly, 
  // 'isAuthenticated' determines WHICH screen to show.
  // Default is Landing (Unauthenticated).
  
  if (!isAppReady) {
      // Very brief fallback, usually invisible due to React 18 batching
      return null; 
  }

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

export default App;
