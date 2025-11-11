import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { getSupabaseClient } from '../utils/supabaseClient';
// Fix: The types `Session` and `User` are not exported from the root of `@supabase/supabase-js` in v1.
// They are removed from here to fix the compile error. `any` will be used for the session object.
import type { SupabaseClient, Subscription } from '@supabase/supabase-js';
import { User, OldStats, Announcement } from '../types';
import { calculateLevelFromXp } from '../utils/rankUtils';

const getVNDateString = (date: Date) => {
    // UTC+7
    const vietnamTime = new Date(date.getTime() + 7 * 3600 * 1000);
    return vietnamTime.toISOString().split('T')[0];
};

const getRouteFromPath = (path: string): string => {
    const pathSegment = path.split('/').filter(Boolean)[0];
    const validRoutes = ['tool', 'leaderboard', 'my-creations', 'settings', 'buy-credits', 'gallery', 'admin-gallery'];
    if (validRoutes.includes(pathSegment)) {
        return pathSegment;
    }
    return 'home';
};

interface AuthContextType {
    session: any | null;
    user: User | null;
    loading: boolean;
    stats: OldStats;
    toast: { message: string; type: 'success' | 'error' } | null;
    route: string;
    reward: { diamonds: number; xp: number } | null;
    hasCheckedInToday: boolean;
    announcement: Announcement | null;
    showAnnouncementModal: boolean;
    supabase: SupabaseClient | null; // Expose supabase client
    login: () => Promise<void>;
    logout: () => Promise<void>;
    updateUserDiamonds: (newAmount: number) => void;
    updateUserProfile: (updates: Partial<User>) => void;
    showToast: (message: string, type: 'success' | 'error') => void;
    navigate: (path: string) => void;
    clearReward: () => void;
    markAnnouncementAsRead: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
    const [session, setSession] = useState<any | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [stats] = useState<OldStats>({ users: 1250, visits: 8700, images: 25000 });
    const [route, setRoute] = useState(() => getRouteFromPath(window.location.pathname));
    const [reward, setReward] = useState<{ diamonds: number; xp: number } | null>(null);
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);
    const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);

    const previousUserRef = useRef<User | null>(null);
    const initStarted = useRef(false);
    const visitLogged = useRef(false); // Ref to track if the visit has been logged

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
    
    const clearReward = useCallback(() => setReward(null), []);

    useEffect(() => {
        const handlePopState = () => setRoute(getRouteFromPath(window.location.pathname));
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const updateUserDiamonds = useCallback((newAmount: number) => {
        setUser(currentUser => currentUser ? { ...currentUser, diamonds: newAmount } : null);
    }, []);

    const updateUserProfile = useCallback((updates: Partial<User>) => {
        setUser(currentUser => {
            if (!currentUser) return null;
            const updatedUser = { ...currentUser, ...updates };
            if (updates.xp !== undefined) {
                updatedUser.level = calculateLevelFromXp(updates.xp ?? 0);
            }
            return updatedUser;
        });
    }, []);

    const fetchUserProfile = useCallback(async (supabaseUser: any, supabaseClient: SupabaseClient) => {
        try {
            const { data, error } = await supabaseClient
                .from('users')
                .select('id, display_name, email, photo_url, diamonds, xp, is_admin, last_check_in_at, consecutive_check_in_days, last_announcement_seen_id')
                .eq('id', supabaseUser.id)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            if (data) {
                const profile = data as User;
                profile.level = calculateLevelFromXp(profile.xp ?? 0);
                return profile;
            }
            return null;
        } catch (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
    }, []);

    const fetchAndSetUser = useCallback(async (session: any, supabaseClient: SupabaseClient) => {
        let profile = await fetchUserProfile(session.user, supabaseClient);

        // If profile doesn't exist yet (race condition with trigger), wait and retry once.
        if (!profile) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            profile = await fetchUserProfile(session.user, supabaseClient);
        }
        
        // If it's a new user (diamonds is at default 25), call function to update to 10
        if (profile && profile.diamonds === 25) {
             try {
                const response = await fetch('/.netlify/functions/set-initial-diamonds', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.diamonds !== undefined) {
                        // Mutate the profile object before setting state to prevent UI flicker
                        profile.diamonds = data.diamonds;
                    }
                }
             } catch(e) {
                console.error("Non-critical: Failed to update initial diamonds.", e);
             }
        }
        setUser(profile);
    }, [fetchUserProfile]);
    
    useEffect(() => {
        if (initStarted.current) return;
        initStarted.current = true;

        const initialize = async () => {
            try {
                const supabaseClient = await getSupabaseClient();
                if (!supabaseClient) {
                    throw new Error("Không thể khởi tạo. Vui lòng xóa cache trình duyệt và thử lại.");
                }
                setSupabase(supabaseClient);

                // Log app visit once per session
                if (!visitLogged.current) {
                    visitLogged.current = true;
                    // We don't need to await this, let it run in the background
                    fetch('/.netlify/functions/log-app-visit', { method: 'POST' });
                }

                // FIX: Use Supabase v2 async method `getSession()` instead of v1 sync `session()`.
                const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
                setSession(currentSession);
                
                if (currentSession) {
                    await fetchAndSetUser(currentSession, supabaseClient);
                    if (getRouteFromPath(window.location.pathname) === 'home') {
                        navigate('tool');
                    }
                }

                // FIX: Use Supabase v2 destructuring for onAuthStateChange subscription.
                const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
                    async (_event, newSession) => {
                        setSession(newSession);
                        if (newSession?.user) {
                            await fetchAndSetUser(newSession, supabaseClient);
                            if (_event === 'SIGNED_IN') navigate('tool');
                        } else {
                            setUser(null);
                            if (_event === 'SIGNED_OUT') navigate('home');
                        }
                    }
                );
                return () => subscription?.unsubscribe();
            } catch (error: any) {
                console.error("CRITICAL INITIALIZATION FAILURE:", error);
                showToast(error.message, "error");
            } finally {
                setLoading(false);
            }
        };

        initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Effect to check for new announcements when user logs in or data changes
    useEffect(() => {
        const checkAnnouncement = async () => {
            if (user && session) {
                try {
                    const res = await fetch('/.netlify/functions/announcements');
                    if (res.ok) {
                        const activeAnnouncement: Announcement = await res.json();
                        if (activeAnnouncement && activeAnnouncement.id !== user.last_announcement_seen_id) {
                            setAnnouncement(activeAnnouncement);
                            setShowAnnouncementModal(true);
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch announcement:", e);
                }
            }
        };
        checkAnnouncement();
    }, [user, session]);


    const markAnnouncementAsRead = useCallback(async () => {
        if (!announcement || !session) return;
        
        setShowAnnouncementModal(false); // Close modal immediately for better UX
        
        // Update local state optimistically
        updateUserProfile({ last_announcement_seen_id: announcement.id });
        
        try {
            await fetch('/.netlify/functions/mark-announcement-read', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ announcementId: announcement.id }),
            });
        } catch (e) {
            console.error("Failed to mark announcement as read:", e);
            // Optionally, revert the optimistic update on failure, though it's low-risk
        }
    }, [announcement, session, updateUserProfile]);


    useEffect(() => {
        previousUserRef.current = user;
    }, [user]);

    useEffect(() => {
        const previousUser = previousUserRef.current;
        if (user && previousUser) {
            const diamondDiff = user.diamonds - previousUser.diamonds;
            const xpDiff = user.xp - previousUser.xp;
            if (diamondDiff > 0 || xpDiff > 0) {
                 setReward({ diamonds: diamondDiff > 0 ? diamondDiff : 0, xp: xpDiff > 0 ? xpDiff : 0 });
            }
            if (user.level > previousUser.level) {
                 showToast(`Chúc mừng! Bạn đã thăng cấp ${user.level}!`, 'success');
            }
        }
    }, [user, showToast]);
    
    useEffect(() => {
        let activityInterval: ReturnType<typeof setInterval> | null = null;
        if (session && supabase) {
            activityInterval = setInterval(async () => {
                try {
                    // This now handles both XP and activity logging
                    await fetch('/.netlify/functions/record-user-activity', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${session.access_token}` },
                    });
                } catch (error) { console.error('Failed to record user activity:', error); }
            }, 60000);
        }
        return () => { if (activityInterval) clearInterval(activityInterval); };
    }, [session, supabase]);

    useEffect(() => {
        if (!user?.id || loading || !supabase) return;
        const userChannel = supabase
            .channel(`public:users:id=eq.${user.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
                (payload) => updateUserProfile(payload.new as Partial<User>)
            ).subscribe();
        return () => { supabase.removeChannel(userChannel); };
    }, [user?.id, updateUserProfile, loading, supabase]);

    const hasCheckedInToday = useMemo(() => {
        if (!user?.last_check_in_at) return false;
        return getVNDateString(new Date()) === getVNDateString(new Date(user.last_check_in_at));
    }, [user?.last_check_in_at]);

    const login = useCallback(async () => {
        if (!supabase) { showToast("Lỗi kết nối, không thể đăng nhập.", "error"); return; }
        // FIX: Use Supabase v2 method `signInWithOAuth` instead of v1 `signIn`.
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
            }
        });
        if (error) { showToast('Đăng nhập thất bại: ' + error.message, 'error'); throw error; }
    }, [supabase, showToast]);

    const logout = useCallback(async () => {
        if (!supabase) return;
        // Fix: `signOut` is correct for both v1 and v2, but the error suggests a v1/v2 mismatch elsewhere.
        await supabase.auth.signOut();
    }, [supabase]);

    const value = useMemo(() => ({
        session, user, loading, stats, toast, route, hasCheckedInToday, reward,
        announcement, showAnnouncementModal, supabase,
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate, clearReward,
        markAnnouncementAsRead,
    }), [
        session, user, loading, stats, toast, route, hasCheckedInToday, reward,
        announcement, showAnnouncementModal, supabase,
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate, clearReward,
        markAnnouncementAsRead
    ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
