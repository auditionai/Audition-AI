import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, Stats } from '../types';
import { supabase } from '../utils/supabaseClient';
import { Session } from '@supabase/supabase-js';
import { calculateLevelFromXp } from '../utils/rankUtils';

interface AppContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  showToast: (message: string, type: 'success' | 'error') => void;
  toast: { message: string, type: 'success' | 'error' } | null;
  updateUserProfile: (updates: Partial<User>) => void;
  login: () => Promise<void>;
  updateUserDiamonds: (newDiamondCount: number) => void;
  stats: Stats;
  navigate: (path: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [stats] = useState<Stats>({
      users: 1337,
      visits: 4200,
      images: 9001,
  });

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        
        const fetchUserProfile = async (userId: string) => {
            return await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();
        };
        
        let { data, error } = await fetchUserProfile(session.user.id);

        if (error && (_event === 'SIGNED_IN' || _event === 'USER_UPDATED')) {
            console.log('Initial profile fetch failed, retrying after a short delay for trigger execution...');
            await new Promise(resolve => setTimeout(resolve, 1500)); // Increased delay slightly
            const retryResult = await fetchUserProfile(session.user.id);
            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
          console.error('Error fetching user profile, even after retry. Signing out to clear invalid session.', error);
          // CRITICAL FIX: If the session is invalid (user profile not found),
          // force a sign-out to clear the corrupted local storage token.
          // This will re-trigger onAuthStateChange with a null session, breaking the hang loop.
          supabase.auth.signOut();
          setUser(null);
        } else if (data) {
          const level = calculateLevelFromXp(data.xp);
          setUser({ ...data, level });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Error logging out:", error);
        showToast(`Đăng xuất thất bại: ${error.message}`, 'error');
    }
    // The onAuthStateChange listener will handle clearing user and session state.
    // Removing the manual setUser(null) and setSession(null) calls here
    // resolves a race condition that was causing the application to freeze.
  };
  
  const updateUserProfile = (updates: Partial<User>) => {
      setUser(currentUser => {
          if (!currentUser) return null;
          const updatedUser = { ...currentUser, ...updates };
          if(updates.xp !== undefined) {
              updatedUser.level = calculateLevelFromXp(updatedUser.xp);
          }
          return updatedUser;
      });
  }

  const login = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) showToast(error.message, 'error');
  };

  const updateUserDiamonds = (newDiamondCount: number) => {
    if (user) {
        updateUserProfile({ diamonds: newDiamondCount });
    }
  };

  const navigate = (path: string) => {
    console.log(`Navigating to ${path}`);
    if (path === 'home') {
        window.location.pathname = '/';
    } else if (path === 'gallery') {
        console.log("Navigation to gallery page requested.");
        showToast("Gallery page is for demo purposes.", "success");
    }
  };

  const value: AppContextType = {
    session,
    user,
    loading,
    logout,
    showToast,
    toast,
    updateUserProfile,
    login,
    updateUserDiamonds,
    stats,
    navigate
  };

  return (
    <AppContext.Provider value={value}>
      {!loading && children}
    </AppContext.Provider>
  );
};

export const useAuth = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};