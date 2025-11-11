import React, { useState, useEffect } from 'react';
import { LeaderboardUser } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getRankForLevel } from '../utils/rankUtils';
import XPProgressBar from './common/XPProgressBar';

// New component for the top 3 cards
const TopRankCard: React.FC<{ user: LeaderboardUser; rankInfo: { color: string; bgColor: string; shadow: string; icon: string } }> = ({ user, rankInfo }) => {
    const rank = getRankForLevel(user.level);
    return (
        <div className={`relative p-6 bg-gradient-to-br ${rankInfo.bgColor} border border-yellow-500/30 rounded-2xl shadow-2xl ${rankInfo.shadow} text-white flex flex-col items-center text-center interactive-3d`}>
            <div className={`absolute top-3 right-3 text-4xl opacity-80 ${rankInfo.color}`}>{rankInfo.icon}</div>
            <span className={`text-5xl font-bold ${rankInfo.color} neon-text-glow mb-4`}>{user.rank}</span>
            <img src={user.photo_url} alt={user.display_name} className="w-24 h-24 rounded-full mb-3 border-4 border-white/50" />
            <p className={`font-bold text-xl truncate ${rankInfo.color} neon-text-glow`}>{user.display_name}</p>
            <div className="flex items-center gap-2 text-sm text-yellow-100/80 mb-3">
                <span className="flex items-center gap-1.5">{rank.icon} {rank.title} - Cấp {user.level}</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 font-semibold text-lg bg-black/20 px-3 py-1 rounded-full mb-4">
                <i className="ph-fill ph-image text-pink-400"></i>
                <span>{user.creations_count} tác phẩm</span>
            </div>
            <div className="w-full mt-auto">
                <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
            </div>
        </div>
    );
};

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
    
    const topThree = leaderboard.slice(0, 3);
    const runnersUp = leaderboard.slice(3);

    const rankStyles = [
        { color: 'text-yellow-300', bgColor: 'from-amber-500/80 to-yellow-600/80', shadow: 'shadow-yellow-400/40', icon: '🥇' },
        { color: 'text-slate-200', bgColor: 'from-slate-500/80 to-gray-600/80', shadow: 'shadow-gray-400/30', icon: '🥈' },
        { color: 'text-amber-400', bgColor: 'from-amber-700/80 to-yellow-800/80', shadow: 'shadow-yellow-700/30', icon: '🥉' }
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

            {leaderboard.length === 0 ? (
                <div className="text-center py-16 bg-white/5 rounded-2xl">
                    <i className="ph-fill ph-trophy text-6xl text-gray-500"></i>
                    <h3 className="mt-4 text-2xl font-bold">Bảng xếp hạng trống</h3>
                    <p className="text-gray-400 mt-2">Hãy là người đầu tiên tạo ra tác phẩm và ghi danh!</p>
                </div>
            ) : (
                <div className="max-w-6xl mx-auto">
                    {/* Top 3 Section */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                        {topThree.map((user, index) => (
                             <TopRankCard key={user.id} user={user} rankInfo={rankStyles[index]} />
                        ))}
                    </div>

                    {/* Runners Up Section */}
                    {runnersUp.length > 0 && (
                        <div className="space-y-3">
                            {runnersUp.map((user) => {
                                const rank = getRankForLevel(user.level);
                                return (
                                    <div key={user.id} className={`p-4 bg-[#12121A]/80 border rounded-xl shadow-lg flex items-center gap-4 transition-all duration-300 interactive-3d border-white/10`}>
                                        <div className={`w-12 h-12 flex-shrink-0 flex items-center justify-center font-bold text-xl rounded-full bg-white/10`}>
                                            {user.rank}
                                        </div>
                                        <img src={user.photo_url} alt={user.display_name} className="w-14 h-14 rounded-full flex-shrink-0 border-2 border-white/20"/>
                                        <div className="flex-grow">
                                            <p className={`font-bold text-lg truncate ${rank.color} neon-text-glow`}>{user.display_name}</p>
                                            <div className="flex items-center gap-4 text-sm text-gray-400">
                                                <span className="flex items-center gap-1.5">{rank.icon} {rank.title} - Cấp {user.level}</span>
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
            )}
        </div>
    );
};

export default Leaderboard;