
import React, { useState, useEffect } from 'react';
import Modal from './common/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { LuckyWheelReward } from '../types';

interface LuckyWheelModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const LuckyWheelModal: React.FC<LuckyWheelModalProps> = ({ isOpen, onClose }) => {
    const { user, session, showToast, updateUserProfile } = useAuth();
    const { t } = useTranslation();
    const [rewards, setRewards] = useState<LuckyWheelReward[]>([]);
    const [isSpinning, setIsSpinning] = useState(false);
    const [tickets, setTickets] = useState(0);
    const [rotation, setRotation] = useState(0);
    const [canClaimDaily, setCanClaimDaily] = useState(false);
    const [winningReward, setWinningReward] = useState<LuckyWheelReward | null>(null);
    
    // Fetch Config & User Status
    useEffect(() => {
        if (isOpen && session) {
            const fetchData = async () => {
                try {
                    const res = await fetch('/.netlify/functions/lucky-wheel', {
                        headers: { Authorization: `Bearer ${session.access_token}` }
                    });
                    if (!res.ok) throw new Error('Failed to load wheel data');
                    const data = await res.json();
                    setRewards(data.rewards || []);
                    setTickets(data.tickets || 0);
                    setCanClaimDaily(data.canClaimDaily);
                } catch (e) {
                    console.error(e);
                }
            };
            fetchData();
        }
    }, [isOpen, session]);

    const handleSpin = async () => {
        if (tickets <= 0) {
            showToast(t('luckyWheel.win.lucky') || 'Bạn đã hết vé quay!', 'error');
            return;
        }
        if (isSpinning) return;

        setIsSpinning(true);
        setWinningReward(null);

        try {
            // Call API to get result
            const res = await fetch('/.netlify/functions/lucky-wheel', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            const result = await res.json();
            
            if (!res.ok) {
                throw new Error(result.error);
            }

            // Calculate rotation
            const count = rewards.length;
            const segmentAngle = 360 / count;
            const targetIndex = result.rewardIndex;
            
            // Target position in the circle
            const segmentCenterAngle = (targetIndex * segmentAngle) + (segmentAngle / 2);
            
            // Spins: Add random full rotations
            const spins = 5; 
            const totalDegrees = (360 * spins) + (360 - segmentCenterAngle);
            
            // Current rotation modulo 360 to keep track
            const currentRotationMod = rotation % 360;
            
            const finalRotation = rotation + totalDegrees + ((360 - currentRotationMod) % 360);

            setRotation(finalRotation);
            
            // Wait for animation
            setTimeout(() => {
                setIsSpinning(false);
                setWinningReward(result.reward);
                setTickets(result.remainingTickets);
                updateUserProfile({ diamonds: result.newDiamondCount, xp: result.newXp });
                
            }, 5000); // 5s animation

        } catch (e: any) {
            showToast(e.message, 'error');
            setIsSpinning(false);
        }
    };

    const handleClaimDaily = async () => {
        try {
            const res = await fetch('/.netlify/functions/lucky-wheel?action=daily', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setTickets(data.tickets);
                setCanClaimDaily(false);
                showToast(t('luckyWheel.claimed'), 'success');
            } else {
                showToast(data.error, 'error');
            }
        } catch (e) { console.error(e); }
    };

    const handleTask = async (taskType: 'share_app' | 'share_image') => {
        if (taskType === 'share_app') {
             const url = encodeURIComponent(window.location.origin);
             window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
        }
        
        try {
            const res = await fetch('/.netlify/functions/task-reward', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskType })
            });
            const data = await res.json();
            if (res.ok) {
                setTickets(data.tickets);
                showToast('Đã nhận thêm vé quay!', 'success');
            } else {
                console.log(data.error);
            }
        } catch (e) { console.error(e); }
    };

    const getTrans = (key: string) => {
        const text = t(key);
        return text === key ? key.split('.').pop() : text;
    }

    // Helper to get localized label for wheel segments
    const getRewardLabel = (reward: LuckyWheelReward) => {
        switch (reward.type) {
            case 'diamond': return t('luckyWheel.win.diamond_short');
            case 'xp': return 'XP';
            case 'ticket': return t('luckyWheel.win.ticket_short');
            case 'lucky': return t('luckyWheel.win.lucky_short');
            default: return reward.label;
        }
    };

    if (!isOpen) return null;

    // Generate wheel segments style
    const wheelSegments = rewards.map((r, i) => {
        const count = rewards.length;
        const angle = 360 / count;
        const rotate = i * angle;
        
        // Use conic-gradient logic for background colors
        return { ...r, rotate, angle };
    });

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('luckyWheel.title')}>
            <div className="flex flex-col lg:flex-row gap-8 items-center justify-center lg:min-w-[800px] min-h-[500px] p-4">
                
                {/* --- LEFT: THE WHEEL --- */}
                <div className="relative w-[340px] h-[340px] sm:w-[400px] sm:h-[400px] flex-shrink-0 select-none">
                    
                    {/* Glow Behind */}
                    <div className="absolute inset-0 bg-gradient-to-r from-pink-500/30 to-purple-500/30 rounded-full blur-3xl animate-pulse"></div>

                    {/* Pointer (Custom SVG for better visibility) */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-30 drop-shadow-2xl filter">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
                            <path d="M12 22L4 4H20L12 22Z" fill="#FBBF24" stroke="#FFF" strokeWidth="2" strokeLinejoin="round"/>
                            <circle cx="12" cy="4" r="2" fill="#FFF"/>
                        </svg>
                    </div>
                    
                    {/* Wheel Container */}
                    <div className="lucky-wheel-container w-full h-full relative" style={{
                        transform: `rotate(${rotation}deg)`,
                        transition: isSpinning ? 'transform 5s cubic-bezier(0.25, 0.1, 0.25, 1)' : 'none'
                    }}>
                        {/* Render Segments using Conic Gradient for Backgrounds */}
                        <div className="absolute inset-0 w-full h-full rounded-full" style={{
                            background: `conic-gradient(${
                                rewards.map((r, i) => {
                                    const start = (i * 360) / rewards.length;
                                    const end = ((i + 1) * 360) / rewards.length;
                                    // Fallback colors if not defined
                                    const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
                                    const color = r.color && r.color !== '#FF0000' ? r.color : colors[i % colors.length];
                                    return `${color} ${start}deg ${end}deg`;
                                }).join(', ')
                            })`
                        }}></div>

                        {/* Render Content (Text/Icons) */}
                        {wheelSegments.map((item) => { 
                            const rotation = item.rotate + (item.angle / 2); // Center of the slice
                            return (
                                <div 
                                    key={item.id} 
                                    className="absolute w-full h-full top-0 left-0 flex justify-center"
                                    style={{ 
                                        transform: `rotate(${rotation}deg)`,
                                        pointerEvents: 'none'
                                    }}
                                >
                                    {/* Content Container - Pushed to OUTER RIM */}
                                    <div className="absolute top-4 sm:top-6 flex flex-col items-center gap-0.5">
                                        <span className="text-white font-black text-sm sm:text-base uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] max-w-[80px] text-center leading-tight break-words px-1">
                                            {getRewardLabel(item)}
                                        </span>
                                        
                                        <div className="p-1">
                                            {item.type === 'diamond' && <i className="ph-fill ph-diamonds-four text-2xl text-white drop-shadow-md"></i>}
                                            {item.type === 'xp' && <i className="ph-fill ph-star text-2xl text-yellow-200 drop-shadow-md"></i>}
                                            {item.type === 'ticket' && <i className="ph-fill ph-ticket text-2xl text-green-200 drop-shadow-md"></i>}
                                            {item.type === 'lucky' && <i className="ph-fill ph-clover text-2xl text-white drop-shadow-md"></i>}
                                        </div>
                                        
                                        {item.amount > 0 && (
                                            <span className="text-xs sm:text-sm font-black text-yellow-300 drop-shadow-md bg-black/40 px-2 rounded-full">x{item.amount}</span>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Center Hub Button */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full z-20 flex items-center justify-center">
                        <div className="absolute inset-0 bg-white rounded-full animate-ping opacity-20"></div>
                        <button 
                            onClick={handleSpin}
                            disabled={isSpinning || tickets <= 0}
                            className="relative w-full h-full bg-gradient-to-br from-yellow-400 to-orange-600 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.8)] border-4 border-white flex items-center justify-center group transition-transform active:scale-95 disabled:opacity-80 disabled:cursor-not-allowed"
                        >
                            <span className="text-white font-black text-sm uppercase text-center leading-tight drop-shadow-md group-hover:scale-110 transition-transform">
                                {isSpinning ? '...' : getTrans('luckyWheel.spin')}
                            </span>
                        </button>
                    </div>
                </div>

                {/* --- RIGHT: CONTROLS & TASKS --- */}
                <div className="flex-grow w-full max-w-md flex flex-col gap-4">
                    
                    {/* Ticket Counter */}
                    <div className="bg-[#1e1b25] border border-yellow-500/30 rounded-2xl p-4 flex justify-between items-center shadow-lg relative overflow-hidden shine-effect">
                        <div className="relative z-10 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/50">
                                <i className="ph-fill ph-ticket text-2xl text-yellow-400"></i>
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs uppercase font-bold tracking-wider">{getTrans('luckyWheel.tickets')}</p>
                                <span className="text-3xl font-black text-white">{tickets}</span>
                            </div>
                        </div>
                        
                        {canClaimDaily ? (
                            <button 
                                onClick={handleClaimDaily}
                                className="relative z-10 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-xs rounded-lg shadow-lg hover:scale-105 transition animate-pulse"
                            >
                                <i className="ph-fill ph-gift mr-1"></i> {getTrans('luckyWheel.claim')}
                            </button>
                        ) : (
                            <div className="relative z-10 px-4 py-2 bg-white/5 border border-white/10 text-gray-400 font-bold text-xs rounded-lg flex items-center gap-1">
                                <i className="ph-fill ph-check-circle text-green-500"></i> {getTrans('luckyWheel.claimed')}
                            </div>
                        )}
                    </div>

                    {/* Tasks List */}
                    <div className="bg-skin-fill-secondary rounded-2xl border border-skin-border overflow-hidden flex-grow">
                        <div className="bg-white/5 p-3 border-b border-white/5">
                            <h4 className="font-bold text-skin-base flex items-center gap-2">
                                <i className="ph-fill ph-list-checks text-pink-400"></i>
                                {getTrans('luckyWheel.tasks.title')}
                            </h4>
                        </div>
                        <div className="p-2 space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                            {/* Task 1 */}
                            <div className="task-card">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                                        <i className="ph-fill ph-facebook-logo text-xl"></i>
                                    </div>
                                    <div>
                                        <p className="text-xs sm:text-sm font-bold text-gray-200">{getTrans('luckyWheel.tasks.shareApp')}</p>
                                        <p className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                                            <i className="ph-fill ph-ticket"></i> +1 Vé
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => handleTask('share_app')} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition transform active:scale-95">
                                    {getTrans('luckyWheel.tasks.go')}
                                </button>
                            </div>

                            {/* Task 2 */}
                            <div className="task-card">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 flex-shrink-0">
                                        <i className="ph-fill ph-users text-xl"></i>
                                    </div>
                                    <div>
                                        <p className="text-xs sm:text-sm font-bold text-gray-200">{getTrans('luckyWheel.tasks.invite')}</p>
                                        <p className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                                            <i className="ph-fill ph-ticket"></i> +3 Vé
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => { navigator.clipboard.writeText(user?.id?.substring(0,8).toUpperCase() || ''); showToast('Đã sao chép mã giới thiệu!', 'success'); }} 
                                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow-md transition transform active:scale-95"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- WINNER MODAL OVERLAY --- */}
            {winningReward && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md rounded-2xl animate-fade-in p-4" onClick={() => setWinningReward(null)}>
                    <div className="text-center p-8 bg-gradient-to-b from-[#1e1b25] to-black border-2 border-yellow-500 rounded-2xl shadow-[0_0_50px_rgba(234,179,8,0.5)] transform scale-110 max-w-sm w-full relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        {/* Confetti Effect (Simple CSS dots) */}
                        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                            <div className="absolute top-10 left-10 w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                            <div className="absolute top-20 right-20 w-3 h-3 bg-yellow-500 rounded-full animate-ping delay-75"></div>
                            <div className="absolute bottom-10 left-20 w-2 h-2 bg-blue-500 rounded-full animate-ping delay-150"></div>
                        </div>

                        <div className="text-7xl mb-4 animate-bounce filter drop-shadow-lg">
                            {winningReward.type === 'diamond' ? '💎' : winningReward.type === 'xp' ? '✨' : winningReward.type === 'ticket' ? '🎟️' : '🍀'}
                        </div>
                        
                        <h3 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-500 mb-2 uppercase tracking-wider">
                            {getTrans('luckyWheel.win.title')}
                        </h3>
                        
                        <p className="text-gray-300 text-base mb-6">
                            {winningReward.type === 'lucky' 
                                ? getTrans('luckyWheel.win.lucky')
                                : <>{getTrans('luckyWheel.win.desc')} <span className="text-xl font-bold text-white block mt-1">{winningReward.amount} {getRewardLabel(winningReward)}</span></>
                            }
                        </p>
                        
                        <button 
                            onClick={() => setWinningReward(null)}
                            className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-white font-bold rounded-xl transition shadow-lg transform hover:-translate-y-1"
                        >
                            NHẬN THƯỞNG
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default LuckyWheelModal;
