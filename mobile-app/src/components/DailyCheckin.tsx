import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader, X, CalendarDays, ChevronLeft, ChevronRight, Hand } from 'lucide-react';
import { performCheckin, subscribeCheckinStatus, getLocalTodayStr } from '../services/economyService';

interface DailyCheckinProps {
  onClose: () => void;
  onSuccess: () => void;
  lang?: 'vi' | 'en';
}

export const DailyCheckin: React.FC<DailyCheckinProps> = ({ onClose, onSuccess, lang = 'vi' }) => {
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
        setTimeout(() => onSuccess(), 1200);
      } else {
        setMessage(res.message || (lang === 'vi' ? 'Lỗi điểm danh' : 'Error checking in'));
      }
    } catch {
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
            w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
            ${isChecked ? 'bg-green-500 text-white shadow-lg' : ''}
            ${isToday && !isChecked ? 'bg-purple-600 text-white animate-pulse' : ''}
            ${isMissed ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500' : ''}
            ${!isChecked && !isToday && !isMissed ? 'text-gray-600 bg-gray-50 dark:bg-[#27272A]' : ''}
          `}>
            {isChecked ? <Check className="w-4 h-4" /> : d}
          </div>
        </div>,
      );
    }

    return days;
  };

  const monthNames = lang === 'vi'
    ? ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const weekDays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-[400px] bg-white dark:bg-[#18181B] rounded-3xl p-5 md:p-6 relative shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-wide flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-purple-600" />
            {lang === 'vi' ? 'Điểm Danh' : 'Daily Check-in'}
          </h2>
          <button onClick={onClose} className="bg-gray-100 dark:bg-zinc-800 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-95">
            <X className="w-5 h-5 text-gray-600 dark:text-zinc-300" />
          </button>
        </div>

        <div className="bg-purple-50 dark:bg-purple-500/10 rounded-2xl p-4 flex items-center gap-4 border border-purple-100 dark:border-purple-500/30 mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shrink-0">
            <CalendarDays className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">{lang === 'vi' ? 'Quà hôm nay' : 'Today reward'}</p>
            <p className="text-xl font-black text-gray-900 dark:text-white">+5 Vcoin</p>
          </div>
          <div className="ml-auto flex items-end flex-col">
            <div className="text-[9px] text-gray-400 dark:text-zinc-500 uppercase font-bold tracking-wider">{lang === 'vi' ? 'Trạng thái' : 'Status'}</div>
            <div className={`font-bold text-xs ${checkedIn ? 'text-green-600' : 'text-purple-600'}`}>
              {checkedIn ? (lang === 'vi' ? 'Đã nhận' : 'Claimed') : (lang === 'vi' ? 'Sẵn sàng' : 'Ready')}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 bg-gray-50 dark:bg-[#27272A] p-2 rounded-xl">
          <button onClick={() => {
            const prev = new Date(currentYear, currentMonth - 1);
            setCurrentMonth(prev.getMonth());
            setCurrentYear(prev.getFullYear());
          }} className="text-gray-400 dark:text-zinc-500 hover:text-gray-900 bg-white dark:bg-[#18181B] p-1 rounded-lg shadow-sm active:scale-95">
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="font-bold text-gray-900 dark:text-white uppercase tracking-widest text-xs">
            {monthNames[currentMonth]}, {currentYear}
          </span>

          <button onClick={() => {
            const next = new Date(currentYear, currentMonth + 1);
            setCurrentMonth(next.getMonth());
            setCurrentYear(next.getFullYear());
          }} className="text-gray-400 dark:text-zinc-500 hover:text-gray-900 bg-white dark:bg-[#18181B] p-1 rounded-lg shadow-sm active:scale-95">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center mb-6">
          {weekDays.map((d) => (
            <div key={d} className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-2">{d}</div>
          ))}
          {renderCalendar()}
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-xl text-center text-xs font-bold animate-fade-in ${message.includes('thành công') || message.includes('success') ? 'bg-green-50 dark:bg-green-500/10 text-green-600 border border-green-200 dark:border-green-500/30' : 'bg-red-50 dark:bg-red-500/10 text-red-600 border border-red-200 dark:border-red-500/30'}`}>
            {message}
          </div>
        )}

        <button
          onClick={handleClaim}
          disabled={checkedIn || loading}
          className={`w-full py-3.5 rounded-2xl font-black uppercase tracking-wide text-white shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 ${
            checkedIn
              ? 'bg-gray-200 dark:bg-zinc-800 cursor-not-allowed text-gray-400 dark:text-zinc-500 shadow-none'
              : 'bg-gradient-to-r from-purple-600 to-pink-600 shadow-purple-500/25'
          }`}
        >
          {loading
            ? <Loader className="animate-spin w-5 h-5" />
            : checkedIn ? <Check className="w-5 h-5" /> : <Hand className="w-5 h-5" />
          }
          {checkedIn
            ? (lang === 'vi' ? 'Đã điểm danh' : 'Checked In')
            : (lang === 'vi' ? 'Điểm danh ngay' : 'Check In Now')
          }
        </button>
      </div>
    </div>,
    document.body,
  );
};
