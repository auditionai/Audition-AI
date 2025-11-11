
import React, { useState, useEffect } from 'react';
import { LeaderboardUser } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getRankForLevel } from '../utils/rankUtils';
import XPProgressBar from './common/XPProgressBar';

const Leaderboard: React.FC = () => {
    const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { showToast } = useAuth();

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const response = await fetch('/.netlify/functions/leaderboard');
                if (!response.ok) throw new Error('Không thể tải bảng xếp hạng.');
                const data = await response.json();
                setLeaderboard(data);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchLeaderboard();
    }, [showToast]);

    const rankColors = [
        'bg-gradient-to-br from-amber-400 to-yellow-500 text-black shadow-yellow-400/40', // 1st
        'bg-gradient-to-br from-slate-300 to-gray-400 text-black shadow-gray-400/40',    // 2nd
        'bg-gradient-to-br from-amber-600 to-yellow-700 text-white shadow-yellow-700/40' // 3rd
    ];

    if (isLoading) {
        return <div className="text-center p-12">Đang tải bảng xếp hạng...</div>;
    }

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <div className="text-center max-w-2xl mx-auto mb-12">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 text-transparent bg-clip-text">Bảng Xếp Hạng Sáng Tạo</h1>
                <p className="text-lg text-gray-400">Vinh danh những nhà sáng tạo hàng đầu dựa trên số lượng tác phẩm đã tạo.</p>
            </div>

            <div className="max-w-4xl mx-auto">
                {leaderboard.length === 0 ? (
                    <div className="text-center py-16 bg-white/5 rounded-2xl">
                         <i className="ph-fill ph-trophy text-6xl text-gray-500"></i>
                        <h3 className="mt-4 text-2xl font-bold">Bảng xếp hạng trống</h3>
                        <p className="text-gray-400 mt-2">Hãy là người đầu tiên tạo ra tác phẩm và ghi danh!</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {leaderboard.map((user, index) => {
                            const rank = getRankForLevel(user.level);
                            return (
                                <div key={user.id} className={`p-4 bg-[#12121A]/80 border rounded-xl shadow-lg flex items-center gap-4 transition-all duration-300 interactive-3d ${index < 3 ? 'border-yellow-500/30' : 'border-white/10'}`}>
                                    <div className={`w-12 h-12 flex-shrink-0 flex items-center justify-center font-bold text-xl rounded-full ${rankColors[index] || 'bg-white/10'}`}>
                                        {user.rank}
                                    </div>
                                    <img src={user.photo_url} alt={user.display_name} className="w-14 h-14 rounded-full flex-shrink-0 border-2 border-white/20"/>
                                    <div className="flex-grow">
                                        <p className={`font-bold text-lg truncate ${rank.color} neon-text-glow`}>{user.display_name}</p>
                                        <div className="flex items-center gap-4 text-sm text-gray-400">
                                            <span>Cấp {user.level}</span>
                                            <span className="flex items-center gap-1.5"><i className="ph-fill ph-image text-pink-400"></i>{user.creations_count} tác phẩm</span>
                                        </div>
                                    </div>
                                    <div className="hidden md:block w-1/3">
                                        <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Leaderboard;
