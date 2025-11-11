import React from 'react';
import { DashboardStats } from '../types';
import StatCard from './admin/StatCard';

interface StatsProps {
  stats: DashboardStats | null;
}

const Stats: React.FC<StatsProps> = ({ stats }) => {
  if (!stats) {
    // Show a loading or placeholder state
    return (
        <section id="stats" className="py-16 sm:py-24">
            <div className="container mx-auto px-4 text-center">
                 <div className="w-8 h-8 border-4 border-t-pink-400 border-white/20 rounded-full animate-spin mx-auto"></div>
                 <p className="mt-4 text-gray-400">Đang tải dữ liệu thời gian thực...</p>
            </div>
        </section>
    );
  }

  return (
    <section id="stats" className="py-16 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Thống Kê Thời Gian Thực</span>
          </h2>
          <p className="text-lg text-gray-400">
            Dữ liệu được cập nhật liên tục từ hoạt động của cộng đồng Audition AI.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <StatCard 
                title="Lượt truy cập (hôm nay)"
                value={stats.visitsToday}
                icon={<i className="ph-fill ph-user-list"></i>}
                color="cyan"
            />
            <StatCard 
                title="Tổng lượt truy cập"
                value={stats.totalVisits}
                icon={<i className="ph-fill ph-globe-hemisphere-west"></i>}
                color="cyan"
                isSubtle={true}
            />
            <StatCard 
                title="Người dùng mới (hôm nay)"
                value={stats.newUsersToday}
                icon={<i className="ph-fill ph-user-plus"></i>}
                color="green"
            />
            <StatCard 
                title="Tổng người dùng"
                value={stats.totalUsers}
                icon={<i className="ph-fill ph-users"></i>}
                color="green"
                isSubtle={true}
            />
            <StatCard 
                title="Ảnh tạo (hôm nay)"
                value={stats.imagesToday}
                icon={<i className="ph-fill ph-image-square"></i>}
                color="pink"
            />
            <StatCard 
                title="Tổng số ảnh"
                value={stats.totalImages}
                icon={<i className="ph-fill ph-images"></i>}
                color="pink"
                isSubtle={true}
            />
        </div>
      </div>
    </section>
  );
};

export default Stats;