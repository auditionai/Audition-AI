
import React from 'react';
import { Language } from '../types';
import { Icons } from '../components/Icons';

interface GuideProps {
  lang: Language;
}

export const Guide: React.FC<GuideProps> = ({ lang }) => {
  const steps = [
    {
        title: {vi: '1. Chọn công cụ', en: '1. Select a Tool'},
        desc: {
            vi: 'Truy cập thư viện "Công cụ" và chọn tính năng phù hợp với nhu cầu của bạn (Tạo ảnh, Xóa nền, v.v.).', 
            en: 'Go to the "Tools" library and select the feature that fits your needs (Text-to-Image, Remove Background, etc.).'
        },
        icon: Icons.Menu
    },
    {
        title: {vi: '2. Nhập thông tin', en: '2. Provide Input'},
        desc: {
            vi: 'Tùy vào công cụ, bạn cần tải ảnh lên hoặc nhập câu lệnh mô tả (Prompt). Với các công cụ Tạo ảnh, hãy mô tả chi tiết nhất có thể.', 
            en: 'Depending on the tool, upload an image or enter a text prompt. For Image Generation tools, be as detailed as possible.'
        },
        icon: Icons.Wand
    },
    {
        title: {vi: '3. Chờ xử lý', en: '3. Wait for AI'},
        desc: {
            vi: 'Hệ thống AI sẽ phân tích và xử lý yêu cầu của bạn. Quá trình này thường mất từ 5-10 giây.', 
            en: 'The AI system will analyze and process your request. This usually takes 5-10 seconds.'
        },
        icon: Icons.Zap
    },
    {
        title: {vi: '4. Tải về', en: '4. Download'},
        desc: {
            vi: 'Xem trước kết quả và nhấn nút Tải xuống để lưu ảnh về thiết bị.', 
            en: 'Preview the result and click the Download button to save the image to your device.'
        },
        icon: Icons.Download
    }
  ];

  const tips = [
    {
        title: {vi: 'Rõ ràng & Chi tiết', en: 'Be Clear & Detailed'},
        content: {
            vi: 'Thay vì "con mèo", hãy thử "một con mèo Anh lông ngắn dễ thương đang ngồi trên ghế sofa đỏ, ánh sáng ấm áp".',
            en: 'Instead of "a cat", try "a cute British Shorthair cat sitting on a red velvet sofa, warm lighting".'
        }
    },
    {
        title: {vi: 'Thử nghiệm phong cách', en: 'Experiment with Styles'},
        content: {
            vi: 'Thêm các từ khóa như "cyberpunk", "watercolor", "oil painting", "cinematic" để thay đổi hoàn toàn phong cách ảnh.',
            en: 'Add keywords like "cyberpunk", "watercolor", "oil painting", "cinematic" to completely change the image style.'
        }
    },
    {
        title: {vi: 'Tỉ lệ ảnh', en: 'Aspect Ratios'},
        content: {
            vi: 'Mặc định ảnh là hình vuông (1:1). Bạn có thể ghi chú "wide angle" hoặc "portrait" trong mô tả để AI hiểu ngữ cảnh tốt hơn.',
            en: 'Default is square (1:1). You can mention "wide angle" or "portrait" in the prompt for better context.'
        }
    }
  ];

  return (
    <div className="space-y-10 animate-fade-in pb-20 max-w-5xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            {lang === 'vi' ? 'Hướng dẫn sử dụng' : 'User Guide'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
            {lang === 'vi' ? 'Làm chủ công nghệ AI trong 4 bước đơn giản' : 'Master AI technology in 4 simple steps'}
        </p>
      </div>

      {/* Steps Timeline */}
      <div className="relative">
          <div className="absolute left-1/2 -ml-0.5 w-0.5 h-full bg-slate-200 dark:bg-slate-800 hidden md:block"></div>
          <div className="space-y-6 md:space-y-12">
            {steps.map((step, idx) => (
                <div key={idx} className={`flex flex-col md:flex-row items-center gap-6 ${idx % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>
                    <div className="flex-1 w-full p-6 glass-panel rounded-2xl border-l-4 border-brand-500 hover:scale-105 transition-transform duration-300">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                                <step.icon className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-1">{step.title[lang]}</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{step.desc[lang]}</p>
                            </div>
                        </div>
                    </div>
                    {/* Center Dot for Desktop */}
                    <div className="w-8 h-8 bg-brand-500 rounded-full border-4 border-white dark:border-slate-900 shadow-lg z-10 hidden md:block shrink-0"></div>
                    <div className="flex-1 hidden md:block"></div>
                </div>
            ))}
          </div>
      </div>

      {/* Pro Tips Section */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Icons.Sparkles className="w-6 h-6 text-yellow-500" />
            {lang === 'vi' ? 'Mẹo từ chuyên gia' : 'Pro Tips'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tips.map((tip, idx) => (
                <div key={idx} className="bg-gradient-to-br from-brand-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
                    <h3 className="font-bold text-lg mb-3">{tip.title[lang]}</h3>
                    <p className="text-white/90 text-sm leading-relaxed">
                        {tip.content[lang]}
                    </p>
                </div>
            ))}
        </div>
      </div>

      {/* FAQ Mini */}
      <div className="glass-panel p-8 rounded-3xl">
          <h2 className="text-xl font-bold mb-6 text-slate-800 dark:text-white">FAQ</h2>
          <div className="space-y-4">
              <details className="group p-4 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 cursor-pointer">
                  <summary className="font-medium flex justify-between items-center list-none text-slate-800 dark:text-white">
                      <span>{lang === 'vi' ? 'Ảnh tạo ra có bản quyền không?' : 'Is the generated image copyrighted?'}</span>
                      <span className="transition group-open:rotate-180">
                          <Icons.ChevronRight className="w-4 h-4 rotate-90" />
                      </span>
                  </summary>
                  <p className="text-slate-600 dark:text-slate-400 mt-3 text-sm">
                      {lang === 'vi' 
                        ? 'Bạn có toàn quyền sử dụng thương mại đối với các hình ảnh được tạo ra bởi DMP AI.' 
                        : 'You have full commercial usage rights for images generated by DMP AI.'}
                  </p>
              </details>
              
              <details className="group p-4 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 cursor-pointer">
                  <summary className="font-medium flex justify-between items-center list-none text-slate-800 dark:text-white">
                      <span>{lang === 'vi' ? 'Tôi có thể tải ảnh chất lượng cao không?' : 'Can I download high quality images?'}</span>
                      <span className="transition group-open:rotate-180">
                          <Icons.ChevronRight className="w-4 h-4 rotate-90" />
                      </span>
                  </summary>
                  <p className="text-slate-600 dark:text-slate-400 mt-3 text-sm">
                      {lang === 'vi' 
                        ? 'Có. Mặc định công cụ "Nâng cấp ảnh 4K" sẽ giúp bạn có được chất lượng cao nhất.' 
                        : 'Yes. The "Image Upscaler" tool will help you get the highest quality by default.'}
                  </p>
              </details>
          </div>
      </div>
    </div>
  );
};
