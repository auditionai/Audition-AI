
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { getShowcaseImages } from '../services/storageService';
import { supabase } from '../services/supabaseClient';
import { GeneratedImage } from '../types';

interface LandingProps {
  onEnter: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onEnter }) => {
  const [showLogin, setShowLogin] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login'); 
  const [beat, setBeat] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Showcase State
  const [showcaseImages, setShowcaseImages] = useState<any[]>([]);

  // Real-time Stats State
  const [stats, setStats] = useState({
    users: 662,
    images: 1648,
    visits: 10559
  });

  // Load Showcase Images
  useEffect(() => {
    const loadShowcase = async () => {
        // Default Mock Data
        const mockItems = [
            { title: "CYBERPUNK", author: "@NeoArtist", img: "https://picsum.photos/400/600?random=10", border: "border-audi-pink" },
            { title: "FANTASY", author: "@DragonSlayer", img: "https://picsum.photos/400/600?random=11", border: "border-audi-purple" },
            { title: "VINTAGE", author: "@ClassicVibe", img: "https://picsum.photos/400/600?random=12", border: "border-audi-cyan" },
            { title: "CHIBI", author: "@KawaiiMode", img: "https://picsum.photos/400/600?random=13", border: "border-audi-lime" },
            { title: "MECHA", author: "@BotMaker", img: "https://picsum.photos/400/600?random=14", border: "border-audi-pink" },
        ];

        try {
            const realImages = await getShowcaseImages();
            if (realImages && realImages.length > 0) {
                // Transform GeneratedImage to Showcase format
                const formattedRealImages = realImages.map((img: GeneratedImage, idx: number) => {
                    // Cycle through border colors
                    const borders = ["border-audi-pink", "border-audi-purple", "border-audi-cyan", "border-audi-lime", "border-audi-yellow"];
                    return {
                        title: img.toolName.split(' ')[0].toUpperCase(),
                        author: img.userName ? `@${img.userName}` : '@AuditionUser',
                        img: img.url,
                        border: borders[idx % borders.length]
                    };
                });
                // Merge real images first, then mock data
                setShowcaseImages([...formattedRealImages, ...mockItems]);
            } else {
                setShowcaseImages(mockItems);
            }
        } catch (e) {
            setShowcaseImages(mockItems);
        }
    };
    loadShowcase();
  }, []);

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
      if (!supabase) {
          alert("Không thể kết nối đến máy chủ xác thực. Vui lòng kiểm tra cấu hình mạng hoặc biến môi trường.");
          onEnter(); 
          return;
      }
      
      setIsLoggingIn(true);
      
      try {
          // Debugging info for deployment issues
          console.log("[Auth] Starting Google OAuth...");
          console.log("[Auth] Redirect URL:", window.location.origin);

          const { error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                  redirectTo: window.location.origin,
                  queryParams: {
                      access_type: 'offline',
                      prompt: 'consent'
                  }
              }
          });

          if (error) {
              console.error("[Auth] Error:", error);
              // Handle common misconfiguration errors
              if (error.message.includes('redirect_uri_mismatch') || error.status === 400) {
                  alert(`Lỗi Cấu Hình: Vui lòng thêm "${window.location.origin}" vào danh sách "Redirect URLs" trong Supabase Dashboard > Authentication > URL Configuration.`);
              } else {
                  alert("Lỗi đăng nhập: " + error.message);
              }
              setIsLoggingIn(false);
          }
      } catch (e: any) {
          console.error("[Auth] Exception:", e);
          alert("Đã xảy ra lỗi không mong muốn: " + (e.message || e));
          setIsLoggingIn(false);
      }
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('de-DE').format(num);
  };

  return (
    <div 
        className="relative w-full bg-[#090014] text-white font-sans overflow-x-hidden min-h-screen"
        onMouseMove={handleMouseMove}
    >
      
      {/* --- BACKGROUND LAYER --- */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          {/* Enhanced 3D Floor Container */}
          <div className="dance-floor-container opacity-40 md:opacity-100">
             <div className="dance-floor opacity-50"></div>
          </div>
          
          {/* Dynamic Laser Beams (Mobile Optimized) */}
          <div className={`absolute top-0 left-1/4 w-0.5 md:w-1 h-[150vh] bg-audi-pink blur-md origin-top animate-[spin_4s_ease-in-out_infinite] opacity-30`} style={{ transform: `rotate(${mousePos.x}deg)` }}></div>
          <div className={`absolute top-0 right-1/4 w-0.5 md:w-1 h-[150vh] bg-audi-cyan blur-md origin-top animate-[spin_5s_ease-in-out_infinite_reverse] opacity-30`} style={{ transform: `rotate(${-mousePos.x}deg)` }}></div>
      </div>

      {/* --- PROMOTION TICKER (HEADER) --- */}
      <div className="fixed top-0 left-0 right-0 h-8 bg-gradient-to-r from-audi-purple via-audi-pink to-audi-cyan z-[60] flex items-center overflow-hidden border-b border-white/20 shadow-[0_0_15px_#FF0099]">
          <div className="animate-[marquee_20s_linear_infinite] whitespace-nowrap flex gap-10 items-center font-game text-xs md:text-sm font-bold text-black uppercase tracking-widest">
              <span>🎉 Sự kiện Khai Trương: Miễn phí 50 lượt tạo ảnh cho thành viên mới!</span>
              <span>💎 Nạp Vcoin lần đầu x2 giá trị</span>
              <span>🔥 Tính năng mới: Ghép mặt đôi Couple cực chuẩn</span>
              <span>🚀 Gemini 3.0 Engine đã cập nhật - Xử lý siêu tốc</span>
              <span>🎉 Sự kiện Khai Trương: Miễn phí 50 lượt tạo ảnh cho thành viên mới!</span>
              <span>💎 Nạp Vcoin lần đầu x2 giá trị</span>
          </div>
      </div>

      {/* --- TOP HUD (Mobile Optimized) --- */}
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

      {/* --- HERO SECTION --- */}
      <div className="relative min-h-screen flex flex-col items-center justify-center pt-20 md:pt-24 pb-20 px-4 z-10">
          
          {/* Combo Meter */}
          <div className={`absolute top-[12%] right-2 md:top-[25%] md:right-[15%] transform rotate-12 transition-all duration-100 origin-center z-0 opacity-80 md:opacity-100 ${beat ? 'scale-110 md:scale-125 rotate-6' : 'scale-90 md:scale-100 rotate-12'}`}>
              <div className="relative scale-75 md:scale-100">
                  <span className="font-game text-5xl md:text-8xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-[#ccff00] to-[#55aa00] drop-shadow-[0_0_15px_rgba(204,255,0,0.8)] z-10 block animate-neon-flash">PERFECT</span>
                  <div className="absolute -bottom-6 right-0 bg-audi-pink text-white font-game font-bold text-xl px-4 py-1 rounded skew-x-[-10deg] shadow-[0_0_20px_#FF0099] animate-bounce">
                      x99 Gen
                  </div>
              </div>
          </div>

          {/* Main Title */}
          <div 
            className="text-center relative mb-12 md:mb-16 z-20 w-full"
            style={{ 
                transform: window.innerWidth > 768 ? `perspective(1000px) rotateX(${mousePos.y * 0.5}deg) rotateY(${mousePos.x * 0.5}deg)` : 'none' 
            }}
          >
              <div className={`transition-transform duration-75 ${beat ? 'scale-[1.01]' : 'scale-100'}`}>
                <h1 className="leading-[1.1] flex flex-col items-center">
                    <span className="block font-game text-3xl md:text-6xl font-bold tracking-wider text-audi-cyan mb-2 drop-shadow-[0_0_10px_rgba(33,212,253,0.8)]">
                        THÀNH PHỐ
                    </span>
                    <span className="block font-sans text-5xl sm:text-7xl md:text-9xl font-black tracking-tighter text-outline-heavy uppercase transform -rotate-2 leading-none py-2">
                        VŨ HỘI AI
                    </span>
                    <span className="block font-game text-sm md:text-3xl font-bold text-white mt-4 tracking-[0.3em] md:tracking-[0.5em] bg-black/30 backdrop-blur-sm inline-block px-4 py-2 rounded border border-white/10">
                        PHOTO STUDIO
                    </span>
                </h1>
              </div>
              
              <div className="mt-8 grid grid-cols-2 md:flex md:flex-wrap justify-center gap-2 md:gap-3 max-w-sm md:max-w-none mx-auto">
                  {['TẠO ẢNH 4K', 'GHÉP MẶT', 'TÁCH NỀN', 'ANIME STYLE'].map((tag, i) => (
                      <span key={i} className="px-3 py-2 border border-audi-cyan/50 rounded-lg text-[10px] md:text-xs font-bold tracking-[0.1em] text-audi-cyan uppercase bg-black/60 backdrop-blur-sm hover:bg-audi-cyan hover:text-black transition-colors cursor-default shadow-[0_0_10px_rgba(33,212,253,0.2)] text-center">
                          {tag}
                      </span>
                  ))}
              </div>
          </div>

          {/* Start Button */}
          <div className="relative group cursor-pointer z-30 w-full max-w-md md:w-auto" onClick={handleStart}>
              <div className="absolute -inset-1 bg-gradient-to-r from-audi-pink via-audi-purple to-audi-cyan rounded-2xl blur opacity-70 group-hover:opacity-100 group-hover:blur-xl transition-all duration-200 animate-pulse"></div>
              <button className="relative w-full px-8 md:px-16 py-6 md:py-8 bg-[#090014] rounded-xl border-2 border-white/20 overflow-hidden flex items-center justify-center md:justify-start gap-4 md:gap-6 group-hover:translate-y-[-2px] transition-transform">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-audi-pink/10 to-audi-cyan/10 group-hover:opacity-100 transition-opacity"></div>
                  
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-audi-lime flex items-center justify-center shadow-[0_0_20px_#ccff00] group-hover:scale-110 transition-transform shrink-0">
                      <Icons.Play className="w-6 h-6 md:w-8 md:h-8 text-black fill-current ml-1" />
                  </div>
                  
                  <div className="text-left">
                      <span className="block text-xs md:text-sm font-bold text-audi-cyan uppercase tracking-[0.2em] mb-1">AUDITION STUDIO</span>
                      <span className="block text-2xl md:text-4xl font-game font-black text-white italic whitespace-nowrap">VÀO STUDIO</span>
                  </div>
                  
                  <div className="absolute top-0 -left-full w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg] animate-[shimmer_2s_infinite]"></div>
              </button>
          </div>
      </div>

      {/* --- AI SHOWCASE (Marquee Effect) --- */}
      <div className="py-16 md:py-24 relative z-20 bg-gradient-to-b from-[#090014] to-[#120024] overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 mb-8 md:mb-12">
              <div className="flex flex-col md:flex-row items-end justify-between gap-4">
                  <div>
                      <h2 className="font-game text-3xl md:text-6xl font-bold text-white flex items-center gap-3">
                         <Icons.Image className="w-8 h-8 md:w-10 md:h-10 text-audi-yellow" />
                         AI SHOWCASE
                      </h2>
                      <p className="text-audi-cyan font-bold mt-2 text-sm md:text-base">Thư viện ảnh đẹp tạo bởi cộng đồng</p>
                  </div>
              </div>
          </div>

          {/* Marquee Container */}
          <div className="w-full overflow-hidden relative group">
              <div className="absolute top-0 left-0 bottom-0 w-12 md:w-32 bg-gradient-to-r from-[#090014] to-transparent z-10 pointer-events-none"></div>
              <div className="absolute top-0 right-0 bottom-0 w-12 md:w-32 bg-gradient-to-l from-[#090014] to-transparent z-10 pointer-events-none"></div>

              {/* Scrolling Track */}
              <div className="flex w-max animate-marquee pause-on-hover gap-6 px-6">
                   {showcaseImages.map((item, i) => (
                       <ShowcaseCard key={`s1-${i}`} item={item} />
                   ))}
                   {showcaseImages.map((item, i) => (
                       <ShowcaseCard key={`s2-${i}`} item={item} />
                   ))}
              </div>
          </div>
      </div>

      {/* --- LOGIN MODAL --- */}
      {showLogin && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
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
                  
                  {/* Google Quick Login Button */}
                  <div className="mb-6">
                      <button 
                        onClick={handleGoogleLogin} 
                        disabled={isLoggingIn}
                        className="w-full py-3 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-slate-200 transition-colors disabled:opacity-70"
                      >
                          {isLoggingIn ? (
                              <Icons.Loader className="w-5 h-5 animate-spin" />
                          ) : (
                              <svg className="w-5 h-5" viewBox="0 0 24 24">
                                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                              </svg>
                          )}
                          {isLoggingIn ? 'Đang kết nối...' : 'Tiếp tục với Google'}
                      </button>
                      <div className="flex items-center gap-4 my-4">
                          <div className="h-px bg-white/10 flex-1"></div>
                          <span className="text-xs text-slate-500 font-bold uppercase">Hoặc</span>
                          <div className="h-px bg-white/10 flex-1"></div>
                      </div>
                  </div>

                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-audi-cyan uppercase mb-1 block">Tên tài khoản</label>
                          <input type="text" className="w-full bg-white/5 border border-white/20 rounded-xl p-3 text-white focus:border-audi-pink outline-none transition-colors" placeholder="Nhập tên đăng nhập..." />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-audi-cyan uppercase mb-1 block">Mật khẩu</label>
                          <input type="password" className="w-full bg-white/5 border border-white/20 rounded-xl p-3 text-white focus:border-audi-pink outline-none transition-colors" placeholder="Nhập mật khẩu..." />
                      </div>
                      <button onClick={onEnter} className="w-full py-4 mt-4 bg-gradient-to-r from-audi-pink to-audi-purple rounded-xl font-bold text-white shadow-lg hover:shadow-audi-pink/50 transition-all transform hover:scale-[1.02]">
                          {authMode === 'login' ? 'ĐĂNG NHẬP NGAY' : 'ĐĂNG KÝ NGAY'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

const ShowcaseCard = ({ item }: { item: any }) => (
    <div className="group relative w-64 h-96 md:w-80 md:h-[500px] shrink-0 cursor-pointer overflow-hidden rounded-[2rem] border-2 border-transparent hover:border-white/50 transition-all duration-300">
        <div className={`absolute inset-0 bg-black rounded-[2rem] border-2 ${item.border} transition-transform duration-500 z-10 overflow-hidden`}>
            <img src={item.img} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-500 scale-110 group-hover:scale-100" alt={item.title} />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90"></div>
            
            <div className="absolute bottom-0 left-0 right-0 p-6 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                <h3 className="font-game text-2xl font-bold text-white italic leading-none mb-1 drop-shadow-lg">{item.title}</h3>
                <div className="flex items-center gap-2 mt-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 border border-white/20"></div>
                    <span className="text-xs text-slate-300 font-bold tracking-wider">{item.author}</span>
                </div>
            </div>

             <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
        </div>
    </div>
);
