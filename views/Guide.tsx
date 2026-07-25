import React from 'react';
import { Language } from '../types';
import { Icons } from '../components/Icons';

interface GuideProps {
  lang: Language;
}

export const Guide: React.FC<GuideProps> = ({ lang }) => {
  const steps = [
    {
        title: {vi: '1. Chọn công cụ AI', en: '1. Select an AI Tool'},
        desc: {
            vi: 'Truy cập "Công cụ" và chọn tính năng tạo ảnh/video/chỉnh sửa bạn mong muốn.', 
            en: 'Go to "Tools" and select the desired AI generation or editing feature.'
        },
        icon: Icons.Wand
    },
    {
        title: {vi: '2. Tải ảnh & Nhập Prompt', en: '2. Input Images & Prompt'},
        desc: {
            vi: 'Tải ảnh nhân vật hoặc nhập câu lệnh mô tả chi tiết phong cách bạn muốn AI thể hiện.', 
            en: 'Upload character reference images or enter a detailed prompt describing your vision.'
        },
        icon: Icons.MessageSquare
    },
    {
        title: {vi: '3. AI xử lý ngầm', en: '3. AI Processing'},
        desc: {
            vi: 'Hệ thống tự động đưa công việc vào hàng chờ và xử lý đa luồng thông minh.', 
            en: 'The system enqueues the job and processes it using multi-threaded AI pipelines.'
        },
        icon: Icons.Zap
    },
    {
        title: {vi: '4. Lưu về thiết bị', en: '4. Download & Publish'},
        desc: {
            vi: 'Xem trước kết quả, ấn Tải về hoặc Chia sẻ công khai lên Thư viện cộng đồng.', 
            en: 'Preview your creation, click Download, or publish it to the Community Showcase.'
        },
        icon: Icons.Download
    }
  ];

  return (
    <div className="space-y-10 animate-fade-in pb-24 max-w-5xl mx-auto">
      <div className="neu-card p-8 rounded-3xl text-center space-y-2">
        <h1 className="text-3xl font-black text-slate-800 dark:text-white font-accent">
            {lang === 'vi' ? 'Hướng Dẫn Sử Dụng Audition AI' : 'Audition AI User Guide'}
        </h1>
        <p className="text-xs text-slate-500">
            {lang === 'vi' ? 'Làm chủ công nghệ sáng tạo AI 3D trong 4 bước đơn giản' : 'Master 3D AI generation in 4 simple steps'}
        </p>
      </div>

      {/* Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {steps.map((step, idx) => (
          <div key={idx} className="neu-card p-6 rounded-3xl flex items-start gap-4 hover:scale-[1.02] transition-all">
            <div className="w-12 h-12 neu-inset-sm rounded-2xl flex items-center justify-center text-[#FF0099] shrink-0">
              <step.icon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-slate-800 dark:text-white font-accent">{step.title[lang]}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{step.desc[lang]}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
