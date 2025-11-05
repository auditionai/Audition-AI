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
        // Store previous user state before it updates
        previousUserRef.current = user;
    }, [user]);

    // Effect to handle real-time notifications
    useEffect(() => {
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
    }, [user, showToast]);


    useEffect(() => {
        const initializeAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            if (session?.user) {
                await fetchUserProfile(session.user);
            }
            setLoading(false);
        };
        
        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            if (session?.user) {
                const createdAt = new Date(session.user.created_at).getTime();
                const isNewUser = (Date.now() - createdAt) < 60000;

                if (isNewUser) {
                    setTimeout(async () => {
                        try {
                            await fetch('/.netlify/functions/set-initial-diamonds', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${session.access_token}` }
                            });
                        } catch (e) {
                            console.error("Failed to set initial diamonds.", e);
                        } finally {
                            await fetchUserProfile(session.user);
                        }
                    }, 2000);
                } else {
                    // For existing users, just ensure profile is fresh on login
                    await fetchUserProfile(session.user);
                }
            } else {
                setUser(null);
            }
        });
        
        // Real-time listener for user profile changes
        const userChannel = supabase
            .channel('public:users')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user?.id}` },
                (payload) => {
                    console.log('Realtime user update received:', payload.new);
                    updateUserProfile(payload.new as Partial<User>);
                }
            )
            .subscribe();

        return () => {
            subscription?.unsubscribe();
            supabase.removeChannel(userChannel);
        };
    }, [fetchUserProfile, updateUserProfile, user?.id]);
    
    const hasCheckedInToday = useMemo(() => {
        if (!user?.last_check_in_at) return false;
        const todayVnString = getVNDateString(new Date());
        const lastCheckInVnString = getVNDateString(new Date(user.last_check_in_at));
        return todayVnString === lastCheckInVnString;
    }, [user?.last_check_in_at]);

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
