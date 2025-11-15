import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { getSupabaseClient } from '../utils/supabaseClient';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import { User, Announcement } from '../types';
import { calculateLevelFromXp } from '../utils/rankUtils';

declare const google: any; // Declare the google object for Google Identity Services

const getVNDateString = (date: Date) => {
    // UTC+7
    const vietnamTime = new Date(date.getTime() + 7 * 3600 * 1000);
    return vietnamTime.toISOString().split('T')[0];
};

const getRouteFromPath = (path: string): string => {
    const pathSegment = path.split('/').filter(Boolean)[0];
    const validRoutes = ['tool', 'leaderboard', 'my-creations', 'settings', 'buy-credits', 'gallery', 'admin-gallery']; // REMOVED: 'ai-love-story'
    if (validRoutes.includes(pathSegment)) {
        return pathSegment;
    }
    return 'home';
};

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    toast: { message: string; type: 'success' | 'error' } | null;
    route: string;
    reward: { diamonds: number; xp: number } | null;
    hasCheckedInToday: boolean;
    announcement: Announcement | null;
    showAnnouncementModal: boolean;
    supabase: SupabaseClient | null; // Expose supabase client
    login: () => Promise<boolean>;
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
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
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

    const fetchUserProfile = useCallback(async (session: Session) => {
        if (!session?.access_token) return null;
        try {
            const response = await fetch('/.netlify/functions/user-profile', {
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            });
            
            // Any non-OK response from the now-robust server function is a genuine error.
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server responded with ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data) {
                const profile = data as User;
                profile.level = calculateLevelFromXp(profile.xp ?? 0);
                return profile;
            }
            return null;
        } catch (error: any) {
            console.error('Error fetching user profile via function:', error);
            // This toast is now shown only on a definitive failure from the server.
            showToast(error.message || "Không thể tải hồ sơ người dùng. Vui lòng thử đăng nhập lại.", "error");
            return null;
        }
    }, [showToast]);

    const fetchAndSetUser = useCallback(async (session: Session) => {
        // The server-side function now handles retries, so we just call it once.
        const profile = await fetchUserProfile(session);
        
        if (!profile) {
            // The error toast is already shown inside fetchUserProfile on failure.
            console.error("CRITICAL: Server function failed to return a user profile.");
            setUser(null);
            return;
        }
        
        let finalProfile = { ...profile };

        // If it's a new user (diamonds is at default 25), call function to update to 10
        if (finalProfile.diamonds === 25) {
             try {
                const response = await fetch('/.netlify/functions/set-initial-diamonds', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.diamonds !== undefined) {
                        // Mutate the profile object before setting state to prevent UI flicker
                        finalProfile.diamonds = data.diamonds;
                    }
                }
             } catch(e) {
                console.error("Non-critical: Failed to update initial diamonds.", e);
             }
        }
        setUser(finalProfile);
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

                // FIX: Use Supabase v2 async method `getSession()`.
                const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
                setSession(currentSession);
                
                if (currentSession) {
                    await fetchAndSetUser(currentSession);
                    if (getRouteFromPath(window.location.pathname) === 'home') {
                        navigate('tool');
                    }
                }

                // FIX: Use Supabase v2 destructuring for onAuthStateChange.
                const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
                    async (_event, newSession) => {
                        setSession(newSession);
                        if (newSession?.user) {
                            await fetchAndSetUser(newSession);
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

    const login = useCallback(async (): Promise<boolean> => {
        const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (!supabase || !googleClientId || typeof google === 'undefined') {
            showToast("Chức năng đăng nhập chưa được cấu hình. Vui lòng liên hệ quản trị viên.", "error");
            return false;
        }

        const handleCredentialResponse = async (response: any) => {
            if (!response.credential) {
                showToast('Không nhận được thông tin đăng nhập từ Google.', 'error');
                return;
            }
            try {
                // FIX: Use Supabase v2 method `signInWithIdToken`.
                const { error } = await supabase.auth.signInWithIdToken({
                    provider: 'google',
                    token: response.credential,
                });
                if (error) throw error;
                // Auth state change will handle navigation and user profile fetching.
            } catch (error: any) {
                showToast(`Đăng nhập thất bại: ${error.message}`, 'error');
            }
        };
        
        try {
            google.accounts.id.initialize({
                client_id: googleClientId,
                callback: handleCredentialResponse,
            });
            google.accounts.id.prompt();
            return true;
        } catch (error: any) {
            console.error("Google One Tap prompt error:", error);
            showToast("Không thể hiển thị cửa sổ đăng nhập. Vui lòng thử lại.", "error");
            return false;
        }
    }, [supabase, showToast]);

    const logout = useCallback(async () => {
        if (!supabase) return;
        // The `signOut` method is correct for v2.
        await supabase.auth.signOut();
    }, [supabase]);

    const value = useMemo(() => ({
        session, user, loading, toast, route, hasCheckedInToday, reward,
        announcement, showAnnouncementModal, supabase,
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate, clearReward,
        markAnnouncementAsRead,
    }), [
        session, user, loading, toast, route, hasCheckedInToday, reward,
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