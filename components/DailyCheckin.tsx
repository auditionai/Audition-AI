
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';
import { getCheckinStatus, performCheckin, claimMilestoneReward } from '../services/economyService';

interface DailyCheckinProps {
  onClose: () => void;
  onSuccess: () => void;
  lang: 'vi' | 'en';
}

const DB_FIX_SQL = `-- 1. Clean up old triggers and functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 2. Drop existing policies to avoid "already exists" errors
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Public read users') THEN
        DROP POLICY "Public read users" ON public.users;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can update own profile') THEN
        DROP POLICY "Users can update own profile" ON public.users;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can insert own profile') THEN
        DROP POLICY "Users can insert own profile" ON public.users;
    END IF;
END $$;

-- 3. Re-create Function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id, 
    email, 
    display_name, 
    photo_url, 
    diamonds, 
    is_admin, 
    created_at,
    updated_at
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    25, -- 25 Vcoin Bonus
    false,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Activate Trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. Enable RLS and Create Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
`;

export const DailyCheckin: React.FC<DailyCheckinProps> = ({ onClose, onSuccess, lang }) => {
  const [streak, setStreak] = useState(0);
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [claimedMilestones, setClaimedMilestones] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [showSqlFix, setShowSqlFix] = useState(false);
  
  // Calendar State
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  useEffect(() => {
    const loadStatus = async () => {
        const status = await getCheckinStatus();
        setStreak(status.streak); // Now represents total monthly check-ins
        setCheckedIn(status.isCheckedInToday);
        setHistory(status.history);
        setClaimedMilestones(status.claimedMilestones);
    };
    loadStatus();
  }, []);

  const handleClaim = async () => {
      setLoading(true);
      setMessage(null);
      setShowSqlFix(false);
      try {
          const res = await performCheckin();
          if (res.success) {
              setStreak(res.newStreak);
              setCheckedIn(true);
              setHistory(prev => [...prev, new Date().toLocaleDateString('sv-SE')]);
              
              setMessage(lang === 'vi' ? `Điểm danh thành công! +${res.reward} Vcoin` : `Check-in success! +${res.reward} Vcoin`);

              setTimeout(() => {
                  onSuccess();
              }, 1500); 
          } else {
              setMessage(res.message || (lang === 'vi' ? 'Lỗi điểm danh' : 'Error checking in'));
              // Detect FK error signal from service
              if (res.message?.includes('FK') || res.message?.includes('foreign key')) {
                  setShowSqlFix(true);
              }
          }
      } catch (e) {
          console.error(e);
          setMessage('System Error');
      } finally {
          setLoading(false);
      }
  };

  const handleClaimMilestone = async (day: number) => {
      setLoading(true);
      try {
          const res = await claimMilestoneReward(day);
          if (res.success) {
              setMessage(res.message);
              setClaimedMilestones(prev => [...prev, day]);
              onSuccess(); // Refresh balance
          } else {
              setMessage(res.message);
          }
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  }

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const renderCalendar = () => {
      const daysCount = getDaysInMonth(currentMonth, currentYear);
      const startDay = getFirstDayOfMonth(currentMonth, currentYear); // 0 = Sunday
      const days = [];

      // Empty slots for previous month
      for (let i = 0; i < startDay; i++) {
          days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
      }

      // Days
      for (let d = 1; d <= daysCount; d++) {
          // Format date as YYYY-MM-DD
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
              </div>
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
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                 <h2 className="font-game text-xl font-bold text-white uppercase">{lang === 'vi' ? 'Điểm Danh Nhận Quà' : 'Daily Check-in'}</h2>
                 <button onClick={onClose} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
                     <Icons.X className="w-5 h-5 text-white" />
                 </button>
            </div>

            {/* Streak Banner */}
            <div className="bg-[#1a1a24] rounded-2xl p-4 flex items-center gap-4 border border-white/5 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-orange-500 to-red-500 flex items-center justify-center shadow-lg">
                    <Icons.Flame className="w-6 h-6 text-white" />
                </div>
                <div>
                    <p className="text-xs text-slate-400 font-bold uppercase">{lang === 'vi' ? 'Tích lũy tháng này' : 'Monthly Check-ins'}</p>
                    <p className="text-2xl font-black text-white">{streak} {lang === 'vi' ? 'ngày' : 'days'}</p>
                </div>
                <div className="ml-auto text-right">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Quà hôm nay</div>
                    <div className="text-audi-yellow font-bold">+5 Vcoin</div>
                </div>
            </div>

            {/* Calendar Controls */}
            <div className="flex items-center justify-between mb-4 px-2">
                 <button onClick={() => {
                     const prev = new Date(currentYear, currentMonth - 1);
                     setCurrentMonth(prev.getMonth());
                     setCurrentYear(prev.getFullYear());
                 }} className="text-slate-400 hover:text-white"><Icons.ChevronLeft className="w-5 h-5" /></button>
                 
                 <span className="font-bold text-white uppercase tracking-widest text-sm">
                     {monthNames[currentMonth]}, {currentYear}
                 </span>

                 <button onClick={() => {
                     const next = new Date(currentYear, currentMonth + 1);
                     setCurrentMonth(next.getMonth());
                     setCurrentYear(next.getFullYear());
                 }} className="text-slate-400 hover:text-white"><Icons.ChevronRight className="w-5 h-5" /></button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-center mb-6">
                {weekDays.map(d => (
                    <div key={d} className="text-[10px] font-bold text-slate-500 mb-2">{d}</div>
                ))}
                {renderCalendar()}
            </div>

            {/* Milestones */}
            <div className="mb-6">
                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-3">
                    <Icons.Trophy className="w-3 h-3" />
                    {lang === 'vi' ? 'Mốc thưởng lớn (Cộng thêm)' : 'Big Milestones (Bonus)'}
                </h3>
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { days: 7, reward: 20 },
                        { days: 14, reward: 50 },
                        { days: 30, reward: 100 },
                    ].map((m) => {
                        const isUnlocked = streak >= m.days;
                        const isClaimed = claimedMilestones.includes(m.days);

                        return (
                            <div key={m.days} className={`bg-[#1a1a24] rounded-xl p-3 flex flex-col items-center border border-white/5 transition-all ${isUnlocked ? 'border-audi-lime shadow-[0_0_10px_rgba(204,255,0,0.2)]' : ''}`}>
                                <div className="relative">
                                    <Icons.Gift className={`w-5 h-5 mb-2 ${isUnlocked ? 'text-audi-lime' : 'text-slate-600'}`} />
                                    {isUnlocked && !isClaimed && <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-ping"></div>}
                                </div>
                                <span className="text-[9px] text-slate-500 uppercase">{lang === 'vi' ? `Mốc ${m.days}` : `Day ${m.days}`}</span>
                                <span className={`text-xs font-bold ${isUnlocked ? 'text-white' : 'text-slate-500'}`}>{m.reward} Vcoin</span>
                                
                                <div className="mt-2 w-full">
                                    {isClaimed ? (
                                        <div className="w-full py-1 bg-white/5 rounded text-[9px] font-bold text-green-500 flex items-center justify-center gap-1">
                                            <Icons.Check className="w-3 h-3" /> Đã nhận
                                        </div>
                                    ) : isUnlocked ? (
                                        <button 
                                            onClick={() => handleClaimMilestone(m.days)}
                                            className="w-full py-1 bg-audi-lime hover:bg-lime-400 text-black rounded text-[9px] font-bold animate-pulse"
                                        >
                                            NHẬN
                                        </button>
                                    ) : (
                                        <div className="flex justify-center">
                                            <Icons.Lock className="w-3 h-3 text-slate-700" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {message && (
                <div className={`mb-4 p-3 rounded-xl text-center text-sm font-bold animate-fade-in ${message.includes('thành công') || message.includes('success') ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-red-500/20 text-red-400 border border-red-500/50'}`}>
                    {message}
                </div>
            )}

            {/* SQL Fix Helper */}
            {showSqlFix && (
                <div className="mb-4 bg-red-500/10 border border-red-500/50 p-3 rounded-xl">
                    <p className="text-xs text-red-300 font-bold mb-2">⚠ Tài khoản chưa được đồng bộ Database (Trigger Lỗi)</p>
                    <button 
                        onClick={() => {
                            navigator.clipboard.writeText(DB_FIX_SQL);
                            alert("Đã copy mã SQL! Hãy chạy mã này trong Supabase SQL Editor.");
                        }}
                        className="w-full py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2"
                    >
                        <Icons.Database className="w-3 h-3" /> COPY MÃ SỬA LỖI SQL
                    </button>
                </div>
            )}

            {/* Action Button */}
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
    document.body
  );
};
