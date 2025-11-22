
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getRankForLevel } from '../utils/rankUtils';
import XPProgressBar from './common/XPProgressBar';
import { useTranslation } from '../hooks/useTranslation';
import UserAvatar from './common/UserAvatar';
import UserBadge from './common/UserBadge';
import UserName from './common/UserName'; // Import UserName

type LeaderboardType = 'creation' | 'level' | 'tycoon' | 'hot';

const Leaderboard: React.FC = () => {
    const [leaderboard, setLeaderboard] = useState<any[]>([]); 
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<LeaderboardType>('creation');
    const { showToast, navigate } = useAuth();
    const { t } = useTranslation();

    useEffect(() => {
        const fetchLeaderboard = async () => {
            setIsLoading(true);
            setLeaderboard([]); 
            try {
                const response = await fetch(`/.netlify/functions/leaderboard?type=${activeTab}`);
                if (!response.ok) throw new Error(t('creator.leaderboard.error.load'));
                const data = await response.json();
                setLeaderboard(data);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchLeaderboard();
    }, [showToast, t, activeTab]);

    const topThree = leaderboard.slice(0, 3);
    const theRest = leaderboard.slice(3);
    
    // Reorder for desktop: 2, 1, 3. Keep standard array for mobile manual mapping
    const desktopPodiumOrder = topThree.length === 3 ? [topThree[1], topThree[0], topThree[2]] : topThree;

    const getMetricLabel = (value: number) => {
        return t(`creator.leaderboard.metric.${activeTab}`, { value: value.toLocaleString() });
    };

    const handleUserClick = (userId: string) => {
        if (userId) navigate(`user/${userId}`);
    };

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <div className="themed-main-title-container text-center max-w-4xl mx-auto mb-8">
                <h1 
                    className="themed-main-title text-3xl md:text-5xl font-black mb-2 md:mb-4 leading-tight"
                    data-text={t('creator.leaderboard.title')}
                >
                    {t('creator.leaderboard.title')}
                </h1>
                <p className="themed-main-subtitle text-sm md:text-xl max-w-2xl mx-auto">
                    {t('creator.leaderboard.description')}
                </p>
            </div>

            {/* Tabs */}
            <div className="flex justify-center gap-2 mb-8 md:mb-12 flex-wrap">
                <button 
                    onClick={() => setActiveTab('creation')}
                    className={`px-4 py-2 rounded-full font-bold transition-all text-xs md:text-base ${activeTab === 'creation' ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/30' : 'bg-skin-fill-secondary text-skin-muted hover:bg-white/10'}`}
                >
                    <i className="ph-fill ph-image mr-2"></i> {t('creator.leaderboard.tabs.creation')}
                </button>
                <button 
                    onClick={() => setActiveTab('level')}
                    className={`px-4 py-2 rounded-full font-bold transition-all text-xs md:text-base ${activeTab === 'level' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-skin-fill-secondary text-skin-muted hover:bg-white/10'}`}
                >
                    <i className="ph-fill ph-star mr-2"></i> {t('creator.leaderboard.tabs.level')}
                </button>
                <button 
                    onClick={() => setActiveTab('tycoon')}
                    className={`px-4 py-2 rounded-full font-bold transition-all text-xs md:text-base ${activeTab === 'tycoon' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30' : 'bg-skin-fill-secondary text-skin-muted hover:bg-white/10'}`}
                >
                    <i className="ph-fill ph-crown mr-2"></i> {t('creator.leaderboard.tabs.tycoon')}
                </button>
                <button 
                    onClick={() => setActiveTab('hot')}
                    className={`px-4 py-2 rounded-full font-bold transition-all text-xs md:text-base ${activeTab === 'hot' ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-skin-fill-secondary text-skin-muted hover:bg-white/10'}`}
                >
                    <i className="ph-fill ph-fire mr-2"></i> {t('creator.leaderboard.tabs.hot')}
                </button>
            </div>

            {isLoading ? (
                <div className="text-center p-12">
                    <div className="w-8 h-8 border-4 border-t-pink-400 border-white/20 rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-gray-400">{t('creator.leaderboard.loading')}</p>
                </div>
            ) : (
                <div className="max-w-5xl mx-auto">
                    {leaderboard.length === 0 ? (
                        <div className="text-center py-16 bg-skin-fill-secondary rounded-2xl border border-skin-border">
                             <i className="ph-fill ph-trophy text-6xl text-gray-500"></i>
                            <h3 className="mt-4 text-2xl font-bold">{t('creator.leaderboard.empty.title')}</h3>
                            <p className="text-gray-400 mt-2">{t('creator.leaderboard.empty.description')}</p>
                        </div>
                    ) : (
                        <>
                            {/* Podium */}
                            {topThree.length > 0 && (
                                <div className="mb-12">
                                    {/* Mobile Podium Layout (Redesigned without heavy blocks) */}
                                    <div className="md:hidden mb-8 relative">
                                        {/* Background glow effect for the podium area */}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-32 bg-pink-500/10 blur-3xl rounded-full pointer-events-none"></div>
                                        
                                        <div className="flex items-end justify-center pb-4 relative z-10">
                                            {/* Rank 2 */}
                                            {topThree[1] && (
                                                <div className="flex flex-col items-center w-1/3 cursor-pointer mb-0 transform translate-x-2" onClick={() => handleUserClick(topThree[1].id)}>
                                                    <div className="relative mb-2">
                                                        <UserAvatar url={topThree[1].photo_url} alt="" frameId={topThree[1].equipped_frame_id} level={topThree[1].level} size="md" className="shadow-lg shadow-blue-500/20" />
                                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gray-300 text-black font-bold text-[10px] px-2 py-0.5 rounded-full border border-white shadow-sm">#2</div>
                                                    </div>
                                                    <p className="font-bold text-xs text-center truncate w-full px-1 text-gray-300"><UserName user={topThree[1]} /></p>
                                                    <p className="text-[10px] text-blue-400 font-bold">{topThree[1].metric_value.toLocaleString()}</p>
                                                </div>
                                            )}
                                            
                                            {/* Rank 1 */}
                                            {topThree[0] && (
                                                <div className="flex flex-col items-center w-1/3 -mt-6 z-10 cursor-pointer mb-8" onClick={() => handleUserClick(topThree[0].id)}>
                                                    <i className="ph-fill ph-crown text-yellow-400 text-3xl mb-1 animate-bounce drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]"></i>
                                                    <div className="relative mb-2">
                                                        <UserAvatar url={topThree[0].photo_url} alt="" frameId={topThree[0].equipped_frame_id} level={topThree[0].level} size="lg" className="ring-2 ring-yellow-400 ring-offset-2 ring-offset-black shadow-xl shadow-yellow-500/30" />
                                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-yellow-400 text-black font-black text-xs px-3 py-0.5 rounded-full border border-white shadow-md">#1</div>
                                                    </div>
                                                    <p className="font-bold text-sm text-center truncate w-full px-1 text-yellow-300"><UserName user={topThree[0]} /></p>
                                                    <p className="text-xs text-yellow-400 font-black mt-0.5 bg-yellow-500/10 px-2 rounded">{topThree[0].metric_value.toLocaleString()}</p>
                                                </div>
                                            )}

                                            {/* Rank 3 */}
                                            {topThree[2] && (
                                                <div className="flex flex-col items-center w-1/3 cursor-pointer mb-0 transform -translate-x-2" onClick={() => handleUserClick(topThree[2].id)}>
                                                    <div className="relative mb-2">
                                                        <UserAvatar url={topThree[2].photo_url} alt="" frameId={topThree[2].equipped_frame_id} level={topThree[2].level} size="md" className="shadow-lg shadow-orange-500/20" />
                                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-orange-700 text-white font-bold text-[10px] px-2 py-0.5 rounded-full border border-white shadow-sm">#3</div>
                                                    </div>
                                                    <p className="font-bold text-xs text-center truncate w-full px-1 text-orange-300"><UserName user={topThree[2]} /></p>
                                                    <p className="text-[10px] text-orange-400 font-bold">{topThree[2].metric_value.toLocaleString()}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Desktop Podium Layout */}
                                    <div className="hidden md:grid grid-cols-3 gap-8 items-end">
                                        {desktopPodiumOrder.map((user, idx) => {
                                            const rankDetails = getRankForLevel(user.level);
                                            let rankClass = '';
                                            let rankIcon = null;
                                            let orderClass = '';

                                            if (user.rank === 1) {
                                                rankClass = 'podium-rank-1';
                                                rankIcon = <i className="ph-fill ph-crown-simple text-5xl"></i>;
                                                orderClass = 'order-2';
                                            } else if (user.rank === 2) {
                                                rankClass = 'podium-rank-2';
                                                orderClass = 'order-1';
                                            } else {
                                                rankClass = 'podium-rank-3';
                                                orderClass = 'order-3';
                                            }

                                            return (
                                                <div key={`${activeTab}-podium-${user.id}-${idx}`} className={`podium-card ${rankClass} ${orderClass} cursor-pointer transition-transform hover:-translate-y-2`} onClick={() => handleUserClick(user.id)}>
                                                    <div className="podium-rank-icon">{rankIcon}</div>
                                                    <div className="podium-rank-number">{user.rank}</div>
                                                    <div className="mb-4">
                                                        <UserAvatar url={user.photo_url} alt={user.display_name} frameId={user.equipped_frame_id} level={user.level} size="lg" />
                                                    </div>
                                                    <p className="podium-name hover:underline">
                                                        <UserName user={user} />
                                                    </p>
                                                    <UserBadge titleId={user.equipped_title_id} level={user.level} className="mb-2" />
                                                    <p className="text-yellow-400 font-black text-lg">{getMetricLabel(user.metric_value)}</p>
                                                    <p className={`podium-level ${rankDetails.color} text-xs mt-1`}>{rankDetails.title} - Lv.{user.level}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* List */}
                            {theRest.length > 0 && (
                                <div className="space-y-2 md:space-y-3 bg-black/20 p-2 md:p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
                                    {theRest.map((user, idx) => {
                                        const rank = getRankForLevel(user.level);
                                        return (
                                            <div key={`${activeTab}-list-${user.id}-${idx}`} className="leaderboard-item cursor-pointer hover:bg-white/10 p-2 md:p-3 rounded-xl flex items-center gap-3 md:gap-4 transition-colors bg-skin-fill-secondary border border-transparent" onClick={() => handleUserClick(user.id)}>
                                                <div className="leaderboard-rank text-sm md:text-lg text-gray-500 font-mono w-6 text-center">{user.rank}</div>
                                                <UserAvatar url={user.photo_url} alt={user.display_name} frameId={user.equipped_frame_id} level={user.level} size="sm" className="md:w-12 md:h-12" />
                                                <div className="flex-grow min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <div className={`font-bold text-sm md:text-lg truncate ${rank.color} neon-text-glow hover:underline`}>
                                                            <UserName user={user} />
                                                        </div>
                                                        <UserBadge titleId={user.equipped_title_id} level={user.level} className="hidden md:inline-flex scale-75 origin-left" />
                                                    </div>
                                                    <div className="flex items-center gap-2 text-yellow-400 font-bold text-xs md:text-sm">
                                                        {getMetricLabel(user.metric_value)}
                                                    </div>
                                                </div>
                                                {activeTab === 'level' && (
                                                    <div className="hidden md:block w-1/3">
                                                        <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default Leaderboard;
