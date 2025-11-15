import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import StatCard from './StatCard';
import { DashboardStats } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';

const Dashboard: React.FC = () => {
    const { session, showToast, supabase } = useAuth();
    const { t } = useTranslation();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            if (!session) return;
            setIsLoading(true);
            try {
                const response = await fetch('/.netlify/functions/admin-dashboard-stats', {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                });
                if (!response.ok) throw new Error(t('creator.settings.admin.dashboard.error'));
                const data = await response.json();
                data.totalVisits += 1000; // Compensate for pre-tracking data
                setStats(data);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, [session, showToast, t]);

    useEffect(() => {
        if (!supabase) return;

        const channels: any[] = [];

        // Listen for new app visits
        const visitsChannel = supabase.channel('public:daily_visits')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_visits' },
                () => {
                    setStats(currentStats => currentStats ? {
                        ...currentStats,
                        visitsToday: currentStats.visitsToday + 1,
                        totalVisits: currentStats.totalVisits + 1,
                    } : null);
                }
            ).subscribe();
        channels.push(visitsChannel);

        // Listen for new users
        const usersChannel = supabase.channel('public:users')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' },
                () => {
                    setStats(currentStats => currentStats ? {
                        ...currentStats,
                        newUsersToday: currentStats.newUsersToday + 1,
                        totalUsers: currentStats.totalUsers + 1,
                    } : null);
                }
            ).subscribe();
        channels.push(usersChannel);

        // Listen for new images
        const imagesChannel = supabase.channel('public:generated_images')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'generated_images' },
                () => {
                     setStats(currentStats => currentStats ? {
                        ...currentStats,
                        imagesToday: currentStats.imagesToday + 1,
                        totalImages: currentStats.totalImages + 1,
                    } : null);
                }
            ).subscribe();
        channels.push(imagesChannel);

        return () => {
            channels.forEach(channel => supabase.removeChannel(channel));
        };
    }, [supabase]);

    if (isLoading) {
        return (
            <div className="text-center p-8 mb-8">
                <div className="w-8 h-8 border-4 border-t-pink-400 border-white/20 rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-400">{t('creator.settings.admin.dashboard.loading')}</p>
            </div>
        );
    }

    return (
        <div className="mb-12">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text">{t('creator.settings.admin.dashboard.title')}</h2>
                <p className="text-gray-400">{t('creator.settings.admin.dashboard.description')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard 
                    title={t('landing.stats.visitsToday')}
                    value={stats?.visitsToday ?? 0}
                    icon={<i className="ph-fill ph-user-list"></i>}
                    color="cyan"
                />
                <StatCard 
                    title={t('landing.stats.totalVisits')}
                    value={stats?.totalVisits ?? 0}
                    icon={<i className="ph-fill ph-globe-hemisphere-west"></i>}
                    color="cyan"
                    isSubtle={true}
                />
                 <StatCard 
                    title={t('landing.stats.newUsersToday')}
                    value={stats?.newUsersToday ?? 0}
                    icon={<i className="ph-fill ph-user-plus"></i>}
                    color="green"
                />
                <StatCard 
                    title={t('landing.stats.totalUsers')}
                    value={stats?.totalUsers ?? 0}
                    icon={<i className="ph-fill ph-users"></i>}
                    color="green"
                    isSubtle={true}
                />
                 <StatCard 
                    title={t('landing.stats.imagesToday')}
                    value={stats?.imagesToday ?? 0}
                    icon={<i className="ph-fill ph-image-square"></i>}
                    color="pink"
                />
                <StatCard 
                    title={t('landing.stats.totalImages')}
                    value={stats?.totalImages ?? 0}
                    icon={<i className="ph-fill ph-images"></i>}
                    color="pink"
                    isSubtle={true}
                />
            </div>
        </div>
    );
};

export default Dashboard;