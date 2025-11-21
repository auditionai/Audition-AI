
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
            showToast('Bạn đã hết vé quay!', 'error');
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
            const segmentAngle = 360 / rewards.length;
            const targetIndex = result.rewardIndex;
            
            const segmentCenter = (targetIndex * segmentAngle) + (segmentAngle / 2);
            const finalRotation = 3600 + (360 - segmentCenter); // 10 full spins + alignment
            
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
                showToast('Đã nhận vé quay miễn phí!', 'success');
            } else {
                showToast(data.error, 'error');
            }
        } catch (e) { console.error(e); }
    };

    const handleTask = async (taskType: 'share_app' | 'share_image') => {
        // Simulate task completion
        if (taskType === 'share_app') {
            // In real app: Open FB share dialog
             const url = encodeURIComponent(window.location.origin);
             window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
        }
        
        // Call API to verify/claim
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
                showToast(data.error || 'Không thể nhận thưởng.', 'error');
            }
        } catch (e) { console.error(e); }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('luckyWheel.title')}>
            <div className="flex flex-col md:flex-row gap-8 items-center justify-center min-h-[500px]">
                {/* Wheel Section */}
                <div className="relative w-[300px] h-[300px] md:w-[400px] md:h-[400px] flex-shrink-0">
                    {/* Pointer */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 z-20 w-8 h-10 bg-gradient-to-b from-yellow-400 to-red-500" style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}></div>
                    
                    {/* The Wheel */}
                    <div 
                        ref={wheelRef}
                        className="w-full h-full rounded-full border-4 border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.5)] relative overflow-hidden transition-transform cubic-bezier(0.25, 0.1, 0.25, 1)"
                        style={{ 
                            transform: `rotate(${rotation}deg)`,
                            transitionDuration: isSpinning ? '5s' : '0s'
                        }}
                    >
                        {rewards.map((reward, index) => {
                            const angle = 360 / rewards.length;
                            const rotate = angle * index;
                            return (
                                <div 
                                    key={reward.id}
                                    className="absolute top-0 left-1/2 w-1/2 h-full origin-left"
                                    style={{ 
                                        transform: `rotate(${rotate}deg)`,
                                        transformOrigin: 'left center',
                                    }}
                                >
                                    <div 
                                        className="w-full h-full"
                                        style={{
                                            background: index % 2 === 0 ? reward.color : `${reward.color}CC`, // Slight variation or custom
                                            transform: `skewY(-${90 - angle}deg)`, // Only works for specific counts, better use conic-gradient if fully dynamic.
                                        }}
                                    >
                                    </div>
                                    {/* Label */}
                                    <div 
                                        className="absolute top-1/2 left-8 -translate-y-1/2 text-white font-bold text-xs md:text-sm whitespace-nowrap"
                                        style={{ 
                                            transform: `rotate(${angle/2}deg)`, // Center text in wedge
                                            transformOrigin: 'left center',
                                            width: '120px',
                                            textAlign: 'right'
                                        }}
                                    >
                                        {reward.label}
                                    </div>
                                </div>
                            );
                        })}
                        
                        {/* Fallback Visual if CSS segments fail: Conic Gradient */}
                        <div className="absolute inset-0 -z-10 rounded-full" style={{
                            background: `conic-gradient(
                                ${rewards.map((r, i) => `${r.color} ${i * (100/rewards.length)}% ${(i+1) * (100/rewards.length)}%`).join(', ')}
                            )`
                        }}></div>
                    </div>

                    {/* Center Button */}
                    <button 
                        onClick={handleSpin}
                        disabled={isSpinning || tickets <= 0}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-gradient-to-br from-red-600 to-pink-600 border-4 border-white shadow-xl flex items-center justify-center z-10 hover:scale-105 transition active:scale-95 disabled:opacity-80 disabled:cursor-not-allowed"
                    >
                        <span className="font-black text-white text-xs text-center leading-tight">
                            {isSpinning ? t('luckyWheel.spinning') : t('luckyWheel.spin')}
                        </span>
                    </button>
                </div>

                {/* Controls & Tasks */}
                <div className="flex-grow w-full max-w-sm space-y-6">
                    <div className="bg-skin-fill-secondary p-4 rounded-xl border border-skin-border text-center">
                        <p className="text-skin-muted uppercase text-xs font-bold">{t('luckyWheel.tickets')}</p>
                        <p className="text-4xl font-black text-yellow-400 my-2">{tickets}</p>
                        {canClaimDaily ? (
                            <button onClick={handleClaimDaily} className="w-full py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition animate-pulse">
                                {t('luckyWheel.claim')}
                            </button>
                        ) : (
                            <div className="text-xs text-green-400 bg-green-500/10 py-1 rounded">
                                <i className="ph-fill ph-check-circle"></i> {t('luckyWheel.claimed')}
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        <h4 className="font-bold text-skin-base flex items-center gap-2">
                            <i className="ph-fill ph-list-checks text-pink-400"></i>
                            {t('luckyWheel.tasks.title')}
                        </h4>
                        
                        <div className="bg-skin-fill p-3 rounded-lg flex justify-between items-center border border-skin-border">
                            <span className="text-sm text-gray-300">{t('luckyWheel.tasks.shareApp')}</span>
                            <button onClick={() => handleTask('share_app')} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded">{t('luckyWheel.tasks.go')}</button>
                        </div>
                        <div className="bg-skin-fill p-3 rounded-lg flex justify-between items-center border border-skin-border">
                            <span className="text-sm text-gray-300">{t('luckyWheel.tasks.invite')}</span>
                            {/* Just copy code logic */}
                            <button onClick={() => { navigator.clipboard.writeText(user?.id?.substring(0,8).toUpperCase() || ''); showToast('Đã sao chép mã!', 'success'); }} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded">Copy Code</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Win Modal Overlay */}
            {winningReward && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-2xl animate-fade-in">
                    <div className="text-center p-8 bg-gradient-to-b from-[#1e1b25] to-black border border-yellow-500/50 rounded-2xl shadow-[0_0_50px_rgba(234,179,8,0.3)] transform scale-110">
                        <div className="text-6xl mb-4 animate-bounce">
                            {winningReward.type === 'diamond' ? '💎' : winningReward.type === 'xp' ? '✨' : winningReward.type === 'ticket' ? '🎟️' : '🍀'}
                        </div>
                        <h3 className="text-2xl font-black text-yellow-400 mb-2">{t('luckyWheel.win.title')}</h3>
                        <p className="text-white text-lg">
                            {winningReward.type === 'lucky' 
                                ? t('luckyWheel.win.lucky') 
                                : `${t('luckyWheel.win.desc')} ${winningReward.amount} ${t(`luckyWheel.win.${winningReward.type}`)}`
                            }
                        </p>
                        <button 
                            onClick={() => setWinningReward(null)}
                            className="mt-6 px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full transition shadow-lg"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default LuckyWheelModal;
