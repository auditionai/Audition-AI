import React from 'react';
import { Language, ViewId } from '../types';
import { Icons } from '../components/Icons';

interface SupportProps {
  lang: Language;
  onNavigate: (view: ViewId) => void;
}

export const Support: React.FC<SupportProps> = ({ lang, onNavigate }) => {
  const devInfo = {
    email: 'support@auditionai.vn',
    zalo: 'https://zalo.me/g/kodwgn037',
    facebook: 'https://www.facebook.com/iam.cody.real/',
    facebookChat: 'https://www.facebook.com/groups/-837625495307432/chats/1641021490531432/'
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-24">
      {/* Header */}
      <div className="neu-card p-8 rounded-3xl text-center space-y-3">
        <div className="w-16 h-16 neu-inset-sm rounded-full flex items-center justify-center text-[#FF0099] mx-auto">
            <Icons.Heart className="w-8 h-8 text-[#FF0099]" />
        </div>
        <h1 className="text-3xl font-black text-slate-800 dark:text-white font-accent">
            {lang === 'vi' ? 'Hỗ Trợ Khách Hàng' : 'Customer Support'}
        </h1>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {lang === 'vi' 
                ? 'Đội ngũ hỗ trợ Audition AI luôn sẵn sàng lắng nghe và giải đáp mọi thắc mắc của bạn 24/7.' 
                : 'Audition AI support team is available 24/7 to assist you with any questions.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="neu-card p-6 rounded-3xl space-y-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 font-accent">
            <Icons.Mail className="w-5 h-5 text-[#21D4FD]" />
            {lang === 'vi' ? 'Hỗ trợ Email' : 'Email Support'}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Gửi phản hồi, báo lỗi hoặc yêu cầu hoàn Vcoin qua email chính thức của dự án.
          </p>
          <a href={`mailto:${devInfo.email}`} className="neu-button-primary block py-3 rounded-2xl text-center text-xs font-bold uppercase tracking-wider">
            {devInfo.email}
          </a>
        </div>

        <div className="neu-card p-6 rounded-3xl space-y-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 font-accent">
            <Icons.MessageCircle className="w-5 h-5 text-emerald-500" />
            {lang === 'vi' ? 'Cộng đồng Zalo' : 'Zalo Community'}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Tham gia nhóm Zalo để trao đổi kinh nghiệm tạo prompt và nhận thông báo khuyến mãi mới nhất.
          </p>
          <a href={devInfo.zalo} target="_blank" rel="noreferrer" className="neu-button-accent block py-3 rounded-2xl text-center text-xs font-bold uppercase tracking-wider">
            Tham gia nhóm Zalo
          </a>
        </div>

        <div className="neu-card p-6 rounded-3xl space-y-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 font-accent">
            <Icons.Facebook className="w-5 h-5 text-blue-500" />
            {lang === 'vi' ? 'Liên hệ qua Facebook' : 'Facebook Contact'}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {lang === 'vi'
              ? 'Liên hệ trực tiếp với Cody CN để được hỗ trợ về tài khoản, Vcoin và các chức năng của ứng dụng.'
              : 'Contact Cody CN directly for help with your account, Vcoin, and application features.'}
          </p>
          <a
            href={devInfo.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="neu-button block py-3 rounded-2xl text-center text-xs font-bold uppercase tracking-wider text-blue-500 hover:text-blue-400"
          >
            Facebook Cody CN
          </a>
        </div>

        <div className="neu-card p-6 rounded-3xl space-y-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 font-accent">
            <Icons.MessageSquare className="w-5 h-5 text-[#FF0099]" />
            {lang === 'vi' ? 'Nhóm chat Facebook' : 'Facebook Group Chat'}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {lang === 'vi'
              ? 'Tham gia nhóm chat cộng đồng để trao đổi kinh nghiệm, nhận thông báo và được hỗ trợ nhanh hơn.'
              : 'Join the community chat to exchange experience, receive updates, and get faster support.'}
          </p>
          <a
            href={devInfo.facebookChat}
            target="_blank"
            rel="noopener noreferrer"
            className="neu-button-primary block py-3 rounded-2xl text-center text-xs font-bold uppercase tracking-wider"
          >
            {lang === 'vi' ? 'Tham gia nhóm chat Facebook' : 'Join Facebook group chat'}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('guide')}
          className="neu-button p-5 rounded-3xl text-left flex items-center gap-4"
        >
          <span className="neu-inset-sm w-11 h-11 rounded-2xl flex items-center justify-center">
            <Icons.BookOpen className="w-5 h-5 text-[#FF0099]" />
          </span>
          <span>
            <span className="block text-sm font-black text-slate-800 dark:text-white">
              {lang === 'vi' ? 'Xem hướng dẫn sử dụng' : 'Open user guide'}
            </span>
            <span className="block mt-1 text-xs text-slate-500">
              {lang === 'vi' ? 'Các bước tạo ảnh, video và tải kết quả.' : 'Image, video, and download workflows.'}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('about')}
          className="neu-button p-5 rounded-3xl text-left flex items-center gap-4"
        >
          <span className="neu-inset-sm w-11 h-11 rounded-2xl flex items-center justify-center">
            <Icons.Info className="w-5 h-5 text-[#21D4FD]" />
          </span>
          <span>
            <span className="block text-sm font-black text-slate-800 dark:text-white">
              {lang === 'vi' ? 'Thông tin ứng dụng' : 'About the application'}
            </span>
            <span className="block mt-1 text-xs text-slate-500">
              {lang === 'vi' ? 'Phiên bản và nền tảng AI đang sử dụng.' : 'Version and integrated AI platforms.'}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
};
