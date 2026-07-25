import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';
import { performCheckin, subscribeCheckinStatus, getLocalTodayStr } from '../services/economyService';

interface DailyCheckinProps {
  onClose: () => void;
  onSuccess: () => void;
  lang: 'vi' | 'en';
}

export const DailyCheckin: React.FC<DailyCheckinProps> = ({ onClose, onSuccess, lang }) => {
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const todayStr = getLocalTodayStr();
  const today = new Date(`${todayStr}T00:00:00`);
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  useEffect(() => {
    return subscribeCheckinStatus((status) => {
      setCheckedIn(status.isCheckedInToday);
      setHistory(status.history);
    }, { force: true });
  }, []);

  const handleClaim = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await performCheckin();
      if (res.success) {
        setCheckedIn(true);
        setHistory((prev) => prev.includes(todayStr) ? prev : [...prev, todayStr]);
        setMessage(lang === 'vi' ? `Điểm danh thành công! +${res.reward} Vcoin` : `Check-in success! +${res.reward} Vcoin`);
        setTimeout(() => {
          onSuccess();
        }, 1200);
      } else {
        setMessage(res.message || (lang === 'vi' ? 'Lỗi điểm danh' : 'Error checking in'));
      }
    } catch (error) {
      console.error(error);
      setMessage('System Error');
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const renderCalendar = () => {
    const daysCount = getDaysInMonth(currentMonth, currentYear);
    const startDay = getFirstDayOfMonth(currentMonth, currentYear);
    const days = [];

    for (let i = 0; i < startDay; i += 1) {
      days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
    }

    for (let d = 1; d <= daysCount; d += 1) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
      const isChecked = history.includes(dateStr);
      const isPast = new Date(currentYear, currentMonth, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isMissed = isPast && !isChecked;

      days.push(
        <div key={d} className="relative aspect-square flex items-center justify-center">
          <div className={`
            w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all
            ${isChecked ? 'bg-audi-lime text-black shadow-[0_0_10px_#ccff00]' : ''}
            ${isToday && !isChecked ? 'bg-audi-pink text-white animate-pulse' : ''}
            ${isMissed ? 'bg-white/5 text-slate-600' : ''}
            ${!isChecked && !isToday && !isMissed ? 'text-white' : ''}
          `}>
            {isChecked ? <Icons.Check className="w-5 h-5" /> : d}
          </div>
        </div>,
      );
    }

    return days;
  };

  const monthNames = lang === 'vi'
    ? ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const weekDays = lang === 'vi'
    ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return createPortal(
    <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 animate-fade-in bg-black/60 backdrop-blur-md">
      <div className="w-full max-w-[480px] neu-card p-6 sm:p-8 relative shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto border border-white/20">
        
        {/* Top Header */}
        <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-200/60 dark:border-slate-800">
          <h2 className="font-accent text-xl font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Icons.Calendar className="w-6 h-6 text-[#FF007F]" />
            <span>{lang === 'vi' ? 'Điểm Danh Hằng Ngày' : 'Daily Check-in'}</span>
          </h2>
          <button 
            onClick={onClose} 
            className="neu-button p-2.5 rounded-2xl text-slate-700 dark:text-slate-200 hover:text-red-500 transition-colors"
          >
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Today Reward Banner Box */}
        <div className="neu-inset-sm p-4 rounded-3xl flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl neu-raised-sm bg-gradient-to-br from-[#FF007F] to-[#9D00FF] flex items-center justify-center shadow-lg shrink-0">
            <Icons.Gift className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-extrabold uppercase">{lang === 'vi' ? 'Quà hôm nay' : 'Today reward'}</p>
            <p className="text-2xl font-black text-amber-500 font-accent">+5 VCOIN</p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[10px] text-slate-600 dark:text-slate-400 uppercase font-black">{lang === 'vi' ? 'Trạng thái' : 'Status'}</div>
            <div className={`font-black text-xs uppercase px-2.5 py-1 rounded-xl neu-raised-sm mt-1 ${checkedIn ? 'text-emerald-500' : 'text-[#FF007F]'}`}>
              {checkedIn ? (lang === 'vi' ? 'Đã nhận' : 'Claimed') : (lang === 'vi' ? 'Sẵn sàng' : 'Ready')}
            </div>
          </div>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center justify-between mb-4 px-2 neu-raised-sm p-2 rounded-2xl">
          <button 
            onClick={() => {
              const prev = new Date(currentYear, currentMonth - 1);
              setCurrentMonth(prev.getMonth());
              setCurrentYear(prev.getFullYear());
            }} 
            className="neu-button p-2 rounded-xl text-slate-700 dark:text-slate-200"
          >
            <Icons.ChevronLeft className="w-5 h-5" />
          </button>

          <span className="font-accent font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm">
            {monthNames[currentMonth]}, {currentYear}
          </span>

          <button 
            onClick={() => {
              const next = new Date(currentYear, currentMonth + 1);
              setCurrentMonth(next.getMonth());
              setCurrentYear(next.getFullYear());
            }} 
            className="neu-button p-2 rounded-xl text-slate-700 dark:text-slate-200"
          >
            <Icons.ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 text-center mb-6">
          {weekDays.map((d) => (
            <div key={d} className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase mb-2 font-accent">{d}</div>
          ))}
          {renderCalendar()}
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-2xl text-center text-xs font-black animate-fade-in ${
            message.includes('thành công') || message.includes('success') 
              ? 'neu-inset-sm text-emerald-500 border border-emerald-500/50' 
              : 'neu-inset-sm text-red-500 border border-red-500/50'
          }`}>
            {message}
          </div>
        )}

        {/* Action Claim Button */}
        <button
          onClick={handleClaim}
          disabled={checkedIn || loading}
          className={`w-full py-4 rounded-2xl font-black uppercase tracking-wider text-sm shadow-2xl flex items-center justify-center gap-2 transition-all transform ${
            checkedIn
              ? 'neu-inset-sm text-slate-500 cursor-not-allowed opacity-70'
              : 'neu-button-primary'
          }`}
        >
          {loading
            ? <Icons.Loader className="animate-spin w-5 h-5 text-white" />
            : checkedIn ? <Icons.Check className="w-5 h-5" /> : <Icons.Hand className="w-5 h-5" />
          }
          {checkedIn
            ? (lang === 'vi' ? 'Đã điểm danh' : 'Checked In')
            : (lang === 'vi' ? '🚀 Điểm danh ngay (+5 Vcoin)' : '🚀 Check In Now (+5 Vcoin)')
          }
        </button>
      </div>
    </div>,
    document.body,
  );
};
