import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Flame, Gift, Loader, Lock, Trophy, X, CalendarDays, ChevronLeft, ChevronRight, Hand } from 'lucide-react';
import { performCheckin, claimMilestoneReward, subscribeCheckinStatus } from '../services/economyService';

interface DailyCheckinProps {
  onClose: () => void;
  onSuccess: () => void;
  lang?: 'vi' | 'en';
}

export const DailyCheckin: React.FC<DailyCheckinProps> = ({ onClose, onSuccess, lang = 'vi' }) => {
  const [streak, setStreak] = useState(0);
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [claimedMilestones, setClaimedMilestones] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  
  // Calendar State
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  useEffect(() => {
    return subscribeCheckinStatus((status) => {
        setStreak(status.streak); 
        setCheckedIn(status.isCheckedInToday);
        setHistory(status.history);
        setClaimedMilestones(status.claimedMilestones);
    }, { force: true });
  }, []);

  const handleClaim = async () => {
      setLoading(true);
      setMessage(null);
      try {
          const res = await performCheckin();
          if (res.success) {
              setStreak(res.newStreak || 0);
              setCheckedIn(true);
              setHistory(prev => [...prev, new Date().toLocaleDateString('sv-SE')]);
              setMessage(lang === 'vi' ? `Điểm danh thành công! +${res.reward} Vcoin` : `Check-in success! +${res.reward} Vcoin`);
              setTimeout(() => onSuccess(), 1500); 
          } else {
              setMessage(res.message || (lang === 'vi' ? 'Lỗi điểm danh' : 'Error checking in'));
          }
      } catch (e: any) {
          setMessage('System Error');
      } finally {
          setLoading(false);
      }
  };

  const handleClaimMilestone = async (day: number) => {
      setLoading(true);
      setMessage(null);
      try {
          const res = await claimMilestoneReward(day);
          if (res.success) {
              setMessage(res.message);
              setClaimedMilestones(prev => [...prev, day]);
              onSuccess();
          } else {
              setMessage(res.message);
          }
      } catch (e) {
          setMessage('Lỗi nhận thưởng mốc');
      } finally {
          setLoading(false);
      }
  }

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const renderCalendar = () => {
      const daysCount = getDaysInMonth(currentMonth, currentYear);
      const startDay = getFirstDayOfMonth(currentMonth, currentYear);
      const days = [];

      for (let i = 0; i < startDay; i++) {
          days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
      }

      for (let d = 1; d <= daysCount; d++) {
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
              </div>
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
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-wide flex items-center gap-2">
                     <CalendarDays className="w-5 h-5 text-purple-600" />
                     {lang === 'vi' ? 'Điểm Danh' : 'Daily Check-in'}
                 </h2>
                 <button onClick={onClose} className="bg-gray-100 dark:bg-zinc-800 p-2 rounded-full hover:bg-gray-200 dark:bg-zinc-700 transition-colors active:scale-95">
                     <X className="w-5 h-5 text-gray-600 dark:text-zinc-300" />
                 </button>
            </div>

            {/* Streak Banner */}
            <div className="bg-purple-50 dark:bg-purple-500/10 rounded-2xl p-4 flex items-center gap-4 border border-purple-100 dark:border-purple-500/30 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-orange-400 to-red-500 flex items-center justify-center shadow-lg shrink-0">
                    <Flame className="w-6 h-6 text-white" />
                </div>
                <div>
                    <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">{lang === 'vi' ? 'Tích lũy tháng này' : 'Monthly Check-ins'}</p>
                    <p className="text-xl font-black text-gray-900 dark:text-white">{streak} {lang === 'vi' ? 'ngày' : 'days'}</p>
                </div>
                <div className="ml-auto flex items-end flex-col">
                    <div className="text-[9px] text-gray-400 dark:text-zinc-500 uppercase font-bold tracking-wider">Hôm nay</div>
                    <div className="text-purple-600 font-bold bg-purple-100 px-2 py-0.5 rounded-full text-xs">+5 Vcoin</div>
                </div>
            </div>

            {/* Calendar Controls */}
            <div className="flex items-center justify-between mb-4 bg-gray-50 dark:bg-[#27272A] p-2 rounded-xl">
                 <button onClick={() => {
                     const prev = new Date(currentYear, currentMonth - 1);
                     setCurrentMonth(prev.getMonth());
                     setCurrentYear(prev.getFullYear());
                 }} className="text-gray-400 dark:text-zinc-500 hover:text-gray-900 bg-white dark:bg-[#18181B] p-1 rounded-lg shadow-sm active:scale-95"><ChevronLeft className="w-5 h-5" /></button>
                 
                 <span className="font-bold text-gray-900 dark:text-white uppercase tracking-widest text-xs">
                     {monthNames[currentMonth]}, {currentYear}
                 </span>

                 <button onClick={() => {
                     const next = new Date(currentYear, currentMonth + 1);
                     setCurrentMonth(next.getMonth());
                     setCurrentYear(next.getFullYear());
                 }} className="text-gray-400 dark:text-zinc-500 hover:text-gray-900 bg-white dark:bg-[#18181B] p-1 rounded-lg shadow-sm active:scale-95"><ChevronRight className="w-5 h-5" /></button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-center mb-6">
                {weekDays.map(d => (
                    <div key={d} className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 mb-2">{d}</div>
                ))}
                {renderCalendar()}
            </div>

            {/* Milestones */}
            <div className="mb-6">
                <h3 className="flex items-center gap-2 text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
                    <Trophy className="w-3 h-3 text-yellow-500" />
                    {lang === 'vi' ? 'Mốc thưởng lớn' : 'Big Milestones'}
                </h3>
                <div className="grid grid-cols-3 gap-2 md:gap-3">
                    {[
                        { days: 7, reward: 20 },
                        { days: 14, reward: 50 },
                        { days: 30, reward: 100 },
                    ].map((m) => {
                        const isUnlocked = streak >= m.days;
                        const isClaimed = claimedMilestones.includes(m.days);

                        return (
                            <div key={m.days} className={`bg-gray-50 dark:bg-[#27272A] rounded-xl p-3 flex flex-col items-center border transition-all ${isUnlocked ? 'border-green-400 bg-green-50 dark:bg-green-500/10 shadow-sm' : 'border-gray-100 dark:border-zinc-800'}`}>
                                <div className="relative">
                                    <Gift className={`w-5 h-5 mb-2 ${isUnlocked ? 'text-green-500' : 'text-gray-400 dark:text-zinc-500'}`} />
                                    {isUnlocked && !isClaimed && <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-ping"></div>}
                                </div>
                                <span className={`text-[9px] uppercase font-bold tracking-wider ${isUnlocked ? 'text-green-700' : 'text-gray-500 dark:text-zinc-400'}`}>{lang === 'vi' ? `Mốc ${m.days}` : `Day ${m.days}`}</span>
                                <span className={`text-[10px] font-black ${isUnlocked ? 'text-green-600' : 'text-gray-400 dark:text-zinc-500'}`}>+{m.reward} V</span>
                                
                                <div className="mt-2 w-full">
                                    {isClaimed ? (
                                        <div className="w-full py-1 bg-green-100 rounded-full text-[9px] font-bold text-green-700 flex items-center justify-center gap-1">
                                            <Check className="w-3 h-3" /> Đã nhận
                                        </div>
                                    ) : isUnlocked ? (
                                        <button 
                                            onClick={() => handleClaimMilestone(m.days)}
                                            className="w-full py-1 bg-green-500 hover:bg-green-600 text-white rounded-full text-[9px] font-bold uppercase shadow-sm active:scale-95"
                                        >
                                            NHẬN
                                        </button>
                                    ) : (
                                        <div className="flex justify-center bg-gray-100 dark:bg-zinc-800 py-1 rounded-full w-full">
                                            <Lock className="w-3 h-3 text-gray-400 dark:text-zinc-500" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {message && (
                <div className={`mb-4 p-3 rounded-xl text-center text-xs font-bold animate-fade-in ${message.includes('thành công') || message.includes('success') ? 'bg-green-50 dark:bg-green-500/10 text-green-600 border border-green-200 dark:border-green-500/30' : 'bg-red-50 dark:bg-red-500/10 text-red-600 border border-red-200 dark:border-red-500/30'}`}>
                    {message}
                </div>
            )}

            {/* Action Button */}
            <button 
                onClick={handleClaim}
                disabled={checkedIn || loading}
                className={`w-full py-4 rounded-2xl font-bold uppercase tracking-widest text-white shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                    checkedIn 
                    ? 'bg-gray-300 cursor-not-allowed text-gray-500 dark:text-zinc-400 shadow-none' 
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-500/30'
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
    document.body
  );
};
