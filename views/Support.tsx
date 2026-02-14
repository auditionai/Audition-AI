
import React from 'react';
import { Language, ViewId } from '../types';
import { Icons } from '../components/Icons';

interface SupportProps {
  lang: Language;
  onNavigate: (view: ViewId) => void;
}

export const Support: React.FC<SupportProps> = ({ lang, onNavigate }) => {
  // Bank Information
  const bankInfo = {
    bankName: 'Techcombank',
    accountNumber: '554646686868',
    accountName: 'DONG MINH PHU',
    // VietQR API format
    qrUrl: 'https://img.vietqr.io/image/TCB-554646686868-compact.png?accountName=DONG%20MINH%20PHU'
  };

  // Dev Info
  const devInfo = {
    name: 'DMP AI Dev',
    email: 'dmpaidev@gmail.com',
    phone: '+84 766771509',
    zalo: 'https://zalo.me/g/kodwgn037'
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
      
      {/* Header */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-500 mb-4">
            <Icons.Heart className="w-8 h-8 fill-current" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            {lang === 'vi' ? 'Hỗ trợ & Liên hệ' : 'Support & Contact'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
            {lang === 'vi' 
                ? 'Kết nối với nhà phát triển và ủng hộ dự án để chúng tôi có thể duy trì và phát triển thêm nhiều tính năng mới.' 
                : 'Connect with the developer and support the project so we can maintain and develop more new features.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Donate Section */}
          <div className="glass-panel p-8 rounded-3xl border-t-4 border-brand-500 shadow-xl">
             <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
                <Icons.QrCode className="w-5 h-5 text-brand-500" />
                {lang === 'vi' ? 'Donate Nhà phát triển' : 'Donate to Developer'}
             </h2>
             
             <div className="flex flex-col items-center">
                 <div className="bg-white p-4 rounded-xl shadow-inner mb-6">
                     <img 
                        src={bankInfo.qrUrl} 
                        alt="Bank QR Code" 
                        className="w-48 h-48 object-contain mix-blend-multiply" 
                     />
                 </div>
                 
                 <div className="w-full space-y-3 bg-slate-50 dark:bg-white/5 p-4 rounded-xl">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{lang === 'vi' ? 'Ngân hàng' : 'Bank'}</span>
                        <span className="font-bold text-slate-800 dark:text-white">{bankInfo.bankName}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{lang === 'vi' ? 'Số tài khoản' : 'Account No'}</span>
                        <span className="font-mono font-bold text-brand-600 dark:text-brand-400 text-lg">{bankInfo.accountNumber}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{lang === 'vi' ? 'Chủ tài khoản' : 'Account Name'}</span>
                        <span className="font-bold text-slate-800 dark:text-white uppercase">{bankInfo.accountName}</span>
                    </div>
                 </div>
                 
                 <p className="text-xs text-center text-slate-400 mt-4 italic">
                    {lang === 'vi' ? 'Quét mã QR bằng ứng dụng ngân hàng của bạn' : 'Scan QR code with your banking app'}
                 </p>
             </div>
          </div>

          {/* Contact & Info Section */}
          <div className="space-y-6">
              
              {/* Dev Info Card */}
              <div className="glass-panel p-8 rounded-3xl">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
                    <Icons.User className="w-5 h-5 text-brand-500" />
                    {lang === 'vi' ? 'Thông tin liên hệ' : 'Contact Information'}
                </h2>
                
                <div className="space-y-4">
                    <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                            <Icons.Mail className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Email</p>
                            <a href={`mailto:${devInfo.email}`} className="font-medium text-slate-800 dark:text-white hover:text-brand-500">
                                {devInfo.email}
                            </a>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
                            <Icons.Phone className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{lang === 'vi' ? 'Điện thoại' : 'Phone'}</p>
                            <a href={`tel:${devInfo.phone}`} className="font-medium text-slate-800 dark:text-white hover:text-brand-500">
                                {devInfo.phone}
                            </a>
                        </div>
                    </div>

                    <a 
                        href={devInfo.zalo} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 hover:shadow-md transition-all group"
                    >
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                            <Icons.MessageCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs text-blue-600 dark:text-blue-300 font-semibold">{lang === 'vi' ? 'Hỗ trợ Zalo' : 'Zalo Support'}</p>
                            <span className="font-medium text-slate-800 dark:text-white text-sm">
                                {lang === 'vi' ? 'Tham gia nhóm hỗ trợ' : 'Join support group'}
                            </span>
                        </div>
                        <Icons.ChevronRight className="w-4 h-4 ml-auto text-slate-400" />
                    </a>
                </div>
              </div>

              {/* Quick Navigation Integration */}
              <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => onNavigate('guide')}
                    className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-brand-500 dark:hover:border-brand-500 transition-all text-left group shadow-sm"
                  >
                     <Icons.BookOpen className="w-6 h-6 text-brand-500 mb-2 group-hover:scale-110 transition-transform" />
                     <h3 className="font-bold text-slate-800 dark:text-white text-sm">
                        {lang === 'vi' ? 'Hướng dẫn' : 'Guide'}
                     </h3>
                  </button>
                  <button 
                    onClick={() => onNavigate('about')}
                    className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-brand-500 dark:hover:border-brand-500 transition-all text-left group shadow-sm"
                  >
                     <Icons.Info className="w-6 h-6 text-brand-500 mb-2 group-hover:scale-110 transition-transform" />
                     <h3 className="font-bold text-slate-800 dark:text-white text-sm">
                        {lang === 'vi' ? 'Giới thiệu' : 'About'}
                     </h3>
                  </button>
              </div>

          </div>
      </div>
      
      <div className="text-center text-slate-400 text-sm mt-8">
        {lang === 'vi' ? 'DMP AI Dev - Luôn đồng hành cùng sự sáng tạo của bạn' : 'DMP AI Dev - Always accompanying your creativity'}
      </div>
    </div>
  );
};
