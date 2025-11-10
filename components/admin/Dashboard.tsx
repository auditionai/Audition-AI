import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import StatCard from './StatCard';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface DashboardStats {
    totalUsers: number;
    newUsersToday: number;
    totalImages: number;
    dailyActiveUsers: number;
}

const Dashboard: React.FC = () => {
    const { session, showToast, supabase } = useAuth();
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
                if (!response.ok) throw new Error('Không thể tải dữ liệu thống kê.');
                const data = await response.json();
                setStats(data);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, [session, showToast]);

    useEffect(() => {
        if (!supabase) return;

        const channels: RealtimeChannel[] = [];

        // Listen for new users
        const usersChannel = supabase.channel('public:users')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' },
                () => {
                    setStats(currentStats => currentStats ? {
                        ...currentStats,
                        totalUsers: currentStats.totalUsers + 1,
                        newUsersToday: currentStats.newUsersToday + 1,
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
                        totalImages: currentStats.totalImages + 1,
                    } : null);
                }
            ).subscribe();
        channels.push(imagesChannel);

        // Listen for new daily active users
        const dauChannel = supabase.channel('public:daily_active_users')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_active_users' },
                () => {
                    setStats(currentStats => currentStats ? {
                        ...currentStats,
                        dailyActiveUsers: currentStats.dailyActiveUsers + 1,
                    } : null);
                }
            ).subscribe();
        channels.push(dauChannel);

        return () => {
            channels.forEach(channel => supabase.removeChannel(channel));
        };
    }, [supabase]);

    if (isLoading) {
        return (
            <div className="text-center p-8 mb-8">
                <div className="w-8 h-8 border-4 border-t-pink-400 border-white/20 rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-400">Đang tải bảng điều khiển...</p>
            </div>
        );
    }

    return (
        <div className="mb-12">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text">Bảng Điều Khiển Dữ Liệu</h2>
                <p className="text-gray-400">Thống kê thời gian thực về hoạt động của ứng dụng.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    title="Người Dùng Hoạt Động Hôm Nay"
                    value={stats?.dailyActiveUsers ?? 0}
                    icon={<i className="ph-fill ph-user-list"></i>}
                    color="cyan"
                />
                <StatCard 
                    title="Người Dùng Mới Hôm Nay"
                    value={stats?.newUsersToday ?? 0}
                    icon={<i className="ph-fill ph-user-plus"></i>}
                    color="green"
                />
                <StatCard 
                    title="Tổng Số Người Dùng"
                    value={stats?.totalUsers ?? 0}
                    icon={<i className="ph-fill ph-users"></i>}
                    color="pink"
                />
                <StatCard 
                    title="Tổng Số Ảnh Đã Tạo"
                    value={stats?.totalImages ?? 0}
                    icon={<i className="ph-fill ph-images"></i>}
                    color="purple"
                />
            </div>
        </div>
    );
};

export default Dashboard;