
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { signInWithGoogle } from '../services/supabaseClient';

interface LandingProps {
  onEnter: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onEnter }) => {
  const [showLogin, setShowLogin] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login'); // New state for toggling modes
  const [beat, setBeat] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Real-time Stats State
  const [stats, setStats] = useState({
    users: 662,
    images: 1648,
    visits: 10559
  });

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
        users: prev.users + (Math.random() > 0.7 ? 1 : 0), // Slow increment
        images: prev.images + Math.floor(Math.random() * 2) + 1, // Medium increment
        visits: prev.visits + Math.floor(Math.random() * 5) + 1  // Fast increment
      }));
    }, 1000); // Update every second

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
    setAuthMode('login'); // Reset to login when opening
    setShowLogin(true);
  };

  const handleGoogleLogin = async () => {
      const { error } = await signInWithGoogle();
      if (error) {
          alert(error.message || "Không thể kết nối với Google.");
      }
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  // Format numbers with dots
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('de-DE').format(num);
  };

  // Expanded Showcase Data
  const showcaseItems = [
    { title: "CYBERPUNK", author: "@NeoArtist", img: "https://picsum.photos/400/600?random=10", border: "border-audi-pink" },
    { title: "FANTASY", author: "@DragonSlayer", img: "https://picsum.photos/400/600?random=11", border: "border-audi-purple" },
    { title: "VINTAGE", author: "@ClassicVibe", img: "https://picsum.photos/400/600?random=12", border: "border-audi-cyan" },
    { title: "CHIBI", author: "@KawaiiMode", img: "https://picsum.photos/400/600?random=13", border: "border-audi-lime" },
    { title: "MECHA", author: "@BotMaker", img: "https://picsum.photos/400/600?random=14", border: "border-audi-pink" },
    { title: "REALISTIC", author: "@PhotoGenius", img: "https://picsum.photos/400/600?random=15", border: "border-audi-purple" },
    { title: "ANIME", author: "@OtakuKing", img: "https://picsum.photos/400/600?random=16", border: "border-audi-cyan" },
    { title: "PIXEL", author: "@RetroGamer", img: "https://picsum.photos/400/600?random=17", border: "border-audi-lime" },
  ];

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

      {/* --- HERO SECTION (Mobile Optimized) --- */}
      <div className="relative min-h-screen flex flex-col items-center justify-center pt-20 md:pt-24 pb-20 px-4 z-10">
          
          {/* Combo Meter - Repositioned for Mobile */}
          <div className={`absolute top-[12%] right-2 md:top-[25%] md:right-[15%] transform rotate-12 transition-all duration-100 origin-center z-0 opacity-80 md:opacity-100 ${beat ? 'scale-110 md:scale-125 rotate-6' : 'scale-90 md:scale-100 rotate-12'}`}>
              <div className="relative scale-75 md:scale-100">
                  <span className="font-game text-5xl md:text-8xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-[#ccff00] to-[#55aa00] drop-shadow-[0_0_15px_rgba(204,255,0,0.8)] z-10 block animate-neon-flash">PERFECT</span>
                  <div className="absolute -bottom-6 right-0 bg-audi-pink text-white font-game font-bold text-xl px-4 py-1 rounded skew-x-[-10deg] shadow-[0_0_20px_#FF0099] animate-bounce">
                      x99 Gen
                  </div>
              </div>
          </div>

          {/* Main Title - Mobile Responsive Typography */}
          <div 
            className="text-center relative mb-12 md:mb-16 z-20 w-full"
            style={{ 
                // Only apply strong 3D effect on desktop to avoid layout shift on mobile
                transform: window.innerWidth > 768 ? `perspective(1000px) rotateX(${mousePos.y * 0.5}deg) rotateY(${mousePos.x * 0.5}deg)` : 'none' 
            }}
          >
              <div className={`transition-transform duration-75 ${beat ? 'scale-[1.01]' : 'scale-100'}`}>
                {/* Main Heading Group */}
                <h1 className="leading-[1.1] flex flex-col items-center">
                    {/* Top Line */}
                    <span className="block font-game text-3xl md:text-6xl font-bold tracking-wider text-audi-cyan mb-2 drop-shadow-[0_0_10px_rgba(33,212,253,0.8)]">
                        THÀNH PHỐ
                    </span>
                    
                    {/* Middle Line - Responsive sizing */}
                    <span className="block font-sans text-5xl sm:text-7xl md:text-9xl font-black tracking-tighter text-outline-heavy uppercase transform -rotate-2 leading-none py-2">
                        VŨ HỘI AI
                    </span>
                    
                    {/* Bottom Line */}
                    <span className="block font-game text-sm md:text-3xl font-bold text-white mt-4 tracking-[0.3em] md:tracking-[0.5em] bg-black/30 backdrop-blur-sm inline-block px-4 py-2 rounded border border-white/10">
                        PHOTO STUDIO
                    </span>
                </h1>
              </div>
              
              {/* Feature Tags - Grid on mobile, Flex on desktop */}
              <div className="mt-8 grid grid-cols-2 md:flex md:flex-wrap justify-center gap-2 md:gap-3 max-w-sm md:max-w-none mx-auto">
                  {['TẠO ẢNH 4K', 'GHÉP MẶT', 'TÁCH NỀN', 'ANIME STYLE'].map((tag, i) => (
                      <span key={i} className="px-3 py-2 border border-audi-cyan/50 rounded-lg text-[10px] md:text-xs font-bold tracking-[0.1em] text-audi-cyan uppercase bg-black/60 backdrop-blur-sm hover:bg-audi-cyan hover:text-black transition-colors cursor-default shadow-[0_0_10px_rgba(33,212,253,0.2)] text-center">
                          {tag}
                      </span>
                  ))}
              </div>
          </div>

          {/* Start Button - Full width on mobile */}
          <div className="relative group cursor-pointer z-30 w-full max-w-md md:w-auto" onClick={handleStart}>
              <div className="absolute -inset-1 bg-gradient-to-r from-audi-pink via-audi-purple to-audi-cyan rounded-2xl blur opacity-70 group-hover:opacity-100 group-hover:blur-xl transition-all duration-200 animate-pulse"></div>
              <button className="relative w-full px-8 md:px-16 py-6 md:py-8 bg-[#090014] rounded-xl border-2 border-white/20 overflow-hidden flex items-center justify-center md:justify-start gap-4 md:gap-6 group-hover:translate-y-[-2px] transition-transform">
                  
                  {/* Animated Background inside button */}
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-audi-pink/10 to-audi-cyan/10 group-hover:opacity-100 transition-opacity"></div>
                  
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-audi-lime flex items-center justify-center shadow-[0_0_20px_#ccff00] group-hover:scale-110 transition-transform shrink-0">
                      <Icons.Play className="w-6 h-6 md:w-8 md:h-8 text-black fill-current ml-1" />
                  </div>
                  
                  <div className="text-left">
                      <span className="block text-xs md:text-sm font-bold text-audi-cyan uppercase tracking-[0.2em] mb-1">AUDITION STUDIO</span>
                      <span className="block text-2xl md:text-4xl font-game font-black text-white italic whitespace-nowrap">VÀO STUDIO</span>
                  </div>
                  
                  {/* Shine Effect */}
                  <div className="absolute top-0 -left-full w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg] animate-[shimmer_2s_infinite]"></div>
              </button>
          </div>
      </div>

      {/* --- NEW 3D REAL-TIME STATS BANNER --- */}
      <div className="relative z-20 max-w-6xl mx-auto px-4 -mt-10 md:-mt-20 mb-20 perspective-1000">
         <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Stat Card 1: Users */}
            <div className="group relative bg-[#13131f] border-b-4 border-audi-pink rounded-2xl p-6 shadow-[0_10px_30px_rgba(0,0,0,0.5)] transform hover:scale-105 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-audi-pink/20 blur-[40px] rounded-full group-hover:bg-audi-pink/40 transition-colors"></div>
                
                <div className="relative z-10 flex flex-col items-center">
                    <div className="w-12 h-12 mb-3 rounded-full bg-black border border-audi-pink/50 flex items-center justify-center shadow-[0_0_15px_#FF0099]">
                        <Icons.User className="w-6 h-6 text-audi-pink animate-pulse" />
                    </div>
                    <div className="font-game text-5xl font-bold text-white mb-1 drop-shadow-[0_0_10px_rgba(255,0,153,0.5)]">
                        {formatNumber(stats.users)}+
                    </div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Tổng Người Dùng</div>
                    <div className="mt-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                        <span className="text-[10px] text-green-400">Live Updating</span>
                    </div>
                </div>
            </div>

            {/* Stat Card 2: Images Created */}
            <div className="group relative bg-[#13131f] border-b-4 border-audi-cyan rounded-2xl p-6 shadow-[0_10px_30px_rgba(0,0,0,0.5)] transform hover:scale-105 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-audi-cyan/20 blur-[40px] rounded-full group-hover:bg-audi-cyan/40 transition-colors"></div>
                
                <div className="relative z-10 flex flex-col items-center">
                    <div className="w-12 h-12 mb-3 rounded-full bg-black border border-audi-cyan/50 flex items-center justify-center shadow-[0_0_15px_#21D4FD]">
                        <Icons.Image className="w-6 h-6 text-audi-cyan animate-pulse" />
                    </div>
                    <div className="font-game text-5xl font-bold text-white mb-1 drop-shadow-[0_0_10px_rgba(33,212,253,0.5)]">
                        {formatNumber(stats.images)}+
                    </div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Tổng Ảnh Đã Tạo</div>
                    <div className="mt-3 flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                         <span className="text-[10px] text-green-400">Processing...</span>
                    </div>
                </div>
            </div>

            {/* Stat Card 3: Visits */}
            <div className="group relative bg-[#13131f] border-b-4 border-audi-purple rounded-2xl p-6 shadow-[0_10px_30px_rgba(0,0,0,0.5)] transform hover:scale-105 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-audi-purple/20 blur-[40px] rounded-full group-hover:bg-audi-purple/40 transition-colors"></div>
                
                <div className="relative z-10 flex flex-col items-center">
                    <div className="w-12 h-12 mb-3 rounded-full bg-black border border-audi-purple/50 flex items-center justify-center shadow-[0_0_15px_#B721FF]">
                        <Icons.Eye className="w-6 h-6 text-audi-purple animate-pulse" />
                    </div>
                    <div className="font-game text-5xl font-bold text-white mb-1 drop-shadow-[0_0_10px_rgba(183,33,255,0.5)]">
                        {formatNumber(stats.visits)}+
                    </div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Lượt Truy Cập</div>
                    <div className="mt-3 flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                         <span className="text-[10px] text-green-400">Online Now</span>
                    </div>
                </div>
            </div>

         </div>
      </div>

      {/* --- OUTSTANDING FEATURES (Updated) --- */}
      <div className="py-16 md:py-20 relative z-20 px-4">
          <div className="max-w-7xl mx-auto md:px-6">
              <div className="text-center mb-10 md:mb-16">
                  <h2 className="font-game text-3xl md:text-6xl font-bold text-white mb-4">
                      TÍNH NĂNG <span className="text-audi-pink">NỔI BẬT</span>
                  </h2>
                  <div className="w-16 md:w-24 h-1 bg-gradient-to-r from-audi-pink to-audi-cyan mx-auto rounded-full"></div>
                  <p className="mt-4 text-slate-400 text-sm md:text-base">Nhanh – Đẹp – Giữ đúng nét nhân vật & phong cách Audition</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {[
                    { icon: Icons.Rocket, title: 'AI Hàng Đầu', desc: 'Mô hình AI tạo ảnh mới nhất của Google, chất lượng vượt trội', color: 'text-audi-pink', bg: 'bg-audi-pink/10' },
                    { icon: Icons.Palette, title: 'Đậm Chất Audition', desc: 'AI hiểu rõ phong cách Audition, từ quần áo đến biểu cảm', color: 'text-audi-cyan', bg: 'bg-audi-cyan/10' },
                    { icon: Icons.Shield, title: 'Giữ Nguyên Gương Mặt', desc: 'Công nghệ Face Lock giữ lại nét đặc trưng trên gương mặt', color: 'text-audi-lime', bg: 'bg-audi-lime/10' },
                    { icon: Icons.Zap, title: 'Tốc Độ Tên Lửa', desc: 'Chỉ 15-30 giây để tạo một bức ảnh 3D hoàn chỉnh', color: 'text-audi-yellow', bg: 'bg-audi-yellow/10' },
                 ].map((item, i) => (
                    <div key={i} className="glass-panel p-6 rounded-3xl border border-white/5 hover:border-white/20 hover:-translate-y-2 transition-transform duration-300">
                         <div className={`w-14 h-14 rounded-2xl ${item.bg} flex items-center justify-center mb-4`}>
                             <item.icon className={`w-7 h-7 ${item.color}`} />
                         </div>
                         <h3 className="font-game text-xl font-bold text-white mb-2">{item.title}</h3>
                         <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                 ))}
              </div>
          </div>
      </div>

      {/* --- 4 SIMPLE STEPS (New Section) --- */}
      <div className="py-16 md:py-24 relative z-20 px-4 bg-white/[0.02]">
         <div className="max-w-7xl mx-auto md:px-6">
            <div className="text-center mb-10 md:mb-16">
                 <h2 className="font-game text-3xl md:text-5xl font-bold text-white mb-4">
                     4 BƯỚC <span className="text-audi-purple">ĐƠN GIẢN</span>
                 </h2>
                 <p className="text-slate-400 text-sm md:text-base">Chỉ vài cú nhấp chuột, bạn đã có ngay một tác phẩm nghệ thuật</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { step: 1, icon: Icons.Upload, title: 'Tải Ảnh Gốc', desc: 'Chọn ảnh chân dung rõ mặt, chất lượng cao để AI nhận diện tốt nhất' },
                    { step: 2, icon: Icons.MessageCircle, title: 'Nhập Mô Tả', desc: 'Mô tả chi tiết bối cảnh, trang phục, hành động bạn muốn' },
                    { step: 3, icon: Icons.Palette, title: 'Chọn Phong Cách', desc: 'Lựa chọn phong cách Audition có sẵn hoặc để AI sáng tạo' },
                    { step: 4, icon: Icons.Download, title: 'Nhận Ảnh & Tỏa Sáng', desc: 'Nhấn tạo ảnh, chờ giây lát và nhận tác phẩm nghệ thuật' },
                ].map((item, i) => (
                    <div key={i} className="relative glass-panel p-8 rounded-[2rem] text-center group hover:bg-white/5 transition-colors">
                         {/* Step Badge */}
                         <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-audi-pink text-white font-bold flex items-center justify-center shadow-[0_0_15px_#FF0099] text-sm z-10 border-4 border-[#090014]">
                             {item.step}
                         </div>
                         
                         <div className="w-20 h-20 rounded-[2rem] bg-white/5 mx-auto mb-6 flex items-center justify-center group-hover:scale-110 transition-transform">
                             <item.icon className="w-8 h-8 text-audi-pink" />
                         </div>
                         <h3 className="font-game text-xl font-bold text-white mb-3">{item.title}</h3>
                         <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>

                         {/* Connector Line for Desktop */}
                         {i < 3 && (
                             <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-0.5 bg-white/10 z-0"></div>
                         )}
                    </div>
                ))}
            </div>
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
              {/* Gradient Masks for smooth edges */}
              <div className="absolute top-0 left-0 bottom-0 w-12 md:w-32 bg-gradient-to-r from-[#090014] to-transparent z-10 pointer-events-none"></div>
              <div className="absolute top-0 right-0 bottom-0 w-12 md:w-32 bg-gradient-to-l from-[#090014] to-transparent z-10 pointer-events-none"></div>

              {/* Scrolling Track (Duplicated Content for Infinite Loop) */}
              <div className="flex w-max animate-marquee pause-on-hover gap-6 px-6">
                   {/* Render Set 1 */}
                   {showcaseItems.map((item, i) => (
                       <ShowcaseCard key={`s1-${i}`} item={item} />
                   ))}
                   {/* Render Set 2 */}
                   {showcaseItems.map((item, i) => (
                       <ShowcaseCard key={`s2-${i}`} item={item} />
                   ))}
              </div>
          </div>
      </div>

      {/* --- VCOIN SHOP (Mobile Optimized) --- */}
      <div className="py-16 md:py-24 px-4 relative z-20">
          <div className="max-w-6xl mx-auto neon-box rounded-[2rem] md:rounded-[3rem] bg-black/60 backdrop-blur-xl p-6 md:p-16 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-audi-purple blur-[100px] opacity-30 animate-pulse"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-audi-cyan blur-[100px] opacity-30 animate-pulse" style={{ animationDelay: '2s' }}></div>

              <div className="text-center mb-10 md:mb-16 relative z-10">
                  <h2 className="font-game text-3xl md:text-5xl font-bold text-white mb-4">VCOIN SHOP</h2>
                  <p className="text-slate-300 text-sm md:text-base">Nạp lượt tạo ảnh - Mở khóa tính năng VIP</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 relative z-10">
                  {[
                      { name: "Starter", coin: 10, price: "10k", color: "from-slate-800 to-black", border: "border-slate-600" },
                      { name: "VIP Pro", coin: 50, price: "50k", color: "from-audi-purple/50 to-black", border: "border-audi-purple", glow: true },
                      { name: "Legend", coin: 200, price: "200k", color: "from-audi-pink/50 to-black", border: "border-audi-pink" }
                  ].map((pkg, i) => (
                      <div key={i} onClick={handleStart} className={`relative p-[2px] rounded-3xl cursor-pointer group hover:-translate-y-2 transition-transform duration-300 ${pkg.glow ? 'animate-float' : ''}`}>
                          <div className={`absolute inset-0 rounded-3xl bg-gradient-to-r ${pkg.glow ? 'from-audi-cyan via-audi-pink to-audi-purple' : 'from-white/10 to-white/5'} opacity-50 group-hover:opacity-100 transition-opacity`}></div>
                          
                          <div className="relative h-full bg-black rounded-[22px] p-6 md:p-8 flex flex-row md:flex-col items-center justify-between md:justify-center border border-white/5 overflow-hidden gap-4">
                              <div className="flex items-center gap-4 md:flex-col md:gap-0">
                                  <div className="w-12 h-12 md:w-20 md:h-20 md:mb-6 relative shrink-0">
                                      <div className={`absolute inset-0 bg-gradient-to-br ${pkg.glow ? 'from-audi-cyan to-audi-purple' : 'from-slate-700 to-slate-800'} rounded-full blur-lg opacity-50 group-hover:opacity-100 transition-opacity`}></div>
                                      <div className="relative w-full h-full rounded-full border-2 border-white/20 flex items-center justify-center bg-black/50 backdrop-blur">
                                          <Icons.Gem className={`w-5 h-5 md:w-8 md:h-8 ${pkg.glow ? 'text-audi-lime' : 'text-white'}`} />
                                      </div>
                                  </div>
                                  <div className="text-left md:text-center">
                                      <h3 className="font-game text-xl md:text-2xl font-bold text-white mb-1 md:mb-2">{pkg.name}</h3>
                                      <div className="text-2xl md:text-4xl font-black text-audi-yellow">{pkg.coin} <span className="text-xs md:text-sm text-white/50">Lượt</span></div>
                                  </div>
                              </div>
                              
                              <div className="flex flex-col items-end md:items-center w-auto md:w-full">
                                   <div className="text-lg font-bold text-white/70 mb-2 md:mb-8">{pkg.price}</div>
                                   <button className={`px-4 py-2 md:w-full md:py-3 rounded-xl font-bold uppercase tracking-wider text-xs md:text-sm transition-all whitespace-nowrap ${pkg.glow ? 'bg-audi-pink text-white shadow-[0_0_20px_#FF0099] hover:bg-audi-pink/80' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                                      Mua
                                  </button>
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* --- FAQ SECTION --- */}
      <div className="py-16 md:py-20 relative z-20 px-4">
          <div className="max-w-4xl mx-auto">
              <h2 className="font-game text-3xl md:text-5xl font-bold text-center text-white mb-8 md:mb-12">
                  CÂU HỎI <span className="text-audi-purple">THƯỜNG GẶP</span>
              </h2>
              
              <div className="space-y-4">
                  {[
                      { q: "Audition AI Studio là gì?", a: "Là nền tảng tạo ảnh nghệ thuật sử dụng trí tuệ nhân tạo, cho phép bạn tạo ra các bức ảnh đẹp như game Audition, anime hoặc ảnh thực tế chỉ bằng mô tả văn bản." },
                      { q: "Tôi có mất phí khi sử dụng không?", a: "Bạn được miễn phí 10 lượt tạo ảnh đầu tiên mỗi ngày. Để tạo nhiều hơn và sử dụng tính năng cao cấp, bạn có thể mua thêm Vcoin." },
                      { q: "Ảnh tạo ra có bản quyền không?", a: "Bạn có toàn quyền sử dụng thương mại đối với các hình ảnh được tạo ra từ tài khoản của bạn." },
                      { q: "Làm sao để nạp Vcoin?", a: "Bạn có thể nạp qua chuyển khoản ngân hàng hoặc ví điện tử trong phần Shop sau khi đăng nhập." }
                  ].map((item, idx) => (
                      <div key={idx} className="glass-panel border border-white/10 rounded-2xl overflow-hidden">
                          <button 
                             onClick={() => toggleFaq(idx)}
                             className="w-full flex justify-between items-center p-4 md:p-6 text-left font-bold text-sm md:text-lg hover:bg-white/5 transition-colors"
                          >
                              <span className="text-white pr-4">{item.q}</span>
                              <Icons.ChevronRight className={`w-4 h-4 md:w-5 md:h-5 text-audi-cyan transition-transform shrink-0 ${openFaq === idx ? 'rotate-90' : ''}`} />
                          </button>
                          {openFaq === idx && (
                              <div className="p-4 md:p-6 pt-0 text-xs md:text-sm text-slate-400 leading-relaxed border-t border-white/5 bg-black/20">
                                  {item.a}
                              </div>
                          )}
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* --- REDESIGNED FOOTER --- */}
      <footer className="relative z-20 bg-[#020005] border-t border-white/10 pt-16 pb-8">
           {/* Decorative Top Line */}
           <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-audi-pink to-transparent opacity-50"></div>
           
           <div className="max-w-7xl mx-auto px-6">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
                   {/* Brand Column */}
                   <div className="text-center md:text-left space-y-4">
                       <h3 className="font-game text-3xl font-bold text-white tracking-widest flex items-center justify-center md:justify-start gap-2">
                           <Icons.Sparkles className="w-6 h-6 text-audi-pink" />
                           AUDITION AI
                       </h3>
                       <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto md:mx-0">
                           Nền tảng sáng tạo hình ảnh không giới hạn, kết nối cộng đồng đam mê nghệ thuật và công nghệ.
                       </p>
                   </div>

                   {/* Links Column */}
                   <div className="flex flex-col items-center md:items-start space-y-4">
                       <h4 className="font-bold text-audi-cyan uppercase tracking-wider text-sm mb-2">Thông Tin</h4>
                       <a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Điều khoản sử dụng</a>
                       <a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Chính sách bảo mật</a>
                       <a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Chính sách hoàn tiền</a>
                       <a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Hướng dẫn thanh toán</a>
                   </div>

                   {/* Contact Column */}
                   <div className="flex flex-col items-center md:items-end space-y-4">
                       <h4 className="font-bold text-audi-lime uppercase tracking-wider text-sm mb-2">Liên Hệ & Hỗ Trợ</h4>
                       <span className="text-slate-400 text-sm">Email: support@auditionai.io.vn</span>
                       <span className="text-slate-400 text-sm">Hotline: 0824.280.497</span>
                       <button className="px-6 py-2 border border-white/20 rounded-full text-xs font-bold uppercase hover:bg-white hover:text-black transition-all">
                           Gửi phản hồi
                       </button>
                   </div>
               </div>

               {/* Bottom Bar */}
               <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                   <p className="text-xs text-slate-600">
                       © 2026 AUDITION AI Photo Studio. All rights reserved.
                   </p>
                   <div className="flex items-center gap-2">
                       <span className="text-xs text-slate-500 font-game uppercase tracking-widest">Designed by</span>
                       <span className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-audi-pink to-audi-cyan">CodyCN</span>
                   </div>
               </div>
           </div>
      </footer>

      {/* --- LOGIN MODAL (Simulated) --- */}
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

                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-audi-cyan uppercase mb-1 block">Tên tài khoản</label>
                          <input type="text" className="w-full bg-white/5 border border-white/20 rounded-xl p-3 text-white focus:border-audi-pink outline-none transition-colors" placeholder="Nhập tên đăng nhập..." />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-audi-cyan uppercase mb-1 block">Mật khẩu</label>
                          <input type="password" className="w-full bg-white/5 border border-white/20 rounded-xl p-3 text-white focus:border-audi-pink outline-none transition-colors" placeholder="Nhập mật khẩu..." />
                      </div>
                      
                      {authMode === 'register' && (
                         <div>
                            <label className="text-xs font-bold text-audi-cyan uppercase mb-1 block">Nhập lại Mật khẩu</label>
                            <input type="password" className="w-full bg-white/5 border border-white/20 rounded-xl p-3 text-white focus:border-audi-pink outline-none transition-colors" placeholder="Xác nhận mật khẩu..." />
                        </div>
                      )}
                      
                      <button 
                        onClick={onEnter}
                        className="w-full py-4 mt-4 bg-gradient-to-r from-audi-pink to-audi-purple rounded-xl font-bold text-white shadow-lg hover:shadow-audi-pink/50 transition-all transform hover:scale-[1.02]"
                      >
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

                      <div className="text-center mt-4">
                          <span className="text-slate-500 text-xs">{authMode === 'login' ? 'Chưa có tài khoản? ' : 'Đã có tài khoản? '}</span>
                          <button 
                            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                            className="text-audi-lime font-bold text-xs cursor-pointer hover:underline bg-transparent border-none p-0 inline"
                          >
                            {authMode === 'login' ? 'Đăng ký mới' : 'Đăng nhập'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

// Subcomponent for Showcase Card
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

             {/* Hover overlay sheen */}
             <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
        </div>
    </div>
);
