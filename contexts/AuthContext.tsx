import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
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
    const [stats] = useState<Stats>({ users: 1250, visits: 8700, images: 25000 });
    const [route, setRoute] = useState('home');

    // Ref to store previous user state for comparison
    const previousUserRef = useRef<User | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(null);
        }, 4000); // Increased duration
    }, []);
    
    const navigate = useCallback((path: string) => {
        setRoute(path);
        window.scrollTo(0, 0);
    }, []);

    const updateUserDiamonds = useCallback((newAmount: number) => {
        setUser(currentUser => currentUser ? { ...currentUser, diamonds: newAmount } : null);
    }, []);

    const updateUserProfile = useCallback((updates: Partial<User>) => {
        setUser(currentUser => {
            if (!currentUser) return null;
            const updatedUser = { ...currentUser, ...updates };
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

            if (error && error.code === 'PGRST116') {
                console.warn("User profile not found, it might be creating.");
                return null; 
            }
            if (error) throw error;

            if (data) {
                const profile = data as User;
                if (typeof profile.xp === 'number') {
                    profile.level = calculateLevelFromXp(profile.xp);
                }
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
        // Store previous user state before it updates
        previousUserRef.current = user;
    }, [user]);

    // Effect for initializing and listening to auth state changes. Solves hanging issues.
    useEffect(() => {
        setLoading(true);

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            let userProfile: User | null = null;
            if (session?.user) {
                const createdAt = new Date(session.user.created_at).getTime();
                const isNewUser = (Date.now() - createdAt) < 60000;
                
                if (isNewUser && _event === 'SIGNED_IN') {
                    // Delay slightly to ensure user profile is created by trigger
                     await new Promise(res => setTimeout(res, 1500));
                     try {
                        await fetch('/.netlify/functions/set-initial-diamonds', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${session.access_token}` }
                        });
                     } catch (e) {
                        console.error("Failed to set initial diamonds.", e);
                     }
                }
                userProfile = await fetchUserProfile(session.user);
            }
            setUser(userProfile);
            setLoading(false);
        });
    
        return () => {
            subscription.unsubscribe();
        };
    }, [fetchUserProfile]);


    // Effect to handle real-time notifications and profile updates
    useEffect(() => {
        if (!user?.id || !session) return;

        const previousUser = previousUserRef.current;
        if (user && previousUser) {
            // Notify on diamond increase
            if (user.diamonds > previousUser.diamonds) {
                const diff = user.diamonds - previousUser.diamonds;
                showToast(`Bạn đã nhận được ${diff} Kim cương!`, 'success');
            }
            // Notify on level up
            if (user.level > previousUser.level) {
                 showToast(`Chúc mừng! Bạn đã thăng cấp ${user.level}!`, 'success');
            }
        }

        // Real-time listener for user profile changes
        const userChannel = supabase
            .channel(`public:users:${user.id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
                (payload) => {
                    console.log('Realtime user update received:', payload.new);
                    updateUserProfile(payload.new as Partial<User>);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(userChannel);
        };
    }, [user, session, showToast, updateUserProfile]);
    
    const hasCheckedInToday = useMemo(() => {
        if (!user?.last_check_in_ct) return false;
        const todayVnString = getVNDateString(new Date());
        const lastCheckInVnString = getVNDateString(new Date(user.last_check_in_ct));
        return todayVnString === lastCheckInVnString;
    }, [user?.last_check_in_ct]);

    const login = useCallback(async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
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
        navigate('home');
    }, [navigate]);

    const value = useMemo(() => ({
        session, user, loading, stats, toast, route, hasCheckedInToday,
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate,
    }), [
        session, user, loading, stats, toast, route, hasCheckedInToday,
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