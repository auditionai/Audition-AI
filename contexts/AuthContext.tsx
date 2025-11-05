import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
  loginAsAdmin: () => void;
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

        // **FIX: Handle Race Condition on New User Signup**
        // If the profile is not found immediately after signing in,
        // it might be because the database trigger to create the profile hasn't finished yet.
        // We wait for a short period and try fetching again.
        if (error && _event === 'SIGNED_IN') {
            console.log('Initial profile fetch failed, retrying after a short delay for trigger execution...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            const retryResult = await fetchUserProfile(session.user.id);
            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
          console.error('Error fetching user profile, even after retry:', error);
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

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };
  
  const updateUserProfile = (updates: Partial<User>) => {
      setUser(currentUser => {
          if (!currentUser) return null;
          const updatedUser = { ...currentUser, ...updates };
          // Recalculate level if XP changes
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

  const loginAsAdmin = () => {
    const adminUser: User = {
        id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
        display_name: 'Admin',
        email: 'admin@auditionai.io.vn',
        photo_url: 'https://i.pravatar.cc/150?u=admin',
        diamonds: 9999,
        xp: 100000,
        level: 100,
        is_admin: true,
    };
    setUser(adminUser);
    setSession({} as Session); // Dummy session for demo purposes
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
        // This is a placeholder. In a real multi-page app, you'd use a router.
        // For now, we'll just log it. A full gallery page doesn't exist yet.
        console.log("Navigation to gallery page requested.");
        showToast("Gallery page is for demo purposes.", "success");
    }
  };

  const value = {
    session,
    user,
    loading,
    logout,
    showToast,
    toast,
    updateUserProfile,
    login,
    loginAsAdmin,
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
