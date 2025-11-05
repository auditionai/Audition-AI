import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { User } from '../types';
import { Session } from '@supabase/supabase-js';
import { calculateLevelFromXp } from '../utils/rankUtils';

type ToastMessage = {
  message: string;
  type: 'success' | 'error';
};

type AppRoute = 'home' | 'tool' | 'gallery' | 'leaderboard' | 'settings' | 'buy-credits';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  toast: ToastMessage | null;
  stats: { users: number; visits: number; images: number; };
  route: AppRoute;
  hasCheckedInToday: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  showToast: (message: string, type: 'success' | 'error') => void;
  navigate: (path: AppRoute) => void;
  updateUserProfile: (updates: Partial<User>) => void;
  updateUserDiamonds: (newAmount: number) => void;
  setHasCheckedInToday: (status: boolean) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [route, setRoute] = useState<AppRoute>('home');
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);
  
  // Mock stats for the demo
  const [stats] = useState({ users: 1250, visits: 8700, images: 25000 });

  const updateUserProfile = (updates: Partial<User>) => {
    setUser(prevUser => {
      if (!prevUser) return null;
      const updatedUser = { ...prevUser, ...updates };
      // Recalculate level if XP changes
      if (updates.xp !== undefined) {
        updatedUser.level = calculateLevelFromXp(updates.xp);
      }
      return updatedUser;
    });
  };

  const updateUserDiamonds = (newAmount: number) => {
    if (user) {
        updateUserProfile({ diamonds: newAmount });
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setLoading(true);
        setSession(session);

        if (session?.user) {
          // Fetch user profile from 'users' table
          const { data: userProfile, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (error && error.code !== 'PGRST116') { // PGRST116: "exact one row" error, user might not be in our table yet.
            console.error('Error fetching user profile:', error);
            showToast('Không thể tải thông tin người dùng.', 'error');
          } else if (userProfile) {
            const level = calculateLevelFromXp(userProfile.xp);
            setUser({ ...userProfile, level });
            // Check if it's a new user (default diamonds is 25) to set the initial 10
            if (userProfile.diamonds === 25) {
                fetch('/.netlify/functions/set-initial-diamonds', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                }).then(res => res.json()).then(data => {
                    if (data.diamonds) {
                        updateUserDiamonds(data.diamonds);
                    }
                });
            }
          }
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Check daily check-in status on user load
  useEffect(() => {
    if (user && session) {
      const checkStatus = async () => {
        try {
          const res = await fetch('/.netlify/functions/daily-check-in', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          const data = await res.json();
          setHasCheckedInToday(data.hasCheckedInToday || false);
        } catch (e) {
          console.error('Failed to check check-in status', e);
        }
      };
      checkStatus();
    }
  }, [user, session]);


  const login = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      showToast(error.message, 'error');
    }
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showToast(error.message, 'error');
    else {
      setUser(null);
      setSession(null);
      navigate('home');
    }
  };

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const navigate = (path: AppRoute) => {
    setRoute(path);
    window.scrollTo(0, 0); // Scroll to top on page change
  };

  const value = {
    session,
    user,
    loading,
    toast,
    stats,
    route,
    hasCheckedInToday,
    login,
    logout,
    showToast,
    navigate,
    updateUserProfile,
    updateUserDiamonds,
    setHasCheckedInToday,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};