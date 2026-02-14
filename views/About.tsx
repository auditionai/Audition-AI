
import React from 'react';
import { Language } from '../types';
import { Icons } from '../components/Icons';
import { APP_CONFIG } from '../constants';

interface AboutProps {
  lang: Language;
}

export const About: React.FC<AboutProps> = ({ lang }) => {
  return (
    <div className="space-y-8 animate-fade-in pb-20 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="text-center space-y-4 py-10">
        <div className="w-20 h-20 bg-brand-500 rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-brand-500/30">
            <Icons.Sparkles className="text-white w-10 h-10" />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">{APP_CONFIG.app.name}</h1>
        <p className="text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            {APP_CONFIG.branding.tagline[lang]}
        </p>
        <span className="inline-block px-4 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 text-sm font-mono">
            v{APP_CONFIG.app.version}
        </span>
      </div>

      {/* Main Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-8 rounded-3xl">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-3 text-slate-800 dark:text-white">
                <Icons.Info className="w-6 h-6 text-brand-500" />
                {lang === 'vi' ? 'Về chúng tôi' : 'About Us'}
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                {lang === 'vi' 
                    ? 'DMP AI Photo Studio là nền tảng xử lý hình ảnh thế hệ mới, tích hợp sức mạnh của trí tuệ nhân tạo để biến mọi ý tưởng thành hiện thực. Chúng tôi cung cấp bộ công cụ toàn diện từ tạo ảnh nghệ thuật, chỉnh sửa chuyên sâu đến thiết kế đồ họa chuyên nghiệp, giúp người dùng phổ thông tiếp cận công nghệ AI tiên tiến nhất.' 
                    : 'DMP AI Photo Studio is a next-generation image processing platform that integrates the power of artificial intelligence to turn every idea into reality. We provide a comprehensive toolkit from artistic image generation, deep editing to professional graphic design, helping everyday users access the most advanced AI technology.'}
            </p>
        </div>

        <div className="glass-panel p-8 rounded-3xl">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-3 text-slate-800 dark:text-white">
                <Icons.Zap className="w-6 h-6 text-yellow-500" />
                {lang === 'vi' ? 'Công nghệ cốt lõi' : 'Core Technology'}
            </h2>
            <ul className="space-y-4">
                <li className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                        <Icons.Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-white">Google Gemini 3.0 Pro</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {lang === 'vi' ? 'Hiểu ngôn ngữ tự nhiên và ngữ cảnh hình ảnh phức tạp.' : 'Understands natural language and complex image contexts.'}
                        </p>
                    </div>
                </li>
                <li className="flex items-start gap-3">
                    <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-purple-600 dark:text-purple-400">
                        <Icons.Image className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-white">Google Imagen 4</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {lang === 'vi' ? 'Model tạo sinh hình ảnh chất lượng 4K siêu thực.' : 'Photorealistic 4K image generation model.'}
                        </p>
                    </div>
                </li>
            </ul>
        </div>
      </div>

      {/* Features Grid */}
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-center text-slate-800 dark:text-white">
            {lang === 'vi' ? 'Tại sao chọn DMP AI?' : 'Why Choose DMP AI?'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
                {
                    icon: Icons.Wand,
                    title: {vi: 'Dễ sử dụng', en: 'Easy to Use'},
                    desc: {vi: 'Giao diện trực quan, không cần kỹ năng đồ họa.', en: 'Intuitive interface, no graphic skills required.'}
                },
                {
                    icon: Icons.Shield,
                    title: {vi: 'Bảo mật cao', en: 'High Security'},
                    desc: {vi: 'Dữ liệu của bạn được mã hóa và bảo vệ tuyệt đối.', en: 'Your data is encrypted and strictly protected.'}
                },
                {
                    icon: Icons.Zap,
                    title: {vi: 'Tốc độ cực nhanh', en: 'Blazing Fast'},
                    desc: {vi: 'Xử lý hình ảnh chỉ trong vài giây với Cloud GPU.', en: 'Process images in seconds with Cloud GPU.'}
                }
            ].map((item, idx) => (
                <div key={idx} className="bg-white dark:bg-white/5 p-6 rounded-2xl border border-slate-100 dark:border-white/5 hover:shadow-lg transition-shadow">
                    <item.icon className="w-10 h-10 text-brand-500 mb-4" />
                    <h4 className="font-bold text-lg mb-2 text-slate-800 dark:text-white">{item.title[lang]}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{item.desc[lang]}</p>
                </div>
            ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pt-10 border-t border-slate-200 dark:border-white/10 text-slate-500 text-sm">
        <p>{APP_CONFIG.app.copyright}</p>
        <p className="mt-1">Designed with ❤️ by DMP Team</p>
      </div>
    </div>
  );
};
