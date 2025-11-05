import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { User, Stats } from '../types';
import { calculateLevelFromXp } from '../utils/rankUtils';

// Define the shape of the context
interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    stats: Stats;
    toast: { message: string; type: 'success' | 'error' } | null;
    route: string; // for simple routing
    login: () => Promise<void>;
    logout: () => Promise<void>;
    updateUserDiamonds: (newAmount: number) => void;
    updateUserProfile: (updates: Partial<User>) => void;
    showToast: (message: string, type: 'success' | 'error') => void;
    navigate: (path: string) => void;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the provider component
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    // Demo stats
    const [stats] = useState<Stats>({ users: 1250, visits: 8700, images: 25000 });
    const [route, setRoute] = useState('home'); // initial route

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(null);
        }, 3000);
    }, []);
    
    const navigate = useCallback((path: string) => {
        setRoute(path);
        window.scrollTo(0, 0);
    }, []);

    const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser) => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', supabaseUser.id)
                .single();

            if (error) {
                // This can happen on first login if the DB trigger hasn't run yet.
                if (error.code === 'PGRST116') {
                    console.warn("User profile not found, it might be creating.");
                    return; 
                }
                throw error;
            }

            if (data) {
                const profile = data as User;
                // Ensure level is always calculated and consistent to prevent NaN errors
                if (typeof profile.xp === 'number') {
                    profile.level = calculateLevelFromXp(profile.xp);
                }
                setUser(profile);
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
            showToast('Không thể tải thông tin người dùng.', 'error');
        }
    }, [showToast]);
    
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            if (session?.user) {
                await fetchUserProfile(session.user);
            }
            setLoading(false);
        };
        
        checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            if (session?.user) {
                // A small delay might help if the DB trigger for user creation is slow
                setTimeout(() => fetchUserProfile(session.user), 500);
            } else {
                setUser(null);
            }
            // Only set loading to false on initial load, not every auth change
            if(loading) setLoading(false);
        });

        return () => {
            subscription?.unsubscribe();
        };
    }, [fetchUserProfile, loading]);

    const login = useCallback(async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
            },
        });
        if (error) {
            showToast('Đăng nhập thất bại: ' + error.message, 'error');
            throw error;
        }
    }, [showToast]);

    const logout = useCallback(async () => {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        navigate('home'); // Go to home page after logout
    }, [navigate]);

    const updateUserDiamonds = useCallback((newAmount: number) => {
        setUser(currentUser => currentUser ? { ...currentUser, diamonds: newAmount } : null);
    }, []);

    const updateUserProfile = useCallback((updates: Partial<User>) => {
        setUser(currentUser => {
            if (!currentUser) return null;
            
            const updatedUser = { ...currentUser, ...updates };

            // If XP was updated, also recalculate and update the level
            if (updates.xp !== undefined) {
                updatedUser.level = calculateLevelFromXp(updates.xp);
            }

            return updatedUser;
        });
    }, []);

    const value = useMemo(() => ({
        session,
        user,
        loading,
        stats,
        toast,
        route,
        login,
        logout,
        updateUserDiamonds,
        updateUserProfile,
        showToast,
        navigate,
    }), [
        session, user, loading, stats, toast, route, 
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate
    ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the auth context
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};