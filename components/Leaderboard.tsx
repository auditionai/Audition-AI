import React, { useState, useEffect } from 'react';
// Fix: Add .ts/.tsx extensions to module imports.
import { getRankForLevel } from '../utils/rankUtils.ts';
import { LeaderboardUser } from '../types.ts';
import { useAuth } from '../contexts/AuthContext.tsx';


const PodiumItem: React.FC<{ user: LeaderboardUser, rankNum: number }> = ({ user, rankNum }) => {
    const rankData = getRankForLevel(user.level);
    const rankStyles = {
        1: { borderColor: 'border-yellow-400', bgColor: 'bg-yellow-500/10', textColor: 'text-yellow-400', height: 'h-48' },
        2: { borderColor: 'border-slate-400', bgColor: 'bg-slate-500/10', textColor: 'text-slate-400', height: 'h-40' },
        3: { borderColor: 'border-amber-600', bgColor: 'bg-amber-600/10', textColor: 'text-amber-500', height: 'h-40' },
    }[rankNum] || {};

    return (
        <div className={`w-1/3 flex flex-col items-center justify-end px-2 ${rankNum === 1 ? 'self-end mb-4' : 'self-end'}`}>
            <i className={`ph-fill ph-crown-simple ${rankStyles.textColor} text-4xl mb-2`} style={{ animation: 'crown-glow 3s infinite' }}></i>
            <img src={user.photo_url} alt={user.display_name} className={`w-20 h-20 rounded-full border-4 ${rankStyles.borderColor} mb-2`}/>
            <div className={`p-4 rounded-t-xl w-full text-center ${rankStyles.bgColor} ${rankStyles.height}`}>
                <p className={`font-bold text-lg truncate neon-text-glow ${rankData.color}`}>{user.display_name}</p>
                <p className={`text-xs font-semibold flex items-center justify-center gap-1.5 ${rankData.color}`}>{rankData.icon} {rankData.title}</p>
                <p className={`font-extrabold text-4xl mt-1 ${rankStyles.textColor}`}>{user.rank}</p>
                 <div className="flex items-center justify-center gap-2 font-bold text-lg mt-2 text-white">
                   <i className="ph-fill ph-image text-pink-400"></i>
                   <span>{user.creations_count}</span>
                </div>
            </div>
        </div>
    )
}

const Leaderboard: React.FC = () => {
    const [users, setUsers] = useState<LeaderboardUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { showToast } = useAuth();

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const response = await fetch('/.netlify/functions/leaderboard');
                if (!response.ok) throw new Error('Không thể tải bảng xếp hạng.');
                const data = await response.json();
                setUsers(data);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchLeaderboard();
    }, [showToast]);

    if (isLoading) return <div className="text-center p-12">Đang tải bảng xếp hạng...</div>;
    if (users.length === 0) return <div className="text-center p-12">Chưa có dữ liệu xếp hạng.</div>;

    const top3 = users.slice(0, 3);
    const rest = users.slice(3);

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <div className="text-center max-w-2xl mx-auto mb-12">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 text-transparent bg-clip-text">Bảng Xếp Hạng Sáng Tạo</h1>
                <p className="text-lg text-gray-400">Vinh danh những nhà sáng tạo hàng đầu trong cộng đồng Audition AI.</p>
            </div>
            
            {top3.length >= 3 && (
                <div className="max-w-3xl mx-auto flex items-end justify-center h-64 mb-12 mt-28">
                    <PodiumItem user={top3[1]} rankNum={2} />
                    <PodiumItem user={top3[0]} rankNum={1} />
                    <PodiumItem user={top3[2]} rankNum={3} />
                </div>
            )}

            {rest.length > 0 && (
                <div className="max-w-3xl mx-auto bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg overflow-hidden">
                    <div className="p-4 bg-white/5">
                        <div className="grid grid-cols-12 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            <div className="col-span-1 text-center">Hạng</div>
                            <div className="col-span-7">Creator</div>
                            <div className="col-span-4 text-right">Số ảnh đã tạo</div>
                        </div>
                    </div>
                    <ul className="divide-y divide-white/10">
                        {rest.map((user) => {
                            const rankData = getRankForLevel(user.level);
                            return (
                                <li key={user.rank} className="p-4 grid grid-cols-12 items-center transition-colors hover:bg-white/5">
                                    <div className="col-span-1 text-center font-bold text-lg text-gray-300">{user.rank}</div>
                                    <div className="col-span-7">
                                        <div className="flex items-center gap-4">
                                            <img src={user.photo_url} alt={user.display_name} className="w-10 h-10 rounded-full" />
                                            <div>
                                            <span className={`font-semibold neon-text-glow ${rankData.color}`}>{user.display_name}</span>
                                            <p className={`text-xs flex items-center gap-1.5 ${rankData.color}`}>{rankData.icon}{rankData.title}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-span-4 text-right">
                                        <div className="flex items-center justify-end gap-2 font-bold text-lg text-white">
                                        <i className="ph-fill ph-image text-pink-400"></i>
                                        <span>{user.creations_count}</span>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default Leaderboard;