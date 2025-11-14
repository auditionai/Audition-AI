import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Modal from './common/Modal';
import { useAuth } from '../contexts/AuthContext';

const getVNDateString = (date: Date) => {
    const vietnamTime = new Date(date.getTime() + 7 * 3600 * 1000);
    return vietnamTime.toISOString().split('T')[0];
};

const CheckInModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
    const { user, session, showToast, updateUserProfile } = useAuth();
    const [checkIns, setCheckIns] = useState<Set<string>>(new Set());
    const [isCheckingIn, setIsCheckingIn] = useState(false);

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

    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dayBlanks = Array(firstDayOfMonth).fill(null);
    const dayCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    
    const hasCheckedInToday = checkIns.has(todayVnString) || (user?.last_check_in_at && getVNDateString(new Date(user.last_check_in_at)) === todayVnString);

    const rewards = [
        { day: 7, prize: '20 Kim Cương', icon: 'ph-gift' },
        { day: 14, prize: '50 Kim Cương', icon: 'ph-gift' },
        { day: 30, prize: '100 Kim Cương', icon: 'ph-gift' },
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Điểm Danh Hàng Ngày">
            <div className="text-white max-h-[80vh] overflow-y-auto custom-scrollbar">
                <div className="bg-white/5 p-4 rounded-lg text-center mb-4">
                    <p className="text-gray-400">Chuỗi điểm danh liên tục của bạn</p>
                    <p className="text-3xl font-bold text-cyan-400 neon-text-glow">{user?.consecutive_check_in_days || 0} ngày</p>
                </div>

                <div className="bg-black/20 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                        <button onClick={() => {
                            setCurrentMonth(m => m === 0 ? 11 : m - 1);
                            if (currentMonth === 0) setCurrentYear(y => y - 1);
                        }} className="p-2 rounded-full hover:bg-white/10"><i className="ph-fill ph-caret-left"></i></button>
                        <h3 className="font-bold text-lg">Tháng {currentMonth + 1}, {currentYear}</h3>
                        <button onClick={() => {
                            setCurrentMonth(m => m === 11 ? 0 : m + 1);
                            if (currentMonth === 11) setCurrentYear(y => y - 1);
                        }} className="p-2 rounded-full hover:bg-white/10"><i className="ph-fill ph-caret-right"></i></button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-400 mb-2">
                        {weekdays.map(day => <div key={day}>{day}</div>)}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {dayBlanks.map((_, i) => <div key={`blank-${i}`} />)}
                        {dayCells.map(day => {
                            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isCheckedIn = checkIns.has(dateStr);
                            const isToday = dateStr === todayVnString;
                            const isFuture = new Date(dateStr) > today;
                            
                            return (
                                <div key={day} className={`relative w-full aspect-square flex items-center justify-center rounded-lg text-sm
                                    ${isToday ? 'bg-pink-500/30 border-2 border-pink-500' : ''}
                                    ${isCheckedIn ? 'bg-green-500/20' : 'bg-white/5'}
                                    ${isFuture ? 'opacity-50' : ''}
                                `}>
                                    <span className={isCheckedIn ? 'font-bold text-white' : 'text-gray-300'}>{day}</span>
                                    {isCheckedIn && <i className="ph-fill ph-check-circle text-green-300 absolute bottom-1 right-1 text-xs"></i>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-4">
                    <h4 className="font-semibold mb-2">Các mốc thưởng</h4>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        {rewards.map(reward => (
                             <div key={reward.day} className="bg-yellow-500/10 border border-yellow-500/30 p-2 rounded-lg">
                                <i className={`ph-fill ${reward.icon} text-yellow-400 text-2xl mb-1`}></i>
                                <p className="font-bold">Ngày {reward.day}</p>
                                <p className="text-gray-300">{reward.prize}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-6">
                    <button 
                        onClick={handleCheckIn}
                        disabled={hasCheckedInToday || isCheckingIn}
                        className="w-full py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90">
                        {isCheckingIn ? 'Đang xử lý...' : hasCheckedInToday ? 'Đã điểm danh hôm nay' : 'Điểm danh ngay'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CheckInModal;