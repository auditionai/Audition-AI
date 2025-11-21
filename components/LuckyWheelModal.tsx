
import React, { useState, useEffect, useRef } from 'react';
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
    const wheelRef = useRef<HTMLDivElement>(null);

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
            showToast(t('luckyWheel.win.lucky') || 'Bạn đã hết vé quay!', 'error'); // Fallback text
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
            // Adjust rotation so the pointer (top) lands on the center of the segment
            const segmentAngle = 360 / rewards.length;
            const targetIndex = result.rewardIndex;
            
            // Random visual offset within the segment to make it look natural (+/- 40% of segment)
            const randomOffset = (Math.random() - 0.5) * (segmentAngle * 0.8);
            
            // Calculate angle to rotate TO (subtract target angle from 360 because CSS rotate goes clockwise)
            // We want the target segment to be at 0deg (top)
            const targetAngle = targetIndex * segmentAngle;
            const spins = 5 + Math.floor(Math.random() * 5); // 5 to 10 spins
            const finalRotation = rotation + (360 * spins) + (360 - targetAngle) + randomOffset;
            
            setRotation(finalRotation);
            
            // Wait for animation
            setTimeout(() => {
                setIsSpinning(false);
                setWinningReward(result.reward);
                setTickets(result.remainingTickets);
                updateUserProfile({ diamonds: result.newDiamondCount, xp: result.newXp });
                
            }, 5000); // 5s animation matches CSS transition

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
                // Silent fail or small notice if already claimed
                console.log(data.error);
            }
        } catch (e) { console.error(e); }
    };

    // Helper for translations with fallback
    const getTrans = (key: string) => {
        const text = t(key);
        return text === key ? key.split('.').pop() : text; // Fallback to last key part if trans missing
    }

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={getTrans('luckyWheel.title')}>
            <div className="flex flex-col lg:flex-row gap-8 items-center justify-center lg:min-w-[800px] min-h-[500px] p-4">
                
                {/* --- LEFT: THE WHEEL --- */}
                <div className="relative w-[320px] h-[320px] sm:w-[400px] sm:h-[400px] flex-shrink-0">
                    {/* Decorative Glow Behind */}
                    <div className="absolute inset-0 bg-gradient-to-r from-pink-500/30 to-yellow-500/30 rounded-full blur-3xl animate-pulse"></div>

                    {/* Pointer (Arrow) */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-30 filter drop-shadow-lg">
                        <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[30px] border-t-yellow-400 relative">
                             <div className="absolute -top-[32px] -left-[10px] w-5 h-5 bg-white rounded-full"></div>
                        </div>
                    </div>
                    
                    {/* The Rotating Wheel */}
                    <div 
                        ref={wheelRef}
                        className="w-full h-full rounded-full border-8 border-gray-800 shadow-[0_0_0_4px_#fbbf24,inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden transition-transform cubic-bezier(0.2, 0.8, 0.3, 1)"
                        style={{ 
                            transform: `rotate(${rotation}deg)`,
                            transitionDuration: isSpinning ? '5000ms' : '0ms',
                            background: '#1f2937'
                        }}
                    >
                        {rewards.map((reward, index) => {
                            const count = rewards.length;
                            const rotationAngle = (360 / count) * index;
                            const skewAngle = 90 - (360 / count);
                            
                            // Colors palette if not provided
                            const defaultColors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
                            const bgColor = reward.color && reward.color !== '#FF0000' ? reward.color : defaultColors[index % defaultColors.length];

                            return (
                                <div 
                                    key={reward.id}
                                    className="absolute top-0 right-0 w-1/2 h-1/2 origin-bottom-left border-l border-white/10"
                                    style={{ 
                                        transform: `rotate(${rotationAngle}deg) skewY(-${skewAngle}deg)`,
                                        background: bgColor,
                                        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)'
                                    }}
                                >
                                    {/* Text Container - Counter rotated to be readable */}
                                    <div 
                                        className="absolute bottom-0 left-0 w-full h-full flex flex-col items-center justify-end pb-4"
                                        style={{ 
                                            transform: `skewY(${skewAngle}deg) rotate(${360/count/2}deg)`,
                                            transformOrigin: 'bottom left' 
                                        }}
                                    >
                                        <span className="text-white font-black text-sm sm:text-base uppercase drop-shadow-md px-8 text-center mb-12 sm:mb-16 rotate-90">
                                            {reward.label}
                                        </span>
                                        {/* Icon based on type */}
                                        <div className="absolute top-1/2 -translate-y-1/2 rotate-90 translate-x-8">
                                            {reward.type === 'diamond' && <i className="ph-fill ph-diamonds-four text-2xl text-white drop-shadow-md"></i>}
                                            {reward.type === 'xp' && <i className="ph-fill ph-star text-2xl text-yellow-200 drop-shadow-md"></i>}
                                            {reward.type === 'ticket' && <i className="ph-fill ph-ticket text-2xl text-green-200 drop-shadow-md"></i>}
                                            {reward.type === 'lucky' && <i className="ph-fill ph-clover text-2xl text-gray-200 drop-shadow-md"></i>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Center Hub */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-yellow-300 to-orange-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.6)] z-10 flex items-center justify-center border-4 border-white/80">
                        <button 
                            onClick={handleSpin}
                            disabled={isSpinning || tickets <= 0}
                            className="w-full h-full rounded-full flex items-center justify-center active:scale-95 transition disabled:opacity-80 disabled:cursor-not-allowed group"
                        >
                            <span className="font-black text-white text-xs sm:text-sm uppercase leading-tight drop-shadow-md group-hover:animate-pulse">
                                {isSpinning ? '...' : getTrans('luckyWheel.spin')}
                            </span>
                        </button>
                    </div>
                </div>

                {/* --- RIGHT: CONTROLS & TASKS --- */}
                <div className="flex-grow w-full max-w-md flex flex-col gap-4">
                    
                    {/* Ticket Counter */}
                    <div className="bg-[#1e1b25] border border-yellow-500/30 rounded-2xl p-4 flex justify-between items-center shadow-lg relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-transparent"></div>
                        <div className="relative z-10">
                            <p className="text-gray-400 text-xs uppercase font-bold tracking-wider">{getTrans('luckyWheel.tickets')}</p>
                            <div className="flex items-center gap-2">
                                <i className="ph-fill ph-ticket text-3xl text-yellow-400"></i>
                                <span className="text-4xl font-black text-white">{tickets}</span>
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
                            <div className="bg-[#12121A] p-3 rounded-xl flex justify-between items-center border border-white/5 hover:border-pink-500/30 transition group">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400">
                                        <i className="ph-fill ph-facebook-logo text-lg"></i>
                                    </div>
                                    <div>
                                        <p className="text-xs sm:text-sm font-semibold text-gray-200">{getTrans('luckyWheel.tasks.shareApp')}</p>
                                        <p className="text-[10px] text-green-400 font-bold">+1 Vé quay</p>
                                    </div>
                                </div>
                                <button onClick={() => handleTask('share_app')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition transform active:scale-95">
                                    {getTrans('luckyWheel.tasks.go')}
                                </button>
                            </div>

                            {/* Task 2 */}
                            <div className="bg-[#12121A] p-3 rounded-xl flex justify-between items-center border border-white/5 hover:border-pink-500/30 transition group">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400">
                                        <i className="ph-fill ph-users text-lg"></i>
                                    </div>
                                    <div>
                                        <p className="text-xs sm:text-sm font-semibold text-gray-200">{getTrans('luckyWheel.tasks.invite')}</p>
                                        <p className="text-[10px] text-green-400 font-bold">+3 Vé quay</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => { navigator.clipboard.writeText(user?.id?.substring(0,8).toUpperCase() || ''); showToast('Đã sao chép mã giới thiệu!', 'success'); }} 
                                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow-md transition transform active:scale-95"
                                >
                                    Copy Code
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- WINNER MODAL OVERLAY --- */}
            {winningReward && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md rounded-2xl animate-fade-in p-4">
                    <div className="text-center p-8 bg-gradient-to-b from-[#1e1b25] to-black border-2 border-yellow-500 rounded-2xl shadow-[0_0_50px_rgba(234,179,8,0.5)] transform scale-110 max-w-sm w-full relative overflow-hidden">
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
                                : <>{getTrans('luckyWheel.win.desc')} <span className="text-xl font-bold text-white block mt-1">{winningReward.amount} {winningReward.label}</span></>
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
