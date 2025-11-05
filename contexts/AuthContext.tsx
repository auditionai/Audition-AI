import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { User, Stats } from '../types';
import { calculateLevelFromXp } from '../utils/rankUtils';

const getVNDateString = (date: Date) => {
    // UTC+7
    const vietnamTime = new Date(date.getTime() + 7 * 3600 * 1000);
    return vietnamTime.toISOString().split('T')[0];
};


// Define the shape of the context
interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    stats: Stats;
    toast: { message: string; type: 'success' | 'error' } | null;
    route: string; // for simple routing
    hasCheckedInToday: boolean;
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

    const updateUserDiamonds = useCallback((newAmount: number) => {
        setUser(currentUser => currentUser ? { ...currentUser, diamonds: newAmount } : null);
    }, []);

    // FIX: Moved `updateUserProfile` before the `useEffect` that uses it to resolve the "used before declaration" error.
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
                    return null; 
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
                return profile;
            }
            return null;
        } catch (error) {
            console.error('Error fetching user profile:', error);
            showToast('Không thể tải thông tin người dùng.', 'error');
            return null;
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
                const createdAt = new Date(session.user.created_at).getTime();
                
                // Identify a new user by checking if their account was created within the last minute.
                // This handles the first sign-in after registration.
                const isNewUser = (Date.now() - createdAt) < 60000;

                if (isNewUser) {
                    // For new users, there's a flow to set their initial diamond count to 10
                    // instead of the database default of 25.
                    // A delay is added to ensure the database trigger for profile creation has completed.
                    setTimeout(async () => {
                        try {
                            await fetch('/.netlify/functions/set-initial-diamonds', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${session.access_token}` }
                            });
                        } catch (e) {
                            console.error("Failed to set initial diamonds; user will have the default amount.", e);
                        } finally {
                            // Fetch the user profile after attempting the update to get the final state.
                            await fetchUserProfile(session.user);
                        }
                    }, 2000); // 2-second delay to be safe.
                } else {
                    // For existing users, fetch their profile after a short delay.
                    setTimeout(() => fetchUserProfile(session.user), 500);
                }
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
    
    const hasCheckedInToday = useMemo(() => {
        if (!user?.last_check_in_ct) return false;
        const todayVnString = getVNDateString(new Date());
        const lastCheckInVnString = getVNDateString(new Date(user.last_check_in_ct));
        return todayVnString === lastCheckInVnString;
    }, [user?.last_check_in_ct]);

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

    const value = useMemo(() => ({
        session,
        user,
        loading,
        stats,
        toast,
        route,
        hasCheckedInToday,
        login,
        logout,
        updateUserDiamonds,
        updateUserProfile,
        showToast,
        navigate,
    }), [
        session, user, loading, stats, toast, route, 
        hasCheckedInToday,
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