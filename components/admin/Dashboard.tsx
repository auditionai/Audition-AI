
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import StatCard from './StatCard';
import { DashboardStats } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';

// Extended interface for local usage
interface DetailedDashboardStats extends DashboardStats {
    detailedUsage?: Record<string, { flashCount: number; proCount: number; totalDiamonds: number }>;
}

const Dashboard: React.FC = () => {
    const { session, showToast, supabase } = useAuth();
    const { t } = useTranslation();
    const [stats, setStats] = useState<DetailedDashboardStats | null>(null);
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
            
            {/* Main Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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

            {/* Detailed Usage Table */}
            {stats?.detailedUsage && (
                <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <i className="ph-fill ph-chart-bar text-yellow-400"></i>
                        Thống Kê Chi Tiết Sử Dụng AI
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-300">
                            <thead className="text-xs text-gray-400 uppercase bg-white/5">
                                <tr>
                                    <th className="px-4 py-3 rounded-tl-lg">Tính năng</th>
                                    <th className="px-4 py-3 text-center">Flash (1💎)</th>
                                    <th className="px-4 py-3 text-center">Pro (10-20💎)</th>
                                    <th className="px-4 py-3 text-right">Tổng Kim Cương</th>
                                    <th className="px-4 py-3 text-right rounded-tr-lg">Doanh Thu (VND)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(stats.detailedUsage).map(([category, data]) => (
                                    <tr key={category} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-3 font-semibold text-white">{category}</td>
                                        <td className="px-4 py-3 text-center text-cyan-300">{data.flashCount.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center text-yellow-300">{data.proCount.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-bold text-pink-400">{data.totalDiamonds.toLocaleString()} 💎</td>
                                        <td className="px-4 py-3 text-right text-green-400">{(data.totalDiamonds * 1000).toLocaleString()} đ</td>
                                    </tr>
                                ))}
                                <tr className="bg-white/10 font-bold">
                                    <td className="px-4 py-3 text-white">TỔNG CỘNG</td>
                                    <td className="px-4 py-3 text-center">{Object.values(stats.detailedUsage).reduce((acc, curr) => acc + curr.flashCount, 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-center">{Object.values(stats.detailedUsage).reduce((acc, curr) => acc + curr.proCount, 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-pink-400">{Object.values(stats.detailedUsage).reduce((acc, curr) => acc + curr.totalDiamonds, 0).toLocaleString()} 💎</td>
                                    <td className="px-4 py-3 text-right text-green-400">{(Object.values(stats.detailedUsage).reduce((acc, curr) => acc + curr.totalDiamonds, 0) * 1000).toLocaleString()} đ</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">* Doanh thu ước tính dựa trên quy đổi 1 Kim Cương = 1.000đ. Số liệu dựa trên 5000 giao dịch gần nhất.</p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
