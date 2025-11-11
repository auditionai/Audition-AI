import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LeaderboardUser } from '../types';
import { getRankForLevel } from '../utils/rankUtils';

const Leaderboard: React.FC = () => {
    const { showToast } = useAuth();
    const [users, setUsers] = useState<LeaderboardUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            setIsLoading(true);
            try {
                const response = await fetch('/.netlify/functions/leaderboard');
                if (!response.ok) throw new Error('Không thể tải bảng xếp hạng.');
                setUsers(await response.json());
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchLeaderboard();
    }, [showToast]);

    if (isLoading) {
        return (
            <div className="text-center p-12">
                <div className="w-12 h-12 border-4 border-yellow-400/20 border-t-yellow-400 rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-400">Đang tải bảng xếp hạng...</p>
            </div>
        );
    }
    
    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-12">
                     <h1 className="text-4xl md:text-5xl font-bold mb-4">
                        <span className="bg-gradient-to-r from-yellow-400 to-orange-500 text-transparent bg-clip-text">Bảng Xếp Hạng</span>
                    </h1>
                    <p className="text-lg text-gray-400">
                        Vinh danh những nhà sáng tạo hàng đầu của cộng đồng Audition AI.
                    </p>
                </div>
                
                <div className="space-y-3">
                    {users.map((user, index) => {
                        const rank = getRankForLevel(user.level);
                        const rankColors = ['bg-yellow-500', 'bg-gray-400', 'bg-orange-600'];
                        const rankTextColor = ['text-yellow-300', 'text-gray-300', 'text-orange-400'];

                        return (
                             <div key={user.id} className="bg-[#12121A]/80 border border-white/10 rounded-lg p-4 flex items-center gap-4 transition-all hover:bg-white/5 hover:border-pink-500/30">
                                <div className={`flex-shrink-0 w-12 h-12 text-2xl font-bold rounded-full flex items-center justify-center text-black ${rankColors[index] || 'bg-gray-700'}`}>
                                    {user.rank}
                                </div>
                                <img src={user.photo_url} alt={user.display_name} className="w-16 h-16 rounded-full" />
                                <div className="flex-grow">
                                    <p className="font-bold text-lg text-white">{user.display_name}</p>
                                    <p className={`text-sm font-semibold flex items-center gap-1 ${rank.color}`}>{rank.icon} {rank.title} - Cấp {user.level}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className={`text-xl font-bold ${rankTextColor[index] || 'text-white'}`}>{user.creations_count.toLocaleString()}</p>
                                    <p className="text-xs text-gray-400">Tác phẩm</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;
