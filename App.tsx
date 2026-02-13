
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

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const [lang, setLang] = useState<Language>(APP_CONFIG.ui.default_language);
  const [theme, setTheme] = useState<Theme>('light');
  const [currentView, setCurrentView] = useState<ViewId>('home');
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  
  // Lifted state for Daily Checkin Modal
  const [showCheckin, setShowCheckin] = useState(false);

  useEffect(() => {
    // Initial theme setup
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }

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

  const checkAdminRole = async (userId: string) => {
      // Basic check, in production ideally handled by JWT claims or proper RBAC
      if (!supabase) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
      if (data && data.role === 'admin') {
          setUserRole('admin');
      }
  };

  const handleLogin = () => {
    // This is primarily for the "Mock" login flow if Supabase fails or is offline
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
      if (supabase) {
          await supabase.auth.signOut();
      }
      setIsAuthenticated(false);
      setCurrentView('home');
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
