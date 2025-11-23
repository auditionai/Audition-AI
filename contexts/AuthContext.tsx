
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { getSupabaseClient } from '../utils/supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import { User, Announcement } from '../types';
import { calculateLevelFromXp } from '../utils/rankUtils';

declare const google: any; // Declare the google object for Google Identity Services

// Fix: Session type from older @supabase/supabase-js might not be exported or compatible with v2 logic
type Session = any;

const getVNDateString = (date: Date) => {
    // UTC+7
    const vietnamTime = new Date(date.getTime() + 7 * 3600 * 1000);
    return vietnamTime.toISOString().split('T')[0];
};

const getRouteFromPath = (path: string): string => {
    const pathSegment = path.split('/').filter(Boolean)[0];
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
    currentPath: string; // NEW: Track full path including query params
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
    // New Email Auth Methods
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
    
    // Initial route handling
    const [route, setRoute] = useState(() => getRouteFromPath(window.location.pathname));
    const [currentPath, setCurrentPath] = useState(() => window.location.pathname + window.location.search); // Initialize with full path
    
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
    
    // FIX: Improved navigate function to be more responsive and handle query params correctly
    const navigate = useCallback((path: string) => {
        // Strip query params to get the route key (e.g., "messages?id=1" -> "messages")
        const cleanPath = path.split('?')[0];
        const baseRoute = cleanPath.split('/')[0];
        
        const targetPath = path === 'home' ? '/' : `/${path}`;
        
        // 1. Immediate State Update (Responsiveness)
        setRoute(baseRoute);
        setCurrentPath(targetPath); // Update full path to trigger effects depending on query params
        
        // 2. Update URL (Consistency)
        if (window.location.pathname + window.location.search !== targetPath) {
            window.history.pushState({}, '', targetPath);
        }
        
        // 3. Reset Scroll
        window.scrollTo(0, 0);
    }, []);
    
    const clearReward = useCallback(() => setReward(null), []);

    useEffect(() => {
        const handlePopState = () => {
            setRoute(getRouteFromPath(window.location.pathname));
            setCurrentPath(window.location.pathname + window.location.search);
        };
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
            showToast(error.message || "Không thể tải hồ sơ người dùng.", "error");
            return null;
        }
    }, [showToast]);

    const fetchAndSetUser = useCallback(async (session: Session) => {
        const profile = await fetchUserProfile(session);
        
        if (!profile) {
            console.error("CRITICAL: Server function failed to return a user profile.");
            setUser(null);
            return;
        }
        
        let finalProfile = { ...profile };

        if (finalProfile.diamonds === 25) {
             try {
                const response = await fetch('/.netlify/functions/set-initial-diamonds', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.diamonds !== undefined) {
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

                if (!visitLogged.current) {
                    visitLogged.current = true;
                    fetch('/.netlify/functions/log-app-visit', { method: 'POST' });
                }

                // Use 'any' cast to support v2 method
                const { data: { session: currentSession } } = await (supabaseClient.auth as any).getSession();
                setSession(currentSession);
                
                if (currentSession) {
                    await fetchAndSetUser(currentSession);
                    // Ensure route logic respects logged-in state
                    const currentRoute = getRouteFromPath(window.location.pathname);
                    const currentFull = window.location.pathname + window.location.search;
                    if (currentRoute === 'home') {
                        navigate('tool');
                    } else {
                        setRoute(currentRoute);
                        setCurrentPath(currentFull);
                    }
                }

                // Use 'any' cast to support v2 method
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
                console.error("CRITICAL INITIALIZATION FAILURE:", error);
                showToast(error.message, "error");
            } finally {
                setLoading(false);
            }
        };

        initialize();
    }, []);
    
    // Effect to check for new announcements
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
        setShowAnnouncementModal(false); 
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
            showToast("Chức năng đăng nhập chưa được cấu hình.", "error");
            return false;
        }

        const handleCredentialResponse = async (response: any) => {
            if (!response.credential) {
                showToast('Không nhận được thông tin đăng nhập từ Google.', 'error');
                return;
            }
            try {
                // Use 'any' cast to support v2 method
                const { error } = await (supabase.auth as any).signInWithIdToken({
                    provider: 'google',
                    token: response.credential,
                });
                if (error) throw error;
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
            showToast("Không thể hiển thị cửa sổ đăng nhập.", "error");
            return false;
        }
    }, [supabase, showToast]);

    const loginWithEmail = useCallback(async (email: string, password: string): Promise<boolean> => {
        if (!supabase) return false;
        try {
            // Use 'any' cast to support v2 method
            const { error } = await (supabase.auth as any).signInWithPassword({ email, password });
            if (error) throw error;
            return true;
        } catch (error: any) {
            showToast(error.message || "Đăng nhập thất bại.", "error");
            return false;
        }
    }, [supabase, showToast]);

    const registerWithEmail = useCallback(async (email: string, password: string, displayName: string): Promise<boolean> => {
        if (!supabase) return false;
        try {
            const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`;
            
            // Use 'any' cast to support v2 method
            const { error } = await (supabase.auth as any).signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: displayName,
                        avatar_url: defaultAvatar,
                    }
                }
            });
            if (error) throw error;
            return true;
        } catch (error: any) {
            showToast(error.message || "Đăng ký thất bại.", "error");
            return false;
        }
    }, [supabase, showToast]);

    const resetPassword = useCallback(async (email: string): Promise<boolean> => {
        if (!supabase) return false;
        try {
            // Use 'any' cast to support v2 method
            const { error } = await (supabase.auth as any).resetPasswordForEmail(email, {
                redirectTo: window.location.origin,
            });
            if (error) throw error;
            return true;
        } catch (error: any) {
            showToast(error.message || "Không thể gửi yêu cầu đặt lại mật khẩu.", "error");
            return false;
        }
    }, [supabase, showToast]);


    const logout = useCallback(async () => {
        if (!supabase) return;
        // Use 'any' cast to support v2 method
        await (supabase.auth as any).signOut();
    }, [supabase]);

    const value = useMemo(() => ({
        session, user, loading, toast, route, currentPath, hasCheckedInToday, reward,
        announcement, showAnnouncementModal, supabase,
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate, clearReward,
        markAnnouncementAsRead,
        loginWithEmail, registerWithEmail, resetPassword
    }), [
        session, user, loading, toast, route, currentPath, hasCheckedInToday, reward,
        announcement, showAnnouncementModal, supabase,
        login, logout, updateUserDiamonds, updateUserProfile, showToast, navigate, clearReward,
        markAnnouncementAsRead,
        loginWithEmail, registerWithEmail, resetPassword
    ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
