
import React, { useState, useEffect } from 'react';
import { APP_CONFIG } from '../constants';
import { Language, Feature, ViewId } from '../types';
import { Icons } from '../components/Icons';
import { getCheckinStatus } from '../services/economyService';

interface HomeProps {
  lang: Language;
  onSelectFeature: (feature: Feature) => void;
  onNavigate: (view: ViewId) => void;
  onOpenCheckin: () => void; 
}

interface FeatureCardProps {
  feature: Feature;
  lang: Language;
  onClick: () => void;
  idx: number;
}

const FeatureCard: React.FC<FeatureCardProps> = React.memo(({ feature, lang, onClick, idx }) => {
    const isPremium = feature.isPremium;
    const tag = feature.tag;
    const isGen = feature.toolType === 'generation';

    // Dynamic styles based on category
    const getCardStyle = () => {
        if (isPremium) return 'from-[#1a1500] to-[#0a0800] border-audi-yellow/30 hover:border-audi-yellow shadow-[0_0_15px_rgba(251,218,97,0.1)] hover:shadow-[0_0_30px_rgba(251,218,97,0.2)]';
        if (isGen) return 'from-[#001a2c] to-[#000a14] border-audi-cyan/20 hover:border-audi-cyan/60 shadow-[0_0_15px_rgba(33,212,253,0.05)] hover:shadow-[0_0_30px_rgba(33,212,253,0.15)]';
        return 'from-[#1a0024] to-[#0a0014] border-audi-purple/20 hover:border-audi-purple/60 shadow-[0_0_15px_rgba(183,33,255,0.05)] hover:shadow-[0_0_30px_rgba(183,33,255,0.15)]';
    };

    const getIconColor = () => {
        if (isPremium) return 'text-audi-yellow';
        if (isGen) return 'text-audi-cyan';
        return 'text-audi-purple';
    };

    const getIconBg = () => {
        if (isPremium) return 'bg-audi-yellow/10 group-hover:bg-audi-yellow/20';
        if (isGen) return 'bg-audi-cyan/10 group-hover:bg-audi-cyan/20';
        return 'bg-audi-purple/10 group-hover:bg-audi-purple/20';
    };

    return (
        <div 
            onClick={onClick}
            className={`group relative h-[240px] rounded-[2rem] overflow-hidden bg-gradient-to-br border transition-all duration-500 cursor-pointer flex flex-col p-6 ${getCardStyle()} hover:-translate-y-2`}
        >
            {/* Abstract Background Glow */}
            <div className={`absolute -top-20 -right-20 w-40 h-40 blur-[50px] rounded-full transition-all duration-700 group-hover:scale-150 ${isPremium ? 'bg-audi-yellow/20' : isGen ? 'bg-audi-cyan/20' : 'bg-audi-purple/20'}`}></div>
            <div className={`absolute -bottom-20 -left-20 w-40 h-40 blur-[50px] rounded-full transition-all duration-700 group-hover:scale-150 ${isPremium ? 'bg-orange-500/10' : isGen ? 'bg-blue-500/10' : 'bg-pink-500/10'}`}></div>

            {/* Header: Icon & Badges */}
            <div className="flex justify-between items-start relative z-10 mb-auto">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 ${getIconBg()} ${getIconColor()} border border-white/5`}>
                    {isGen ? <Icons.Sparkles className="w-6 h-6" /> : <Icons.Wand className="w-6 h-6" />}
                </div>
                
                <div className="flex gap-2 flex-col items-end">
                    <div className="flex gap-2">
                        <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full backdrop-blur-md border tracking-wider uppercase ${isGen ? 'bg-audi-cyan/10 border-audi-cyan/50 text-audi-cyan' : 'bg-audi-purple/10 border-audi-purple/50 text-audi-purple'}`}>
                            {isGen ? 'GEN' : 'EDIT'}
                        </span>
                        
                        {isPremium && (
                            <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-audi-yellow/10 border border-audi-yellow/50 text-audi-yellow backdrop-blur-md flex items-center gap-1 uppercase tracking-wider">
                                <Icons.Crown className="w-3 h-3" /> VIP
                            </span>
                        )}
                    </div>
                    {tag === 'HOT' && (
                        <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white border border-red-400/50 shadow-[0_0_10px_rgba(239,68,68,0.5)] flex items-center gap-1 animate-pulse uppercase tracking-wider">
                           <Icons.Flame className="w-3 h-3 fill-white" /> HOT
                        </span>
                    )}
                </div>
            </div>
            
            {/* Content Section */}
            <div className="relative z-20 mt-6">
                <h3 className="font-game text-xl font-bold text-white mb-2 leading-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-300 transition-all drop-shadow-md">
                    {feature.name[lang]}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed font-medium group-hover:text-slate-300 transition-colors">
                    {feature.description[lang]}
                </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/10 relative z-20">
                 <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest group-hover:text-slate-400 transition-colors">{feature.engine.split(' ')[0]}</span>
                 <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 border ${isPremium ? 'bg-audi-yellow/10 border-audi-yellow/30 group-hover:bg-audi-yellow group-hover:text-black' : isGen ? 'bg-audi-cyan/10 border-audi-cyan/30 group-hover:bg-audi-cyan group-hover:text-black' : 'bg-audi-purple/10 border-audi-purple/30 group-hover:bg-audi-purple group-hover:text-white'}`}>
                     <Icons.ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                 </div>
            </div>
        </div>
    );
});

export const Home: React.FC<HomeProps> = ({ lang, onSelectFeature, onNavigate, onOpenCheckin }) => {
  
  // Split features into categories
  const studioFeatures = APP_CONFIG.main_features.filter(f => f.toolType === 'generation');
  const toolFeatures = APP_CONFIG.main_features.filter(f => f.toolType === 'editing');

  // Checkin Status for Notification
  const [isCheckedIn, setIsCheckedIn] = useState(true);

  useEffect(() => {
    // Check status periodically to update UI if user checks in
    const checkStatus = () => {
        getCheckinStatus().then(status => setIsCheckedIn(status.isCheckedInToday));
    };
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-16 pb-24">
      
      {/* Optimized Slim Hero Section */}
      <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-r from-[#120024] to-black py-4 px-6 flex items-center justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-audi-pink/10 blur-[50px] rounded-full animate-pulse"></div>
          
          <div className="relative z-10 flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-ping"></div>
              <div>
                   <h1 className="font-game text-xl md:text-2xl font-bold text-white leading-none">
                       HELLO, <span className="text-transparent bg-clip-text bg-gradient-to-r from-audi-pink to-audi-cyan">CREATOR</span>
                   </h1>
                   <p className="text-slate-500 text-xs hidden md:block mt-1">
                       {lang === 'vi' ? 'Hệ thống đã sẵn sàng. Hãy chọn công cụ bên dưới.' : 'System online. Select a tool below to start.'}
                   </p>
              </div>
          </div>
          
          <div className="flex items-center gap-2">
             {/* CHECKIN BUTTON WITH PROMINENT EFFECT */}
             <button 
                onClick={onOpenCheckin}
                className={`px-4 py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 ${
                    !isCheckedIn 
                    ? 'bg-[#D10000] hover:bg-red-600 text-white border border-red-500 shadow-[0_0_20px_rgba(209,0,0,0.8)] animate-pulse' 
                    : 'bg-white/10 hover:bg-white/20 text-slate-300 border border-white/10'
                }`}
             >
                <div className="relative">
                     <Icons.Calendar className={`w-3 h-3 ${!isCheckedIn ? 'animate-bounce' : ''}`} />
                     {!isCheckedIn && (
                         <span className="absolute -top-1 -right-1 flex h-2 w-2">
                             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                             <span className="relative inline-flex rounded-full h-2 w-2 bg-audi-yellow"></span>
                         </span>
                     )}
                </div>
                {lang === 'vi' 
                    ? (!isCheckedIn ? 'Điểm danh ngay' : 'Đã điểm danh') 
                    : (!isCheckedIn ? 'Check-in Now' : 'Checked In')
                }
             </button>
          </div>
      </div>

      {/* NEW: PROMO BANNER FOR AUMIX3D */}
      <a 
        href="https://aumix3d.com/" 
        target="_blank" 
        rel="noopener noreferrer"
        className="block relative rounded-2xl overflow-hidden border border-audi-cyan/30 bg-gradient-to-r from-[#001a2c] to-[#000a14] p-4 md:p-6 group hover:border-audi-cyan transition-all shadow-[0_0_30px_rgba(33,212,253,0.1)] hover:shadow-[0_0_40px_rgba(33,212,253,0.3)] animate-fade-in"
      >
          <div className="absolute top-0 right-0 w-64 h-64 bg-audi-cyan/10 blur-[80px] rounded-full group-hover:bg-audi-cyan/20 transition-all"></div>
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-audi-purple/10 blur-[60px] rounded-full"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6">
              <div className="flex-1 w-full">
                  <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                      <span className="bg-red-500 text-white text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded uppercase animate-pulse shadow-[0_0_10px_#ef4444]">MỚI</span>
                      <span className="text-audi-cyan text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center gap-1">
                          <Icons.Sparkles className="w-3 h-3" /> Đối tác chính thức
                      </span>
                  </div>
                  <h2 className="font-game text-xl md:text-3xl font-bold text-white mb-1.5 md:mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-audi-cyan transition-all leading-tight">
                      NỀN TẢNG MIX ĐỒ 3D AUDITION
                  </h2>
                  <p className="text-xs md:text-sm text-slate-400 mb-3 md:mb-4 max-w-2xl leading-relaxed line-clamp-2 md:line-clamp-none">
                      Mix đồ trực tiếp trên Web/Mobile không cần vào game. Hàng ngàn item cập nhật liên tục. Chụp ảnh nhân vật chất lượng cao để dùng làm nguyên liệu tạo ảnh AI tại đây!
                  </p>
                  <div className="flex flex-wrap gap-1.5 md:gap-2">
                      <span className="text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 md:py-1 bg-white/5 border border-white/10 rounded text-slate-300 whitespace-nowrap">Kho Item Đầy Đủ</span>
                      <span className="text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 md:py-1 bg-white/5 border border-white/10 rounded text-slate-300 whitespace-nowrap">Không Cần Vào Game</span>
                      <span className="text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 md:py-1 bg-white/5 border border-white/10 rounded text-slate-300 whitespace-nowrap">Lưu Set Đồ Vô Hạn</span>
                  </div>
              </div>
              
              <div className="shrink-0 flex flex-row md:flex-col items-center gap-2 md:gap-3 w-full md:w-auto justify-between md:justify-center mt-2 md:mt-0 border-t border-white/10 md:border-t-0 pt-3 md:pt-0">
                  <span className="text-[10px] md:text-xs font-bold text-audi-cyan uppercase tracking-wider group-hover:underline md:hidden">Trải nghiệm ngay</span>
                  <div className="w-8 h-8 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-gradient-to-br from-audi-cyan to-blue-600 p-[1px] md:p-[2px] shadow-lg shadow-cyan-500/30 group-hover:scale-110 transition-transform">
                      <div className="w-full h-full bg-black rounded-xl md:rounded-2xl flex items-center justify-center">
                          <Icons.ExternalLink className="w-4 h-4 md:w-8 md:h-8 text-audi-cyan" />
                      </div>
                  </div>
                  <span className="text-xs font-bold text-audi-cyan uppercase tracking-wider group-hover:underline hidden md:block">Trải nghiệm ngay</span>
              </div>
          </div>
      </a>

      {/* SECTION 1: STUDIO AI (Generation) */}
      <div className="animate-fade-in">
        <div className="flex items-end justify-between mb-8 border-b border-white/10 pb-4">
            <div>
                <h2 className="font-game text-3xl font-bold text-white flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-audi-cyan/10 flex items-center justify-center">
                        <Icons.Wand className="w-5 h-5 text-audi-cyan" />
                    </div>
                    STUDIO AI
                </h2>
                <p className="text-sm text-slate-500 mt-2 ml-14 max-w-md">
                    {lang === 'vi' ? 'Bộ công cụ sáng tạo hình ảnh chuyên nghiệp' : 'Professional image generation suite'}
                </p>
            </div>
            <div className="hidden md:block text-xs font-mono text-audi-cyan/50">POWERED BY GEMINI 3.0</div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {studioFeatures.map((feature, idx) => (
                <FeatureCard 
                    key={feature.id}
                    feature={feature}
                    lang={lang}
                    onClick={() => onSelectFeature(feature)}
                    idx={idx}
                />
            ))}
        </div>
      </div>

      {/* SECTION 2: TOOLS (Editing) */}
      <div className="animate-fade-in" style={{animationDelay: '0.2s'}}>
        <div className="flex items-end justify-between mb-8 border-b border-white/10 pb-4">
            <div>
                <h2 className="font-game text-3xl font-bold text-white flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-audi-purple/10 flex items-center justify-center">
                        <Icons.Zap className="w-5 h-5 text-audi-purple" />
                    </div>
                    TOOLS
                </h2>
                 <p className="text-sm text-slate-500 mt-2 ml-14 max-w-md">
                    {lang === 'vi' ? 'Công cụ chỉnh sửa và nâng cấp ảnh' : 'Image editing and enhancement tools'}
                </p>
            </div>
             <div className="hidden md:block text-xs font-mono text-audi-purple/50">AI ENHANCEMENT SUITE</div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {toolFeatures.map((feature, idx) => (
                <FeatureCard 
                    key={feature.id}
                    feature={feature}
                    lang={lang}
                    onClick={() => onSelectFeature(feature)}
                    idx={idx}
                />
            ))}
        </div>
      </div>

    </div>
  );
};
