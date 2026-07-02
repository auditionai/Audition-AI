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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-[450px] bg-[#0c0c14] border border-white/20 rounded-[2rem] p-6 relative shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-game text-xl font-bold text-white uppercase">
            {lang === 'vi' ? 'Điểm Danh Hằng Ngày' : 'Daily Check-in'}
          </h2>
          <button onClick={onClose} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
            <Icons.X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="bg-[#1a1a24] rounded-2xl p-4 flex items-center gap-4 border border-white/5 mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-audi-pink to-audi-purple flex items-center justify-center shadow-lg">
            <Icons.Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase">{lang === 'vi' ? 'Quà hôm nay' : 'Today reward'}</p>
            <p className="text-2xl font-black text-audi-yellow">+5 Vcoin</p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[10px] text-slate-500 uppercase font-bold">{lang === 'vi' ? 'Trạng thái' : 'Status'}</div>
            <div className={`font-bold ${checkedIn ? 'text-audi-lime' : 'text-audi-pink'}`}>
              {checkedIn ? (lang === 'vi' ? 'Đã nhận' : 'Claimed') : (lang === 'vi' ? 'Sẵn sàng' : 'Ready')}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 px-2">
          <button onClick={() => {
            const prev = new Date(currentYear, currentMonth - 1);
            setCurrentMonth(prev.getMonth());
            setCurrentYear(prev.getFullYear());
          }} className="text-slate-400 hover:text-white">
            <Icons.ChevronLeft className="w-5 h-5" />
          </button>

          <span className="font-bold text-white uppercase tracking-widest text-sm">
            {monthNames[currentMonth]}, {currentYear}
          </span>

          <button onClick={() => {
            const next = new Date(currentYear, currentMonth + 1);
            setCurrentMonth(next.getMonth());
            setCurrentYear(next.getFullYear());
          }} className="text-slate-400 hover:text-white">
            <Icons.ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center mb-6">
          {weekDays.map((d) => (
            <div key={d} className="text-[10px] font-bold text-slate-500 mb-2">{d}</div>
          ))}
          {renderCalendar()}
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-xl text-center text-sm font-bold animate-fade-in ${message.includes('thành công') || message.includes('success') ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-red-500/20 text-red-400 border border-red-500/50'}`}>
            {message}
          </div>
        )}

        <button
          onClick={handleClaim}
          disabled={checkedIn || loading}
          className={`w-full py-4 rounded-xl font-bold uppercase tracking-wider text-white shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
            checkedIn
              ? 'bg-slate-700 cursor-not-allowed text-slate-400'
              : 'bg-[#D10000] hover:bg-red-600 shadow-[0_0_20px_rgba(209,0,0,0.4)]'
          }`}
        >
          {loading
            ? <Icons.Loader className="animate-spin w-5 h-5" />
            : checkedIn ? <Icons.Check className="w-5 h-5" /> : <Icons.Hand className="w-5 h-5" />
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
