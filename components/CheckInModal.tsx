import React, { useState, useEffect, useCallback } from 'react';
import Modal from './common/Modal';
import { useAuth } from '../contexts/AuthContext';

const CheckInModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
    const { session, showToast, updateUserDiamonds, setHasCheckedInToday } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [checkedInDates, setCheckedInDates] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingIn, setIsCheckingIn] = useState(false);

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today's date

    const fetchHistory = useCallback(async (date: Date) => {
        if (!session) return;
        setIsLoading(true);
        try {
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const res = await fetch(`/.netlify/functions/check-in-history?year=${year}&month=${month}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (!res.ok) throw new Error('Could not fetch history');
            const data: string[] = await res.json();
            setCheckedInDates(new Set(data));
        } catch (error) {
            showToast('Lỗi khi tải lịch sử điểm danh.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

    useEffect(() => {
        if (isOpen) {
            fetchHistory(currentDate);
        }
    }, [isOpen, currentDate, fetchHistory]);

    const handleCheckIn = async () => {
        if (!session) return;
        setIsCheckingIn(true);
        try {
            const res = await fetch('/.netlify/functions/daily-check-in', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Điểm danh thất bại.');

            showToast(`Điểm danh thành công! +${data.reward.diamonds} KC, chuỗi ${data.streak} ngày.`, 'success');
            updateUserDiamonds(data.newDiamondCount);
            setHasCheckedInToday(true);
            setCheckedInDates(prev => new Set(prev).add(data.checkInDate)); // Add today's date
            onClose(); // Close modal on success
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsCheckingIn(false);
        }
    };
    
    const changeMonth = (offset: number) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };

    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`blank-${i}`} className="w-10 h-10"></div>);

        return (
            <div className="grid grid-cols-7 gap-2 text-center">
                {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => <div key={day} className="font-bold text-xs text-gray-400">{day}</div>)}
                {blanks}
                {days.map(day => {
                    const date = new Date(year, month, day);
                    const dateString = date.toISOString().split('T')[0];
                    const isCheckedIn = checkedInDates.has(dateString);
                    const isToday = date.getTime() === today.getTime();

                    return (
                        <div key={day} className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-semibold
                            ${isCheckedIn ? 'bg-pink-500/30 text-pink-300 border border-pink-500' : 'bg-white/5 text-gray-300'}
                            ${isToday ? 'ring-2 ring-cyan-400' : ''}
                        `}>
                            {day}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Điểm Danh Hàng Ngày">
            <div className="space-y-4">
                <div className="flex justify-between items-center px-4 py-2 bg-white/5 rounded-lg">
                    <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-white/10 rounded-full"><i className="ph-fill ph-caret-left"></i></button>
                    <h3 className="font-bold text-lg text-white">{`Tháng ${currentDate.getMonth() + 1}, ${currentDate.getFullYear()}`}</h3>
                    <button onClick={() => changeMonth(1)} className="p-2 hover:bg-white/10 rounded-full"><i className="ph-fill ph-caret-right"></i></button>
                </div>
                {isLoading ? <div className="text-center p-8">Đang tải...</div> : renderCalendar()}
                <p className="text-xs text-center text-gray-500 pt-2">Điểm danh mỗi ngày để nhận Kim cương và duy trì chuỗi điểm danh của bạn!</p>
                <button
                    onClick={handleCheckIn}
                    disabled={isCheckingIn || checkedInDates.has(today.toISOString().split('T')[0])}
                    className="w-full py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isCheckingIn ? 'Đang xử lý...' : checkedInDates.has(today.toISOString().split('T')[0]) ? 'Hôm nay bạn đã điểm danh' : 'Điểm danh ngay!'}
                </button>
            </div>
        </Modal>
    );
};

export default CheckInModal;
