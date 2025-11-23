
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { getSupabaseClient } from '../utils/supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import { User, Announcement } from '../types';
import { calculateLevelFromXp } from '../utils/rankUtils';

declare const google: any;

type Session = any;

const getVNDateString = (date: Date) => {
    const vietnamTime = new Date(date.getTime() + 7 * 3600 * 1000);
    return vietnamTime.toISOString().split('T')[0];
};

const getRouteFromPath = (path: string): string => {
    // Tách phần path thực tế khỏi query params (vd: messages?id=1 -> messages)
    const cleanPath = path.split('?')[0]; 
    const pathSegment = cleanPath.split('/').filter(Boolean)[0];
    const validRoutes = ['tool', 'leaderboard', 'my-creations', 'settings', 'buy-credits', 'gallery', 'admin-gallery', 'profile', 'user', 'shop', 'messages'];
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
    currentPath: string; 
    reward: { diamonds: number; xp: number } | null;
    hasCheckedInToday: boolean;
    announcement: Announcement | null;
    showAnnouncementModal: boolean;
    supabase: SupabaseClient | null;
    login: () => Promise<boolean>;
    logout: () => Promise<void>;
    updateUserDiamonds: (newAmount: number) => void;
    updateUserProfile: (updates: Partial<User>) => void;
    showToast: (message: string, type: 'success' | 'error') => void;
    navigate: (path: string) => void;
    clearReward: () => void;
    markAnnouncementAsRead: () => void;
    loginWithEmail: (email: string, password: string) => Promise<boolean>;
    registerWithEmail: (email: string, password: string, displayName: string) => Promise<boolean>;
    resetPassword: (email: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    
    const [route, setRoute] = useState(() => getRouteFromPath(window.location.pathname));
    // Lưu trữ toàn bộ path bao gồm cả query params để làm key cho việc re-render
    const [currentPath, setCurrentPath] = useState(() => window.location.pathname + window.location.search);
    
    const [reward, setReward] = useState<{ diamonds: number; xp: number } | null>(null);
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);
    const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);

    const previousUserRef = useRef<User | null>(null);
    const initStarted = useRef(false);
    const visitLogged = useRef(false);

    // Calculate hasCheckedInToday using the helper function to fix unused variable error
    const hasCheckedInToday = useMemo(() => {
        if (!user?.last_check_in_at) return false;
        try {
            const today = getVNDateString(new Date());
            const lastCheckIn = getVNDateString(new Date(user.last_check_in_at));
            return today === lastCheckIn;
        } catch (e) {
            return false;
        }
    }, [user]);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(null);
        }, 4000); 
    }, []);
    
    // Hàm điều hướng mạnh mẽ hơn
    const navigate = useCallback((path: string) => {
        // 1. Xử lý đường dẫn đích
        const targetPath = path.startsWith('/') ? path : (path === 'home' ? '/' : `/${path}`);
        
        // 2. Cập nhật URL trình duyệt (quan trọng để params hoạt động)
        window.history.pushState({}, '', targetPath);
        
        // 3. Cập nhật state để React render lại đúng component
        const newRoute = getRouteFromPath(path);
        setRoute(newRoute);
        setCurrentPath(targetPath); // Cập nhật full path để trigger useEffect ở App.tsx
        
        window.scrollTo(0, 0);
    }, []);
    
    const clearReward = useCallback(() => setReward(null), []);

    useEffect(() => {
        const handlePopState = () => {
            const path = window.location.pathname + window.location.search;
            setRoute(getRouteFromPath(window.location.pathname));
            setCurrentPath(path);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // ... (Giữ nguyên các hàm logic user/auth khác không thay đổi) ...
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
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            const data = await response.json();
            if (data) {
                const profile = data as User;
                profile.level = calculateLevelFromXp(profile.xp ?? 0);
                return profile;
            }
            return null;
        } catch (error) {
            return null;
        }
    }, []);

    const fetchAndSetUser = useCallback(async (session: Session) => {
        const profile = await fetchUserProfile(session);
        if (!profile) {
            setUser(null);
            return;
        }
        // Logic fix diamonds initial
        let finalProfile = { ...profile };
        if (finalProfile.diamonds === 25) {
             try {
                const response = await fetch('/.netlify/functions/set-initial-diamonds', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.diamonds !== undefined) finalProfile.diamonds = data.diamonds;
                }
             } catch(e) {}
        }
        setUser(finalProfile);
    }, [fetchUserProfile]);
    
    useEffect(() => {
        if (initStarted.current) return;
        initStarted.current = true;

        const initialize = async () => {
            try {
                const supabaseClient = await getSupabaseClient();
                if (!supabaseClient) throw new Error("Init failed");
                setSupabase(supabaseClient);

                if (!visitLogged.current) {
                    visitLogged.current = true;
                    fetch('/.netlify/functions/log-app-visit', { method: 'POST' });
                }

                const { data: { session: currentSession } } = await (supabaseClient.auth as any).getSession();
                setSession(currentSession);
                
                if (currentSession) {
                    await fetchAndSetUser(currentSession);
                    // Xử lý route ban đầu
                    const initPath = window.location.pathname + window.location.search;
                    const initRoute = getRouteFromPath(window.location.pathname);
                    if (initRoute === 'home') {
                        navigate('tool');
                    } else {
                        setRoute(initRoute);
                        setCurrentPath(initPath);
                    }
                }

                const { data: { subscription } } = (supabaseClient.auth as any).onAuthStateChange(
                    async (_event: string, newSession: any) => {
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
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        initialize();
    }, []);
    
    // Announcement logic (giữ nguyên)
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
                } catch (e) {}
            }
        };
        checkAnnouncement();
    }, [user, session]);

    const markAnnouncementAsRead = useCallback(async () => {
        if (!announcement || !session) return;
        setShowAnnouncementModal(false); 
        updateUserProfile({ last_announcement_seen_id: announcement.id });
        try {
            await fetch('/.netlify/functions/mark-announcement-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ announcementId: announcement.id }),
            });
        } catch (e) {}
    }, [announcement, session, updateUserProfile]);

    // Reward & Activity logic (giữ nguyên)
    useEffect(() => { previousUserRef.current = user; }, [user]);
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
                    await fetch('/.netlify/functions/record-user-activity', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
                } catch (error) {}
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

    // Auth methods (giữ nguyên)
    const login = useCallback(async (): Promise<boolean> => {
        const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (!supabase || !googleClientId || typeof google === 'undefined') return false;
        const handleCredentialResponse = async (response: any) => {
            if (!response.credential) return;
            try {
                const { error } = await (supabase.auth as any).signInWithIdToken({ provider: 'google', token: response.credential });
                if (error) throw error;
            } catch (error: any) { showToast(`Đăng nhập thất bại: ${error.message}`, 'error'); }
        };
        try {
            google.accounts.id.initialize({ client_id: googleClientId, callback: handleCredentialResponse });
            google.accounts.id.prompt();
            return true;
        } catch (error) { return false; }
    }, [supabase, showToast]);

    const loginWithEmail = useCallback(async (email: string, password: string): Promise<boolean> => {
        if (!supabase) return false;
        try {
            const { error } = await (supabase.auth as any).signInWithPassword({ email, password });
            if (error) throw error;
            return true;
        } catch (error: any) { showToast(error.message, "error"); return false; }
    }, [supabase, showToast]);

    const registerWithEmail = useCallback(async (email: string, password: string, displayName: string): Promise<boolean> => {
        if (!supabase) return false;
        try {
            const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`;
            const { error } = await (supabase.auth as any).signUp({
                email, password, options: { data: { full_name: displayName, avatar_url: defaultAvatar } }
            });
            if (error) throw error;
            return true;
        } catch (error: any) { showToast(error.message, "error"); return false; }
    }, [supabase, showToast]);

    const resetPassword = useCallback(async (email: string): Promise<boolean> => {
        if (!supabase) return false;
        try {
            const { error } = await (supabase.auth as any).resetPasswordForEmail(email, { redirectTo: window.location.origin });
            if (error) throw error;
            return true;
        } catch (error: any) { showToast(error.message, "error"); return false; }
    }, [supabase, showToast]);

    const logout = useCallback(async () => {
        if (!supabase) return;
        await (supabase.auth as any).signOut();
    }, [supabase]);

    const value = useMemo(() => ({
        session, user, loading, toast, route, currentPath, hasCheckedInToday, reward,
        announcement, showAnnouncementModal, supabase,
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate, clearReward,
        markAnnouncementAsRead, loginWithEmail, registerWithEmail, resetPassword
    }), [
        session, user, loading, toast, route, currentPath, hasCheckedInToday, reward,
        announcement, showAnnouncementModal, supabase,
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate, clearReward,
        markAnnouncementAsRead, loginWithEmail, registerWithEmail, resetPassword
    ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
