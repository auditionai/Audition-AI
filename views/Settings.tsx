
import React, { useState } from 'react';
import { Language, ViewId } from '../types';
import { Icons } from '../components/Icons';
import { redeemGiftcode } from '../services/economyService';

interface SettingsProps {
  lang: Language;
  onLogout: () => void;
  onNavigate: (view: ViewId) => void;
  isAdmin?: boolean;
}

export const Settings: React.FC<SettingsProps> = ({ lang, onLogout, onNavigate, isAdmin }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'giftcode'>('profile');
  const [userInfo, setUserInfo] = useState({
      name: 'Audition Dancer',
      avatar: 'https://picsum.photos/100/100',
      email: 'dancer@audition.ai'
  });

  const [giftcode, setGiftcode] = useState('');

  const handleSaveProfile = () => {
      alert(lang === 'vi' ? 'Đã cập nhật thông tin thành công!' : 'Profile updated successfully!');
  };

  const handleRedeemCode = async () => {
      if (!giftcode) return;
      const result = await redeemGiftcode(giftcode);
      if (result.success) {
          alert(`Thành công! Bạn nhận được ${result.reward} Vcoin.`);
          setGiftcode('');
      } else {
          alert(`Lỗi: ${result.message}`);
      }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24 animate-fade-in">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-audi-pink to-audi-purple p-1 shadow-[0_0_20px_rgba(255,0,153,0.3)]">
                <img src={userInfo.avatar} alt="Avatar" className="w-full h-full rounded-full object-cover border-2 border-black" />
            </div>
            <div>
                <h1 className="text-2xl font-bold text-white font-game">{userInfo.name}</h1>
                <p className="text-slate-400 text-sm">{userInfo.email}</p>
                <div className="flex items-center gap-2 mt-1">
                     <span className="px-2 py-0.5 rounded bg-audi-yellow/20 text-audi-yellow text-[10px] font-bold border border-audi-yellow/50">VIP MEMBER</span>
                     <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-500 text-[10px] font-bold border border-green-500/50">ONLINE</span>
                </div>
            </div>
            <button 
                onClick={onLogout}
                className="ml-auto px-4 py-2 bg-red-500/10 hover:bg-red-500 border border-red-500/50 text-red-500 hover:text-white rounded-xl transition-all font-bold text-sm flex items-center gap-2"
            >
                <Icons.Rocket className="w-4 h-4 rotate-180" />
                {lang === 'vi' ? 'Đăng xuất' : 'Logout'}
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar Tabs */}
            <div className="md:col-span-1 space-y-2">
                {[
                    { id: 'profile', icon: Icons.User, label: { vi: 'Hồ sơ', en: 'Profile' } },
                    { id: 'security', icon: Icons.Shield, label: { vi: 'Bảo mật', en: 'Security' } },
                    { id: 'giftcode', icon: Icons.Gem, label: { vi: 'Giftcode', en: 'Giftcode' } },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm ${activeTab === tab.id ? 'bg-white/10 text-white border-l-4 border-audi-cyan' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}
                    >
                        <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-audi-cyan' : ''}`} />
                        {tab.label[lang as 'vi' | 'en']}
                    </button>
                ))}

                {/* Admin Access Button (Only visible if Admin) */}
                {isAdmin && (
                    <button
                        onClick={() => onNavigate('admin')}
                        className="w-full flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm mt-4 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30"
                    >
                        <Icons.Shield className="w-5 h-5" />
                        {lang === 'vi' ? 'Trang Quản Trị' : 'Admin Dashboard'}
                    </button>
                )}
            </div>

            {/* Content Area */}
            <div className="md:col-span-3 glass-panel p-6 md:p-8 rounded-3xl min-h-[400px]">
                
                {/* PROFILE SETTINGS */}
                {activeTab === 'profile' && (
                    <div className="space-y-6 animate-fade-in">
                        <h2 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">
                            {lang === 'vi' ? 'Thông tin cá nhân' : 'Personal Information'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{lang === 'vi' ? 'Tên hiển thị' : 'Display Name'}</label>
                                <input 
                                    type="text" 
                                    value={userInfo.name}
                                    onChange={(e) => setUserInfo({...userInfo, name: e.target.value})}
                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-audi-pink outline-none" 
                                />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Email</label>
                                <input 
                                    type="email" 
                                    value={userInfo.email}
                                    disabled
                                    className="w-full bg-black/10 border border-white/5 rounded-xl p-3 text-slate-500 cursor-not-allowed" 
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Avatar URL</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={userInfo.avatar}
                                        onChange={(e) => setUserInfo({...userInfo, avatar: e.target.value})}
                                        className="flex-1 bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-audi-pink outline-none text-sm font-mono" 
                                    />
                                    <div className="w-12 h-12 rounded-xl bg-black/30 border border-white/10 overflow-hidden shrink-0">
                                        <img src={userInfo.avatar} alt="" className="w-full h-full object-cover" />
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleSaveProfile}
                                className="px-6 py-3 bg-audi-pink hover:bg-pink-600 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(255,0,153,0.4)] transition-all"
                            >
                                {lang === 'vi' ? 'Lưu thay đổi' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                )}

                {/* SECURITY SETTINGS */}
                {activeTab === 'security' && (
                    <div className="space-y-6 animate-fade-in">
                        <h2 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">
                            {lang === 'vi' ? 'Đổi mật khẩu' : 'Change Password'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{lang === 'vi' ? 'Mật khẩu hiện tại' : 'Current Password'}</label>
                                <input type="password" className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-audi-purple outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{lang === 'vi' ? 'Mật khẩu mới' : 'New Password'}</label>
                                <input type="password" className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-audi-purple outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{lang === 'vi' ? 'Xác nhận mật khẩu mới' : 'Confirm New Password'}</label>
                                <input type="password" className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-audi-purple outline-none" />
                            </div>

                            <button className="px-6 py-3 bg-audi-purple hover:bg-purple-700 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(183,33,255,0.4)] transition-all">
                                {lang === 'vi' ? 'Cập nhật mật khẩu' : 'Update Password'}
                            </button>
                        </div>
                    </div>
                )}

                {/* GIFTCODE SETTINGS */}
                {activeTab === 'giftcode' && (
                    <div className="space-y-6 animate-fade-in">
                        <h2 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">
                            {lang === 'vi' ? 'Nhập Giftcode' : 'Redeem Giftcode'}
                        </h2>
                        
                        <div className="bg-gradient-to-r from-audi-pink/20 to-audi-purple/20 p-6 rounded-2xl border border-white/10 text-center space-y-4">
                            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto text-audi-yellow animate-bounce">
                                <Icons.Gem className="w-8 h-8" />
                            </div>
                            <h3 className="font-bold text-lg text-white">
                                {lang === 'vi' ? 'Nhận Vcoin & Quà tặng' : 'Get Vcoin & Gifts'}
                            </h3>
                            <p className="text-sm text-slate-400">
                                {lang === 'vi' ? 'Nhập mã quà tặng từ các sự kiện để nhận thưởng ngay.' : 'Enter gift codes from events to get rewards instantly.'}
                            </p>
                            
                            <div className="flex gap-2 max-w-sm mx-auto">
                                <input 
                                    type="text" 
                                    value={giftcode}
                                    onChange={(e) => setGiftcode(e.target.value.toUpperCase())}
                                    placeholder="CODE..."
                                    className="flex-1 bg-black/50 border border-audi-yellow/30 rounded-xl p-3 text-white font-game text-center uppercase tracking-widest focus:border-audi-yellow outline-none placeholder:text-slate-600" 
                                />
                                <button 
                                    onClick={handleRedeemCode}
                                    className="px-6 py-3 bg-audi-yellow text-black font-bold rounded-xl hover:bg-yellow-300 transition-colors"
                                >
                                    <Icons.Zap className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    </div>
  );
};
