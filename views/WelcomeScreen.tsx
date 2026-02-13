
import React from 'react';
import { Icons } from '../components/Icons';
import { APP_CONFIG } from '../constants';

interface WelcomeScreenProps {
  onEnter: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onEnter }) => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950 text-white font-sans selection:bg-brand-500 selection:text-white">
      
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-brand-500/10 rounded-full blur-[100px]" />
        {/* Grid Pattern Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />
      </div>

      <div className="relative z-10 container mx-auto px-4 h-full flex flex-col justify-between py-10 min-h-screen">
        
        {/* Top Branding */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl">
            <Icons.Sparkles className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-bold tracking-widest uppercase text-brand-100">Powered by Gemini 3.0 & Imagen 4</span>
          </div>
          <div className="flex flex-col items-center justify-center">
             <div className="w-20 h-20 bg-gradient-to-tr from-brand-400 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/40 mb-4 rotate-3 hover:rotate-6 transition-transform duration-500">
                <Icons.Wand className="w-10 h-10 text-white" />
             </div>
             <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-slate-400 text-center leading-tight">
               DMP AI Studio
             </h1>
          </div>
        </div>

        {/* Main Features Carousel/Grid */}
        <div className="flex-1 flex flex-col items-center justify-center py-12">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
              
              {/* Feature 1 */}
              <div className="group bg-white/5 hover:bg-white/10 border border-white/10 p-6 rounded-3xl backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-brand-500/50">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 mb-4 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                   <Icons.Image className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">Sáng tạo ảnh thông minh</h3>
                <p className="text-slate-400 text-sm">Biến mọi mô tả văn bản thành tác phẩm nghệ thuật 4K tuyệt đẹp chỉ trong vài giây.</p>
              </div>

              {/* Feature 2 */}
              <div className="group bg-white/5 hover:bg-white/10 border border-white/10 p-6 rounded-3xl backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-purple-500/50">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 mb-4 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                   <Icons.Zap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">Logo thật ấn tượng</h3>
                <p className="text-slate-400 text-sm">Thiết kế nhận diện thương hiệu độc bản, chuyên nghiệp với phong cách Vector hiện đại.</p>
              </div>

              {/* Feature 3 */}
              <div className="group bg-white/5 hover:bg-white/10 border border-white/10 p-6 rounded-3xl backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-green-500/50">
                 <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400 mb-4 group-hover:bg-green-500 group-hover:text-white transition-colors">
                   <Icons.Shield className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">Tính năng độc quyền</h3>
                <p className="text-slate-400 text-sm">Trải nghiệm bộ công cụ đỉnh cao: Phục hồi ảnh cũ, Xóa phông, Face Swap và hơn thế nữa.</p>
              </div>

           </div>

           <div className="mt-12">
              <button 
                onClick={onEnter}
                className="group relative inline-flex items-center gap-3 px-10 py-4 bg-white text-slate-900 rounded-full font-bold text-lg shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_40px_rgba(255,255,255,0.5)] hover:scale-105 transition-all duration-300"
              >
                <span>Mời vào App</span>
                <Icons.ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                <div className="absolute -inset-1 rounded-full blur opacity-20 bg-white group-hover:opacity-40 transition-opacity" />
              </button>
           </div>
        </div>

        {/* Footer Info */}
        <div className="relative z-10 mt-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5">
                
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center border border-white/10">
                        <Icons.User className="w-5 h-5 text-slate-300" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">DMP AI Dev</p>
                        <a href="mailto:dmpaidev@gmail.com" className="text-xs text-slate-400 hover:text-brand-400 transition-colors flex items-center gap-1">
                            <Icons.Mail className="w-3 h-3" /> dmpaidev@gmail.com
                        </a>
                    </div>
                </div>

                <div className="h-px w-full md:w-px md:h-10 bg-white/10"></div>

                <a 
                    href="https://zalo.me/g/kodwgn037" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-3 px-5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-200 transition-all group"
                >
                    <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">Z</div>
                    <span className="text-sm font-medium group-hover:underline decoration-blue-400 underline-offset-2">Tham gia cộng đồng Zalo</span>
                    <Icons.MessageCircle className="w-4 h-4" />
                </a>

            </div>
            <p className="text-center text-[10px] text-slate-600 mt-4">© 2025 DMP AI Photo Studio. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};
