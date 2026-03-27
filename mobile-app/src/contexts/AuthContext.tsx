/**
 * Auth Context for Mobile App
 * Provides authentication state, user profile, and auth actions to the entire app.
 * Mirrors the auth flow from desktop App.tsx but via React Context.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, getSupabaseSession, getSupabaseUser } from '../services/supabaseClient';
import { getUserProfile, logVisit, updateLastActive, subscribeMaintenanceMode, invalidateUserProfileCache } from '../services/economyService';
import type { UserProfile } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  userRole: 'user' | 'admin';
  maintenanceMode: { isActive: boolean; message: string };
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const [maintenanceMode, setMaintenanceMode] = useState({ isActive: false, message: '' });

  const refreshProfile = async () => {
    try {
      const profile = await getUserProfile({ force: true });
      setUser(profile);
      setUserRole(profile.role);
    } catch (e) {
      console.warn('[AuthContext] Failed to refresh profile', e);
    }
  };

  const checkAdminRole = async (userId: string) => {
    try {
      const authUser = await getSupabaseUser();
      const profile = await getUserProfile();
      if (
        authUser?.email === 'khoknightyb97@gmail.com' ||
        (profile?.id === userId && profile?.role === 'admin')
      ) {
        setUserRole('admin');
      } else {
        setUserRole('user');
      }
      setUser(profile);
    } catch (e) {
      console.error('[AuthContext] Error checking admin role:', e);
    }
  };

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setIsAuthenticated(false);
    setUser(null);
    setUserRole('user');
    invalidateUserProfileCache();
  };

  useEffect(() => {
    // Log visit on mount
    logVisit();
    updateLastActive();

    // Update last active every 5 minutes
    const activeInterval = setInterval(() => {
      updateLastActive();
    }, 5 * 60 * 1000);

    // Visibility change handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateLastActive();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (supabase) {
      const unsubscribeMaintenanceMode = subscribeMaintenanceMode(setMaintenanceMode);

      // Check existing session
      getSupabaseSession().then(async (session: any) => {
        if (session) {
          setIsAuthenticated(true);
          await checkAdminRole(session.user.id);
        }
        setIsLoading(false);
      });

      // Listen for auth changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event: any, session: any) => {
        if (session) {
          setIsAuthenticated(true);
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            setIsLoading(true);
            void checkAdminRole(session.user.id)
              .finally(() => {
                setIsLoading(false);
              });
            void updateLastActive();
          }
        } else {
          setIsAuthenticated(false);
          setUser(null);
          setUserRole('user');
          setIsLoading(false);
        }
      });

      // Listen for balance_updated events
      const handleBalanceUpdate = () => {
        refreshProfile();
      };
      window.addEventListener('balance_updated', handleBalanceUpdate);

      return () => {
        subscription.unsubscribe();
        unsubscribeMaintenanceMode();
        clearInterval(activeInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('balance_updated', handleBalanceUpdate);
      };
    } else {
      setIsLoading(false);
    }

    return () => {
      clearInterval(activeInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        userRole,
        maintenanceMode,
        refreshProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
