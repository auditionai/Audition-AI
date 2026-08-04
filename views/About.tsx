import React from 'react';
import { Language } from '../types';
import { Icons } from '../components/Icons';
import { APP_CONFIG } from '../constants';

interface AboutProps {
  lang: Language;
}

export const About: React.FC<AboutProps> = ({ lang }) => {
  return (
    <div className="space-y-8 animate-fade-in pb-24 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="neu-card p-8 sm:p-10 rounded-3xl text-center space-y-4">
        <div className="w-20 h-20 neu-button rounded-3xl mx-auto flex items-center justify-center bg-gradient-to-br from-[#FF0099] to-[#21D4FD]">
          <Icons.Sparkles className="text-white w-10 h-10" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-white font-accent">
          {APP_CONFIG.app.name}
        </h1>
        <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
          {APP_CONFIG.branding.tagline[lang]}
        </p>
        <span className="inline-block neu-inset-sm px-4 py-1 rounded-full text-slate-400 text-xs font-mono font-bold">
          v{APP_CONFIG.app.version}
        </span>
      </div>

      {/* Main Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="neu-card p-6 sm:p-8 rounded-3xl space-y-3">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2.5 font-accent">
            <Icons.Info className="w-5 h-5 text-[#FF0099]" />
            {lang === 'vi' ? 'Về chúng tôi' : 'About Us'}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Audition AI Studio là nền tảng tạo và chỉnh sửa nội dung đa phương tiện 3D thế hệ mới, tích hợp nhiều công nghệ AI tiên tiến để hỗ trợ cộng đồng sáng tạo hình ảnh, video chất lượng cao.
          </p>
        </div>

        <div className="neu-card p-6 sm:p-8 rounded-3xl space-y-3">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2.5 font-accent">
            <Icons.Zap className="w-5 h-5 text-amber-500" />
            {lang === 'vi' ? 'Công nghệ cốt lõi' : 'Core Tech'}
          </h2>
          <ul className="space-y-3 text-xs text-slate-500">
            <li className="flex items-center gap-3">
              <div className="w-8 h-8 neu-inset-sm rounded-xl flex items-center justify-center text-[#FF0099] font-bold">1</div>
              <span>Google Gemini 3.0 Pro & Vertex AI Vision Engine</span>
            </li>
            <li className="flex items-center gap-3">
              <div className="w-8 h-8 neu-inset-sm rounded-xl flex items-center justify-center text-[#21D4FD] font-bold">2</div>
              <span>AI Video Suite (Kling AI, Veo, Wan 2.1, Nano Banana Pro)</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
