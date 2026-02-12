
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Modal from './common/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../hooks/useTranslation';

const getVNDateString = (date: Date) => {
    const vietnamTime = new Date(date.getTime() + 7 * 3600 * 1000);
    return vietnamTime.toISOString().split('T')[0];
};

const CheckInModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
    const { user, session, showToast, updateUserProfile } = useAuth();
    const { t } = useTranslation();
    const [checkIns, setCheckIns] = useState<Set<string>>(new Set());
    const [isCheckingIn, setIsCheckingIn] = useState(false);
    const [claimingMilestone, setClaimingMilestone] = useState<number | null>(null);

    const today = useMemo(() => new Date(), []);
    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const todayVnString = getVNDateString(today);

    const fetchCheckInHistory = useCallback(async () => {
        if (!session || !isOpen) return;
        try {
            const res = await fetch(`/.netlify/functions/check-in-history?year=${currentYear}&month=${currentMonth + 1}`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            if (!res.ok) throw new Error('Không thể tải lịch sử điểm danh.');
            const data: string[] = await res.json();
            setCheckIns(new Set(data));
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    }, [session, isOpen, currentYear, currentMonth, showToast]);
    
    useEffect(() => {
        fetchCheckInHistory();
    }, [fetchCheckInHistory]);

    const handleCheckIn = async () => {
        if (!session) return;
        setIsCheckingIn(true);
        try {
            const response = await fetch('/.netlify/functions/daily-check-in', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Điểm danh thất bại.');
            
            showToast(data.message, 'success');
            updateUserProfile({
                diamonds: data.newTotalDiamonds,
                consecutive_check_in_days: data.consecutiveDays,
                last_check_in_at: new Date().toISOString(),
            });
            setCheckIns(prev => new Set(prev).add(todayVnString)); // Update UI immediately
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsCheckingIn(false);
        }
    };

    const handleClaimMilestone = async (days: number) => {
        if (!session) return;
        setClaimingMilestone(days);
        try {
            const response = await fetch('/.netlify/functions/claim-milestone-reward', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}` 
                },
                body: JSON.stringify({ milestoneDays: days })
            });
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Không thể nhận thưởng.');
            }

            showToast(data.message, 'success');
            if (data.newDiamonds) {
                updateUserProfile({ diamonds: data.newDiamonds });
            }
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setClaimingMilestone(null);
        }
    };

    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dayBlanks = Array(firstDayOfMonth).fill(null);
    const dayCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    
    const rawWeekdays = t('modals.checkIn.weekdays');
    const weekdays: string[] = Array.isArray(rawWeekdays) ? rawWeekdays : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    
    const hasCheckedInToday = checkIns.has(todayVnString) || (user?.last_check_in_at && getVNDateString(new Date(user.last_check_in_at)) === todayVnString);
    const streak = user?.consecutive_check_in_days || 0;

    const rewards = [
        { day: 7, prize: '20 Kim Cương', icon: 'ph-gift' },
        { day: 14, prize: '50 Kim Cương', icon: 'ph-gift' },
        { day: 30, prize: '100 Kim Cương', icon: 'ph-gift' },
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('modals.checkIn.title')}>
            <div className="text-skin-base max-h-[80vh] overflow-y-auto custom-scrollbar">
                
                {/* Streak Header */}
                <div className="flex justify-between items-center bg-[#1E1B25] p-4 rounded-xl border border-white/10 mb-4 shadow-sm">
                    <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white shadow-lg">
                            <i className="ph-fill ph-fire text-xl animate-pulse"></i>
                         </div>
                         <div>
                             <p className="text-xs text-gray-400 font-bold uppercase">{t('modals.checkIn.streak')}</p>
                             <p className="text-xl font-black text-white">{streak} {t('modals.checkIn.days')}</p>
                         </div>
                    </div>
                </div>

                {/* Calendar Grid - SOLID BG */}
                <div className="checkin-calendar-solid">
                    <div className="flex justify-between items-center mb-4">
                        <button onClick={() => {
                            setCurrentMonth(m => m === 0 ? 11 : m - 1);
                            if (currentMonth === 0) setCurrentYear(y => y - 1);
                        }} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"><i className="ph-fill ph-caret-left"></i></button>
                        
                        <h3 className="font-bold text-sm uppercase tracking-wider text-white">
                            {t('modals.checkIn.month')} {currentMonth + 1}, {currentYear}
                        </h3>
                        
                        <button onClick={() => {
                            setCurrentMonth(m => m === 11 ? 0 : m + 1);
                            if (currentMonth === 11) setCurrentYear(y => y - 1);
                        }} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"><i className="ph-fill ph-caret-right"></i></button>
                    </div>

                    <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-gray-500 mb-2">
                        {weekdays.map((day: string) => <div key={day}>{day}</div>)}
                    </div>

                    <div className="grid grid-cols-7 gap-2">
                        {dayBlanks.map((_, i) => <div key={`blank-${i}`} />)}
                        {dayCells.map(day => {
                            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isCheckedIn = checkIns.has(dateStr);
                            const isToday = dateStr === todayVnString;
                            const isFuture = new Date(dateStr) > today;
                            
                            let cellClass = "checkin-day-cell";
                            if (isCheckedIn) cellClass += " active";
                            if (isToday) cellClass += " today";
                            if (isFuture) cellClass += " future";
                            
                            return (
                                <div key={day} className={cellClass}>
                                    <span>{day}</span>
                                    {isCheckedIn && <i className="ph-fill ph-check-circle absolute -top-1 -right-1 text-white bg-green-600 rounded-full border border-[#151518] text-[10px]"></i>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-4">
                    <h4 className="font-bold mb-3 text-xs uppercase text-gray-400 tracking-wider flex items-center gap-2">
                        <i className="ph-fill ph-trophy"></i> {t('modals.checkIn.milestones')}
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                        {rewards.map(reward => {
                            const isEligible = streak >= reward.day;
                            return (
                                <div key={reward.day} className={`flex flex-col gap-2 p-3 rounded-xl border transition-all ${isEligible ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-[#1E1B25] border-white/5 opacity-80'}`}>
                                    <div className="flex justify-center">
                                        <i className={`ph-fill ${reward.icon} text-2xl mb-1 ${isEligible ? 'text-yellow-400 animate-bounce' : 'text-gray-600'}`}></i>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase">{t('langName') === 'English' ? 'Day' : 'Mốc'} {reward.day}</p>
                                        <p className={`text-xs font-bold ${isEligible ? 'text-white' : 'text-gray-400'}`}>{reward.prize}</p>
                                    </div>
                                    
                                    {isEligible ? (
                                        <button 
                                            onClick={() => handleClaimMilestone(reward.day)}
                                            disabled={claimingMilestone === reward.day}
                                            className="w-full py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black rounded-lg shadow-sm disabled:opacity-50"
                                        >
                                            {claimingMilestone === reward.day ? <i className="ph ph-spinner animate-spin"></i> : 'NHẬN'}
                                        </button>
                                    ) : (
                                        <div className="w-full py-1.5 bg-black/20 text-gray-600 text-[10px] font-bold rounded-lg text-center cursor-not-allowed">
                                            <i className="ph-fill ph-lock"></i>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-6 sticky bottom-0 z-10">
                    <button 
                        onClick={handleCheckIn}
                        disabled={hasCheckedInToday || isCheckingIn}
                        className={`
                            w-full py-4 font-bold rounded-xl shadow-lg text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all
                            ${hasCheckedInToday 
                                ? 'bg-[#252529] text-gray-400 cursor-not-allowed border border-white/5' 
                                : 'themed-button-primary hover:scale-[1.02]'
                            }
                        `}
                    >
                        {isCheckingIn ? (
                            <><i className="ph ph-spinner animate-spin text-lg"></i> {t('modals.checkIn.buttonProcessing')}</>
                        ) : hasCheckedInToday ? (
                            <><i className="ph-fill ph-check-circle text-lg text-green-500"></i> {t('modals.checkIn.buttonCheckedIn')}</>
                        ) : (
                            <><i className="ph-fill ph-hand-pointing text-lg"></i> {t('modals.checkIn.button')}</>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CheckInModal;
