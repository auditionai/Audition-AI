
import React, { useState, useEffect } from 'react';
import { LeaderboardUser } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getRankForLevel } from '../utils/rankUtils';
import XPProgressBar from './common/XPProgressBar';
import { useTranslation } from '../hooks/useTranslation';
import UserAvatar from './common/UserAvatar';
import UserBadge from './common/UserBadge';

const Leaderboard: React.FC = () => {
    const [leaderboard, setLeaderboard] = useState<any[]>([]); 
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'level' | 'weekly'>('level');
    const { showToast } = useAuth();
    const { t } = useTranslation();

    useEffect(() => {
        const fetchLeaderboard = async () => {
            setIsLoading(true);
            try {
                let url = '/.netlify/functions/leaderboard';
                if (activeTab === 'weekly') {
                    url += '?type=weekly';
                }
                
                const response = await fetch(url);
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

    // Reorder topThree for podium display: [2nd, 1st, 3rd]
    const podiumOrder = topThree.length === 3 ? [topThree[1], topThree[0], topThree[2]] : topThree;

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <div className="themed-main-title-container text-center max-w-4xl mx-auto mb-8">
                <h1 
                    className="themed-main-title text-4xl md:text-5xl font-black mb-4 leading-tight"
                    data-text={t('creator.leaderboard.title')}
                >
                    {t('creator.leaderboard.title')}
                </h1>
                <p className="themed-main-subtitle text-lg md:text-xl max-w-2xl mx-auto">
                    {t('creator.leaderboard.description')}
                </p>
            </div>

            {/* Tabs */}
            <div className="flex justify-center gap-4 mb-12">
                <button 
                    onClick={() => setActiveTab('level')}
                    className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === 'level' ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/30' : 'bg-skin-fill-secondary text-skin-muted hover:bg-white/10'}`}
                >
                    <i className="ph-fill ph-star mr-2"></i> Đại Gia Cấp Độ
                </button>
                <button 
                    onClick={() => setActiveTab('weekly')}
                    className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === 'weekly' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30' : 'bg-skin-fill-secondary text-skin-muted hover:bg-white/10'}`}
                >
                    <i className="ph-fill ph-fire mr-2"></i> Ngôi Sao Tuần
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
                                <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 items-end mb-16">
                                    {podiumOrder.map((user) => {
                                        const rankDetails = getRankForLevel(user.level);
                                        let rankClass = '';
                                        let rankIcon = null;
                                        let orderClass = '';

                                        if (user.rank === 1) {
                                            rankClass = 'podium-rank-1';
                                            rankIcon = <i className="ph-fill ph-crown-simple text-5xl"></i>;
                                            orderClass = 'md:order-2';
                                        } else if (user.rank === 2) {
                                            rankClass = 'podium-rank-2';
                                            orderClass = 'md:order-1';
                                        } else {
                                            rankClass = 'podium-rank-3';
                                            orderClass = 'md:order-3';
                                        }

                                        return (
                                            <div key={user.id} className={`podium-card ${rankClass} ${orderClass}`}>
                                                <div className="podium-rank-icon">{rankIcon}</div>
                                                <div className="podium-rank-number">{user.rank}</div>
                                                <div className="mb-4">
                                                    <UserAvatar url={user.photo_url} alt={user.display_name} frameId={user.equipped_frame_id} level={user.level} size="lg" />
                                                </div>
                                                <p className="podium-name">{user.display_name}</p>
                                                <UserBadge titleId={user.equipped_title_id} level={user.level} className="mb-2" />
                                                
                                                {/* Conditional Stats based on Tab */}
                                                {activeTab === 'level' ? (
                                                    <>
                                                        <p className={`podium-level ${rankDetails.color}`}>{rankDetails.title} - Lv.{user.level}</p>
                                                        <div className="podium-stats">
                                                            <span><i className="ph-fill ph-image text-pink-400"></i> {user.creations_count}</span>
                                                            <span><i className="ph-fill ph-star text-cyan-400"></i> {user.xp.toLocaleString()} XP</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-yellow-400 font-black text-lg">{user.weekly_points.toLocaleString()} Điểm</p>
                                                        <p className="text-xs text-skin-muted mt-1">HOT Tuần</p>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* List */}
                            {theRest.length > 0 && (
                                <div className="space-y-3">
                                    {theRest.map((user) => {
                                        const rank = getRankForLevel(user.level);
                                        return (
                                            <div key={user.id} className="leaderboard-item">
                                                <div className="leaderboard-rank">{user.rank}</div>
                                                <UserAvatar url={user.photo_url} alt={user.display_name} frameId={user.equipped_frame_id} level={user.level} size="md" />
                                                <div className="flex-grow">
                                                    <div className="flex items-center gap-2">
                                                        <p className={`font-bold text-lg truncate ${rank.color} neon-text-glow`}>{user.display_name}</p>
                                                        <UserBadge titleId={user.equipped_title_id} level={user.level} />
                                                    </div>
                                                    {activeTab === 'level' ? (
                                                        <div className="flex items-center gap-4 text-sm text-skin-muted">
                                                            <span>{t('common.level')} {user.level}</span>
                                                            <span className="flex items-center gap-1.5"><i className="ph-fill ph-image text-pink-400"></i>{user.creations_count} {t('creator.leaderboard.creations')}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-yellow-400 font-bold">
                                                            <i className="ph-fill ph-fire"></i> {user.weekly_points.toLocaleString()} Điểm HOT
                                                        </div>
                                                    )}
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
