
import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../components/Icons';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../services/supabaseClient';
import { getPackages, getActivePromotion } from '../services/economyService';
import { getShowcaseImages } from '../services/storageService'; 
import { CreditPackage, PromotionCampaign } from '../types';
import { useNotification } from '../components/NotificationSystem';

interface LandingProps {
  onEnter: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onEnter }) => {
  const { notify } = useNotification(); 
  const [showLogin, setShowLogin] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [beat, setBeat] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Auth Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  // ERROR FIXING STATE
  const [showSqlFix, setShowSqlFix] = useState(false);

  // Data from Admin Settings
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [activePromo, setActivePromo] = useState<PromotionCampaign | null>(null);
  
  // Showcase Data
  const [displayShowcase, setDisplayShowcase] = useState<any[]>([]);

  // Timer for Flash Sale
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  // Real-time Stats State
  const [stats, setStats] = useState({
    users: 662,
    images: 1648,
    visits: 10559
  });

  // Default Fallback Showcase Items (If no shared images exist)
  const defaultShowcaseItems = useMemo(() => [
    { author: "@NeoArtist", img: "https://picsum.photos/400/600?random=10", border: "border-audi-pink" },
    { author: "@DragonSlayer", img: "https://picsum.photos/400/600?random=11", border: "border-audi-purple" },
    { author: "@ClassicVibe", img: "https://picsum.photos/400/600?random=12", border: "border-audi-cyan" },
    { author: "@KawaiiMode", img: "https://picsum.photos/400/600?random=13", border: "border-audi-lime" },
    { author: "@BotMaker", img: "https://picsum.photos/400/600?random=14", border: "border-audi-pink" },
    { author: "@PhotoGenius", img: "https://picsum.photos/400/600?random=15", border: "border-audi-purple" },
    { author: "@OtakuKing", img: "https://picsum.photos/400/600?random=16", border: "border-audi-cyan" },
    { author: "@RetroGamer", img: "https://picsum.photos/400/600?random=17", border: "border-audi-lime" },
  ], []);

  // Load Data
  useEffect(() => {
      const fetchData = async () => {
          const pkgs = await getPackages();
          const promo = await getActivePromotion();
          setPackages(pkgs); 
          setActivePromo(promo);

          const sharedImages = await getShowcaseImages();
          
          if (sharedImages && sharedImages.length > 0) {
              const borderColors = ["border-audi-pink", "border-audi-purple", "border-audi-cyan", "border-audi-lime"];
              const mappedImages = sharedImages.map((img, index) => ({
                  author: `@${img.userName || 'Artist'}`,
                  img: img.url,
                  border: borderColors[index % borderColors.length]
              }));

              if (mappedImages.length < 5) {
                  setDisplayShowcase([...mappedImages, ...defaultShowcaseItems.slice(0, 8 - mappedImages.length)]);
              } else {
                  setDisplayShowcase(mappedImages);
              }
          } else {
              setDisplayShowcase(defaultShowcaseItems);
          }
      };
      fetchData();
  }, [defaultShowcaseItems]);

  // Update Countdown Timer
  useEffect(() => {
    if (!activePromo) return;

    const interval = setInterval(() => {
        const now = new Date().getTime();
        const end = new Date(activePromo.endTime).getTime();
        const diff = end - now;

        if (diff <= 0) {
            setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
            return;
        }

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ d, h, m, s });
    }, 1000);

    return () => clearInterval(interval);
  }, [activePromo]);

  // Rhythm Simulator
  useEffect(() => {
    const interval = setInterval(() => {
      setBeat(prev => !prev);
    }, 461); 
    return () => clearInterval(interval);
  }, []);

  // Real-time Counter Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => ({
        users: prev.users + (Math.random() > 0.7 ? 1 : 0), 
        images: prev.images + Math.floor(Math.random() * 2) + 1,
        visits: prev.visits + Math.floor(Math.random() * 5) + 1
      }));
    }, 1000); 

    return () => clearInterval(interval);
  }, []);

  // Mouse Parallax
  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const x = (clientX / window.innerWidth - 0.5) * 20;
    const y = (clientY / window.innerHeight - 0.5) * 20;
    setMousePos({ x, y });
  };

  const handleStart = () => {
    setAuthMode('login'); 
    setShowLogin(true);
  };

  const handleGoogleLogin = async () => {
      const { error } = await signInWithGoogle();
      if (error) {
          notify(error.message || "Không thể kết nối với Google.", 'error');
      }
  };

  // --- VALIDATION LOGIC ---
  const isValidEmail = (email: string) => {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleEmailAuth = async () => {
      if (!email.trim() || !password.trim()) {
          notify("Vui lòng nhập đầy đủ Email và Mật khẩu", 'warning');
          return;
      }

      if (!isValidEmail(email)) {
          notify("Địa chỉ Email không đúng định dạng", 'warning');
          return;
      }

      if (password.length < 6) {
          notify("Mật khẩu quá ngắn! Tối thiểu 6 ký tự.", 'warning');
          return;
      }
      
      setIsAuthLoading(true);
      try {
          if (authMode === 'login') {
              const { error } = await signInWithEmail(email, password);
              if (error) {
                  if (error.message.includes('Invalid login credentials')) {
                      notify("Sai email hoặc mật khẩu.", 'error');
                  } else {
                      notify("Đăng nhập thất bại: " + error.message, 'error');
                  }
              }
              // Success handled by App.tsx
          } else {
              // Register
              if (password !== confirmPassword) {
                  notify("Mật khẩu xác nhận không khớp!", 'error');
                  setIsAuthLoading(false);
                  return;
              }

              const { error } = await signUpWithEmail(email, password);
              if (error) {
                  if (error.message.includes('Database error') || error.message.includes('saving new user')) {
                      setShowSqlFix(true); 
                  } else if (error.message.includes('User already registered')) {
                      notify("Email này đã được đăng ký. Vui lòng đăng nhập.", 'info');
                  } else {
                      notify("Đăng ký thất bại: " + error.message, 'error');
                  }
              } else {
                  notify("Đăng ký thành công! Đang tự động đăng nhập...", 'success');
              }
          }
      } catch (e: any) {
          console.error(e);
          notify("Có lỗi hệ thống: " + e.message, 'error');
      } finally {
          setIsAuthLoading(false);
      }
  };

  const getMarqueeText = () => {
      if (activePromo) {
          return `🔥 Sự kiện ${activePromo.name}: Khuyến mãi +${activePromo.bonusPercent}% Vcoin cho mọi giao dịch! 💎 Cơ hội nạp 1 nhận 2 đang diễn ra!`;
      }
      return "🎉 Sự kiện Khai Trương: Miễn phí 50 lượt tạo ảnh cho thành viên mới! 💎 Nạp Vcoin lần đầu x2 giá trị";
  };

  const sqlFixCode = `-- CHẠY MÃ NÀY TRONG SQL EDITOR ĐỂ SỬA LỖI ĐĂNG KÝ
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Drop existing policies to avoid "already exists" errors
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can insert own profile') THEN
        DROP POLICY "Users can insert own profile" ON public.users;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can update own profile') THEN
        DROP POLICY "Users can update own profile" ON public.users;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can read own profile') THEN
        DROP POLICY "Users can read own profile" ON public.users;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Public read access') THEN
        DROP POLICY "Public read access" ON public.users;
    END IF;
END $$;

-- 1. Ensure table structure
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vcoin_balance numeric default 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin boolean default false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name text;

-- 2. Create Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id, email, display_name, photo_url, vcoin_balance, is_admin, created_at, updated_at
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    0, -- 0 Vcoin Default
    false,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can read own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Public read access" ON public.users FOR SELECT TO anon USING (true);`;

  return (
    <div 
        className="relative w-full bg-[#090014] text-white font-sans overflow-x-hidden min-h-screen"
        onMouseMove={handleMouseMove}
    >
      
      {/* --- BACKGROUND LAYER --- */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="dance-floor-container opacity-40 md:opacity-100">
             <div className="dance-floor opacity-50"></div>
          </div>
          <div className={`absolute top-0 left-1/4 w-0.5 md:w-1 h-[150vh] bg-audi-pink blur-md origin-top animate-[spin_4s_ease-in-out_infinite] opacity-30`} style={{ transform: `rotate(${mousePos.x}deg)` }}></div>
          <div className={`absolute top-0 right-1/4 w-0.5 md:w-1 h-[150vh] bg-audi-cyan blur-md origin-top animate-[spin_5s_ease-in-out_infinite_reverse] opacity-30`} style={{ transform: `rotate(${-mousePos.x}deg)` }}></div>
      </div>

      {/* --- PROMOTION TICKER (HEADER) --- */}
      <div className="fixed top-0 left-0 right-0 h-8 bg-gradient-to-r from-audi-purple via-audi-pink to-audi-cyan z-[60] flex items-center overflow-hidden border-b border-white/20 shadow-[0_0_15px_#FF0099]">
          <div className="animate-[marquee_20s_linear_infinite] whitespace-nowrap flex gap-10 items-center font-game text-xs md:text-sm font-bold text-black uppercase tracking-widest">
              {[1,2,3,4,5].map(i => (
                  <span key={i}>{getMarqueeText()}</span>
              ))}
          </div>
      </div>

      {/* --- TOP HUD --- */}
      <div className="fixed top-8 left-0 right-0 z-50 px-4 md:px-6 py-4 flex justify-between items-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 md:gap-3 bg-black/60 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-white/10 shadow-lg">
               <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-tr from-audi-pink to-audi-purple flex items-center justify-center animate-spin-slow shadow-[0_0_15px_#FF0099]">
                   <Icons.Sparkles className="w-4 h-4 md:w-5 md:h-5 text-white" />
               </div>
               <div className="flex flex-col">
                   <span className="font-game font-bold text-sm md:text-xl tracking-widest text-white leading-none">AUDITION AI</span>
                   <span className="text-[8px] md:text-[10px] text-audi-cyan font-bold tracking-wider hidden md:block">PHOTO STUDIO</span>
               </div>
          </div>
          
          <button 
            onClick={handleStart} 
            className="pointer-events-auto group relative px-4 py-1.5 md:px-8 md:py-2 overflow-hidden rounded-full bg-white/5 border border-white/20 hover:border-audi-lime transition-all backdrop-blur-md"
          >
             <div className="absolute inset-0 bg-audi-lime/20 translate-y-full group-hover:translate-y-0 transition-transform"></div>
             <span className="relative font-game font-bold text-xs md:text-sm uppercase tracking-widest group-hover:text-audi-lime">Login</span>
          </button>
      </div>

      <div className="min-h-screen"></div> {/* Placeholder for main content */}

      {/* --- LOGIN MODAL (UPDATED OVERLAY) --- */}
      {showLogin && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
              <div className="w-full max-w-md bg-[#090014] border-2 border-audi-pink rounded-3xl p-8 relative shadow-[0_0_50px_rgba(255,0,153,0.3)]">
                  <button onClick={() => setShowLogin(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                      <Icons.X className="w-6 h-6" />
                  </button>

                  <div className="text-center mb-8">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-audi-pink to-audi-purple flex items-center justify-center mx-auto mb-4 animate-bounce">
                          <Icons.User className="w-8 h-8 text-white" />
                      </div>
                      <h2 className="font-game text-2xl font-bold text-white">{authMode === 'login' ? 'ĐĂNG NHẬP' : 'ĐĂNG KÝ'}</h2>
                      <p className="text-slate-400 text-sm">{authMode === 'login' ? 'Chào mừng vũ công quay trở lại!' : 'Tạo tài khoản để bắt đầu sáng tạo!'}</p>
                  </div>

                  <div className="space-y-4">
                      {/* ... form fields ... */}
                      <div>
                          <label className="text-xs font-bold text-audi-cyan uppercase mb-1 block">Email</label>
                          <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-white/5 border border-white/20 rounded-xl p-3 text-white focus:border-audi-pink outline-none transition-colors" 
                            placeholder="Nhập email..." 
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-audi-cyan uppercase mb-1 block">Mật khẩu</label>
                          <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-white/5 border border-white/20 rounded-xl p-3 text-white focus:border-audi-pink outline-none transition-colors" 
                            placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)..." 
                          />
                      </div>
                      
                      {authMode === 'register' && (
                         <div>
                            <label className="text-xs font-bold text-audi-cyan uppercase mb-1 block">Nhập lại Mật khẩu</label>
                            <input 
                                type="password" 
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-white/5 border border-white/20 rounded-xl p-3 text-white focus:border-audi-pink outline-none transition-colors" 
                                placeholder="Xác nhận mật khẩu..." 
                            />
                        </div>
                      )}
                      
                      <button 
                        onClick={handleEmailAuth}
                        disabled={isAuthLoading}
                        className="w-full py-4 mt-4 bg-gradient-to-r from-audi-pink to-audi-purple rounded-xl font-bold text-white shadow-lg hover:shadow-audi-pink/50 transition-all transform hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                          {isAuthLoading && <Icons.Loader className="w-4 h-4 animate-spin" />}
                          {authMode === 'login' ? 'ĐĂNG NHẬP NGAY' : 'ĐĂNG KÝ NGAY'}
                      </button>

                      <div className="relative flex py-2 items-center">
                          <div className="flex-grow border-t border-white/10"></div>
                          <span className="flex-shrink-0 mx-4 text-slate-500 text-xs uppercase">HOẶC</span>
                          <div className="flex-grow border-t border-white/10"></div>
                      </div>

                      <button 
                          onClick={handleGoogleLogin}
                          className="w-full py-3 bg-white hover:bg-slate-200 text-black font-bold rounded-xl flex items-center justify-center gap-3 transition-colors shadow-lg group"
                      >
                          <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                          </svg>
                          <span>Tiếp tục với Google</span>
                      </button>

                      <div className="text-center mt-4 flex flex-col gap-2">
                          <div>
                              <span className="text-slate-500 text-xs">{authMode === 'login' ? 'Chưa có tài khoản? ' : 'Đã có tài khoản? '}</span>
                              <button 
                                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                                className="text-audi-lime font-bold text-xs cursor-pointer hover:underline bg-transparent border-none p-0 inline"
                              >
                                {authMode === 'login' ? 'Đăng ký mới' : 'Đăng nhập'}
                              </button>
                          </div>
                          
                          <button 
                            onClick={onEnter}
                            className="text-slate-500 text-xs hover:text-white underline decoration-dashed"
                          >
                              Bỏ qua & Dùng thử (Chế độ Khách)
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- SQL FIX MODAL (NEW OVERLAY) --- */}
      {showSqlFix && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-[#12121a] w-full max-w-2xl p-6 rounded-2xl border border-red-500/50 shadow-[0_0_50px_rgba(255,0,0,0.2)] flex flex-col max-h-[90vh]">
                  <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                          <Icons.Database className="w-6 h-6" />
                      </div>
                      <div>
                          <h3 className="text-xl font-bold text-white">LỖI DATABASE NGHIÊM TRỌNG</h3>
                          <p className="text-slate-400 text-xs">Phát hiện xung đột Schema hoặc Trigger bị hỏng</p>
                      </div>
                  </div>
                  
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-4">
                      <p className="text-sm text-red-300 font-bold mb-1">Nguyên nhân:</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                          Trigger <code>handle_new_user</code> đang cố gắng ghi vào các cột không tồn tại (balance, role, avatar_url) thay vì (vcoin_balance, is_admin, photo_url). Điều này làm hỏng quá trình đăng ký.
                      </p>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col">
                      <p className="text-sm font-bold text-green-400 mb-2 uppercase">Giải pháp: Copy đoạn mã SQL dưới đây và chạy trong Supabase SQL Editor</p>
                      <div className="relative h-64 bg-black/50 border border-white/10 rounded-xl overflow-hidden">
                          <pre className="absolute inset-0 p-4 text-[10px] md:text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap selection:bg-audi-pink selection:text-white">
                              {sqlFixCode}
                          </pre>
                          <button 
                            onClick={() => {
                                navigator.clipboard.writeText(sqlFixCode);
                                notify("Đã sao chép SQL!", 'info');
                            }}
                            className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
                          >
                              <Icons.Copy className="w-4 h-4" /> Sao chép
                          </button>
                      </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                      <a 
                        href="https://supabase.com/dashboard/project/_/sql" 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex-1 py-3 bg-audi-purple hover:bg-purple-600 text-white rounded-xl font-bold text-center transition-colors flex items-center justify-center gap-2"
                      >
                          <Icons.Database className="w-4 h-4" /> Mở SQL Editor
                      </a>
                      <button onClick={() => setShowSqlFix(false)} className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors">
                          Đóng
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
