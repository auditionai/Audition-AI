import React, { useState, useEffect } from 'react';
import { LeaderboardUser } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getRankForLevel } from '../utils/rankUtils';
import XPProgressBar from './common/XPProgressBar';
import { useTranslation } from '../hooks/useTranslation';
import UserAvatar from './common/UserAvatar';
import UserBadge from './common/UserBadge';

const Leaderboard: React.FC = () => {
    const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { showToast } = useAuth();
    const { t } = useTranslation();

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const response = await fetch('/.netlify/functions/leaderboard');
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
    }, [showToast, t]);

    const topThree = leaderboard.slice(0, 3);
    const theRest = leaderboard.slice(3);

    // Reorder topThree for podium display: [2nd, 1st, 3rd] if possible
    const podiumOrder = topThree.length === 3 ? [topThree[1], topThree[0], topThree[2]] : topThree;


    if (isLoading) {
        return (
            <div className="text-center p-12">
                <div className="w-8 h-8 border-4 border-t-pink-400 border-white/20 rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-400">{t('creator.leaderboard.loading')}</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <div className="themed-main-title-container text-center max-w-4xl mx-auto mb-12">
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

            <div className="max-w-5xl mx-auto">
                {leaderboard.length === 0 ? (
                    <div className="text-center py-16 bg-skin-fill-secondary rounded-2xl border border-skin-border">
                         <i className="ph-fill ph-trophy text-6xl text-gray-500"></i>
                        <h3 className="mt-4 text-2xl font-bold">{t('creator.leaderboard.empty.title')}</h3>
                        <p className="text-gray-400 mt-2">{t('creator.leaderboard.empty.description')}</p>
                    </div>
                ) : (
                    <>
                        {/* Podium for Top 3 */}
                        {topThree.length > 0 && (
                            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 items-end mb-16">
                                {podiumOrder.map((user) => {
                                    const rankDetails = getRankForLevel(user.level);
                                    let rankClass = '';
                                    let rankIcon = null;
                                    let orderClass = '';
                                    let avatarSize: 'lg' | 'xl' = 'lg';

                                    if (user.rank === 1) {
                                        rankClass = 'podium-rank-1';
                                        rankIcon = <i className="ph-fill ph-crown-simple text-5xl"></i>;
                                        orderClass = 'md:order-2';
                                        avatarSize = 'xl';
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
                                            
                                            <div className="mb-4 flex flex-col items-center">
                                                <UserAvatar 
                                                    src={user.photo_url} 
                                                    alt={user.display_name} 
                                                    frameId={user.equipped_frame_id} 
                                                    size={avatarSize} 
                                                />
                                            </div>

                                            <div className="flex flex-col items-center w-full">
                                                <p className="podium-name">{user.display_name}</p>
                                                <UserBadge titleId={user.equipped_title_id} className="mb-1" />
                                            </div>

                                            <p className={`podium-level ${rankDetails.color}`}>{rankDetails.title} - {t('common.level')} {user.level}</p>
                                            <div className="podium-stats">
                                                <span><i className="ph-fill ph-image text-pink-400"></i> {user.creations_count}</span>
                                                <span><i className="ph-fill ph-star text-cyan-400"></i> {user.xp.toLocaleString()} XP</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* List for 4th onwards */}
                        {theRest.length > 0 && (
                            <div className="space-y-3">
                                {theRest.map((user) => {
                                    const rank = getRankForLevel(user.level);
                                    return (
                                        <div key={user.id} className="leaderboard-item">
                                            <div className="leaderboard-rank">{user.rank}</div>
                                            
                                            <UserAvatar 
                                                src={user.photo_url} 
                                                alt={user.display_name} 
                                                frameId={user.equipped_frame_id} 
                                                size="md"
                                                className="mr-2"
                                            />

                                            <div className="flex-grow overflow-hidden">
                                                <div className="flex items-center gap-2">
                                                    <p className={`font-bold text-lg truncate ${rank.color} neon-text-glow`}>{user.display_name}</p>
                                                    <UserBadge titleId={user.equipped_title_id} />
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-skin-muted">
                                                    <span>{t('common.level')} {user.level}</span>
                                                    <span className="flex items-center gap-1.5"><i className="ph-fill ph-image text-pink-400"></i>{user.creations_count} {t('creator.leaderboard.creations')}</span>
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
                    </>
                )}
            </div>
        </div>
    );
};

export default Leaderboard;
