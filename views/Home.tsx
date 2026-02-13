
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
    const [isLoaded, setIsLoaded] = useState(false);
    const isPremium = feature.isPremium;
    const tag = feature.tag;

    // Dynamic borders based on category
    const getBorderStyle = () => {
        if (isPremium) return 'border-audi-yellow/30 hover:border-audi-yellow shadow-[0_0_15px_rgba(251,218,97,0.1)]';
        if (feature.toolType === 'generation') return 'border-white/10 hover:border-audi-cyan/50 hover:shadow-[0_0_20px_rgba(33,212,253,0.2)]';
        return 'border-white/10 hover:border-audi-purple/50 hover:shadow-[0_0_20px_rgba(183,33,255,0.2)]';
    };

    return (
        <div 
            onClick={onClick}
            className={`group relative h-[280px] rounded-[2rem] overflow-hidden bg-[#0c0c14] border transition-all duration-500 cursor-pointer flex flex-col ${getBorderStyle()} hover:-translate-y-2`}
        >
            {/* Image Section */}
            <div className="h-1/2 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c14] to-transparent z-10 opacity-80"></div>
                <img 
                    src={feature.preview_image} 
                    alt={feature.name[lang]} 
                    loading="lazy"
                    onLoad={() => setIsLoaded(true)}
                    className={`w-full h-full object-cover transition-all duration-700 group-hover:scale-110 group-hover:rotate-1 ${isLoaded ? 'opacity-60' : 'opacity-0'}`}
                />
                
                {/* Badges */}
                <div className="absolute top-4 left-4 z-20 flex gap-2">
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full backdrop-blur-md border ${feature.toolType === 'generation' ? 'bg-audi-cyan/10 border-audi-cyan text-audi-cyan' : 'bg-audi-purple/10 border-audi-purple text-audi-purple'}`}>
                        {feature.toolType === 'generation' ? 'GEN' : 'EDIT'}
                    </span>
                    
                    {tag === 'HOT' && (
                        <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-red-500 text-white border border-red-400 shadow-[0_0_10px_#ef4444] flex items-center gap-1 animate-pulse">
                           <Icons.Zap className="w-3 h-3 fill-white" /> HOT
                        </span>
                    )}

                    {isPremium && (
                        <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-audi-yellow/10 border border-audi-yellow text-audi-yellow backdrop-blur-md flex items-center gap-1">
                            <Icons.Crown className="w-3 h-3" /> VIP
                        </span>
                    )}
                </div>
            </div>
            
            {/* Content Section */}
            <div className="flex-1 p-5 relative z-20 flex flex-col justify-between">
                <div>
                    <h3 className="font-game text-lg font-bold text-white mb-2 leading-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-400 transition-all">
                        {feature.name[lang]}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed font-medium">
                        {feature.description[lang]}
                    </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-1">
                     <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">{feature.engine.split(' ')[0]}</span>
                     <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                         <Icons.ArrowUp className="w-3 h-3 rotate-45" />
                     </div>
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
