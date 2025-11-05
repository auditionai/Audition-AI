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

// Helper function to parse the route from the URL pathname.
const getRouteFromPath = (path: string): string => {
    const pathSegment = path.split('/').filter(Boolean)[0];
    if (pathSegment === 'buy-credits' || pathSegment === 'gallery') {
        return pathSegment;
    }
    // 'home' will be the default route for '/' or any unrecognized path.
    return 'home';
};


// Define the shape of the context
interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    stats: Stats;
    toast: { message: string; type: 'success' | 'error' } | null;
    route: string; // for simple routing
    reward: { diamonds: number; xp: number } | null;
    hasCheckedInToday: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    updateUserDiamonds: (newAmount: number) => void;
    updateUserProfile: (updates: Partial<User>) => void;
    showToast: (message: string, type: 'success' | 'error') => void;
    navigate: (path: string) => void;
    clearReward: () => void;
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
    const [route, setRoute] = useState(() => getRouteFromPath(window.location.pathname));
    const [reward, setReward] = useState<{ diamonds: number; xp: number } | null>(null);

    const previousUserRef = useRef<User | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(null);
        }, 4000); 
    }, []);
    
    const navigate = useCallback((path: string) => {
        const targetPath = path === 'home' ? '/' : `/${path}`;
        if (window.location.pathname !== targetPath) {
            window.history.pushState({}, '', targetPath);
        }
        setRoute(path);
        window.scrollTo(0, 0);
    }, []);
    
    const clearReward = useCallback(() => {
        setReward(null);
    }, []);

    useEffect(() => {
        const handlePopState = () => {
            setRoute(getRouteFromPath(window.location.pathname));
        };

        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
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
            return null;
        }
    }, []);
    
    useEffect(() => {
        previousUserRef.current = user;
    }, [user]);

    useEffect(() => {
        const previousUser = previousUserRef.current;
        if (user && previousUser) {
            const diamondDiff = user.diamonds - previousUser.diamonds;
            const xpDiff = user.xp - previousUser.xp;

            // Only trigger reward if there's a positive change from a transaction
            if (diamondDiff > 0 || xpDiff > 0) {
                 setReward({ 
                    diamonds: diamondDiff > 0 ? diamondDiff : 0, 
                    xp: xpDiff > 0 ? xpDiff : 0 
                });
            }
            
            if (user.level > previousUser.level) {
                 showToast(`Chúc mừng! Bạn đã thăng cấp ${user.level}!`, 'success');
            }
        }
    }, [user, showToast]);

    const hardReset = () => {
        console.warn("Forcing hard reset: Bypassing Supabase client, clearing storage, and reloading page...");
        try {
            const clearStorage = (storage: Storage) => {
                const keysToRemove: string[] = [];
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    if (key && (key.startsWith('sb-') || key.toLowerCase().includes('supabase'))) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => storage.removeItem(key));
            };

            clearStorage(localStorage);
            clearStorage(sessionStorage);
            
            console.log("Cleared Supabase-related storage keys. Reloading page now.");
            window.location.reload();
        } catch (e) {
            console.error("Hard reset failed during storage clear or reload:", e);
            setLoading(false); 
            setUser(null);
            setSession(null);
        }
    };

    useEffect(() => {
        let isCancelled = false;
        let timeoutId: number | null = null;

        const initializeAuth = async () => {
            timeoutId = window.setTimeout(() => {
                if (!isCancelled) {
                    console.error("A critical error or timeout occurred during auth initialization. Force signing out. Error: Authentication timed out after 8 seconds.");
                    hardReset();
                }
            }, 8000);

            try {
                const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
                
                if (isCancelled) return;
                
                if (timeoutId) clearTimeout(timeoutId);

                if (sessionError) throw sessionError;

                if (currentSession) {
                    const profile = await fetchUserProfile(currentSession.user);
                    if (profile) {
                        setSession(currentSession);
                        setUser(profile);
                    } else {
                        throw new Error("Session is valid but user profile is missing. Data corruption detected.");
                    }
                } else {
                    setSession(null);
                    setUser(null);
                }
                
                setLoading(false);

            } catch (error) {
                if (isCancelled) return;
                console.error("Caught error during auth initialization, triggering hard reset.", error);
                if (timeoutId) clearTimeout(timeoutId);
                hardReset();
            }
        };

        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, newSession) => {
                if (isCancelled || loading) return;
                setSession(newSession);
                if (newSession?.user) {
                    const profile = await fetchUserProfile(newSession.user);
                    setUser(profile);
                } else {
                    setUser(null);
                }
            }
        );

        return () => {
            isCancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
            subscription.unsubscribe();
        };
    }, [fetchUserProfile, loading]);

    useEffect(() => {
        if (!user?.id || loading) return;

        const userChannel = supabase
            .channel(`public:users:id=eq.${user.id}`)
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
    }, [user?.id, updateUserProfile, loading]);

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
        session, user, loading, stats, toast, route, hasCheckedInToday, reward,
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate, clearReward,
    }), [
        session, user, loading, stats, toast, route, hasCheckedInToday, reward,
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate, clearReward
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