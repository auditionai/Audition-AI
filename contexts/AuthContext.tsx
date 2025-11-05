import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { supabase } from '../utils/supabaseClient.ts';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { User } from '../types.ts';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  updateUserProfile: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

  useEffect(() => {
    const getSessionAndProfile = async () => {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            console.error("Error getting session:", sessionError);
            setIsLoading(false);
            return;
        }
        setSession(currentSession);
        if (currentSession?.user) {
            await fetchUserProfile(currentSession.user);
        }
        setIsLoading(false);
    };

    getSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        if (!user || user.id !== session.user.id) {
           await fetchUserProfile(session.user);
        }
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (supabaseUser: SupabaseUser) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', supabaseUser.id)
            .single();
        if (error) throw error;
        if (data) setUser(data as User);
    } catch (error) {
        console.error('Error fetching user profile:', error);
    }
  };

  const login = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      console.error('Error logging in:', error);
      showToast('Đăng nhập thất bại. Vui lòng thử lại.', 'error');
      throw error;
    }
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Error logging out:', error);
        showToast('Đăng xuất thất bại.', 'error');
    } else {
        setUser(null);
        setSession(null);
    }
  };
  
  const updateUserProfile = (updates: Partial<User>) => {
    setUser(prevUser => prevUser ? { ...prevUser, ...updates } : null);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const value = {
    session,
    user,
    isLoading,
    login,
    logout,
    showToast,
    updateUserProfile
  };
  
  const toastColors = {
    success: 'bg-green-500/80 border-green-400',
    error: 'bg-red-500/80 border-red-400',
    info: 'bg-blue-500/80 border-blue-400'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {toast && (
        <div className={`fixed bottom-5 right-5 p-4 rounded-lg text-white border backdrop-blur-sm shadow-lg z-50 animate-fade-in-up ${toastColors[toast.type as keyof typeof toastColors]}`}>
          {toast.message}
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
