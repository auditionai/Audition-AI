
import React, { useState, useEffect } from 'react';
import { Language, ViewId, UserProfile } from '../types';
import { Icons } from '../components/Icons';
import { redeemGiftcode, getUserProfile, updateAdminUserProfile, getGiftcodePromoConfig } from '../services/economyService';
import { useNotification } from '../components/NotificationSystem';

interface SettingsProps {
  lang: Language;
  onLogout: () => void;
  onNavigate: (view: ViewId) => void;
  isAdmin?: boolean;
}

export const Settings: React.FC<SettingsProps> = ({ lang, onLogout, onNavigate, isAdmin }) => {
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'giftcode'>('profile');
  
  // Initialize with empty/loading state rather than hardcoded demo data
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Editable Form State
  const [formName, setFormName] = useState('');
  const [formAvatar, setFormAvatar] = useState('');

  const [giftcode, setGiftcode] = useState('');
  
  // Announcement State
  const [promoConfig, setPromoConfig] = useState({ text: '', isActive: false });

  useEffect(() => {
      const loadUser = async () => {
          setIsLoading(true);
          const profile = await getUserProfile();
          setUserProfile(profile);
          setFormName(profile.username);
          setFormAvatar(profile.avatar);
          
          const promo = await getGiftcodePromoConfig();
          setPromoConfig(promo);
          
          setIsLoading(false);
      };
      loadUser();
  }, []);

  const handleSaveProfile = async () => {
      if (!userProfile) return;

      const updatedProfile = { 
          ...userProfile, 
          username: formName, 
          avatar: formAvatar 
      };

      try {
          // Reuse the generic update function from service
          await updateAdminUserProfile(updatedProfile);
          
          // Update local state
          setUserProfile(updatedProfile);
          notify(lang === 'vi' ? 'Đã cập nhật thông tin thành công!' : 'Profile updated successfully!', 'success');
      } catch (e) {
          notify('Error updating profile', 'error');
      }
  };

  const handleRedeemCode = async () => {
      if (!giftcode) return;
      const result = await redeemGiftcode(giftcode);
      if (result.success) {
          notify(`Thành công! Bạn nhận được ${result.reward} Vcoin.`, 'success');
          setGiftcode('');
          
          // Refresh user profile to show new balance
          const updated = await getUserProfile();
          setUserProfile(updated);
      } else {
          notify(`Lỗi: ${result.message}`, 'error');
      }
  };

  if (isLoading || !userProfile) {
      return <div className="flex items-center justify-center h-64"><Icons.Loader className="animate-spin text-white w-8 h-8"/></div>;
  }

  return (
    <div className="max-w-4xl mx-auto pb-24 animate-fade-in">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-audi-pink to-audi-purple p-1 shadow-[0_0_20px_rgba(255,0,153,0.3)]">
                <img src={userProfile.avatar} alt="Avatar" className="w-full h-full rounded-full object-cover border-2 border-black" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
            </div>
            <div>
                <h1 className="text-2xl font-bold text-white font-game">{userProfile.username}</h1>
                <p className="text-slate-400 text-sm">{userProfile.email}</p>
                <div className="flex items-center gap-2 mt-1">
                     {userProfile.isVip && <span className="px-2 py-0.5 rounded bg-audi-yellow/20 text-audi-yellow text-[10px] font-bold border border-audi-yellow/50">VIP MEMBER</span>}
                     <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-500 text-[10px] font-bold border border-green-500/50">ONLINE</span>
                     {isAdmin && <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-500 text-[10px] font-bold border border-red-500/50">ADMIN</span>}
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
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-audi-pink outline-none" 
                                />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Email</label>
                                <input 
                                    type="email" 
                                    value={userProfile.email}
                                    disabled
                                    className="w-full bg-black/10 border border-white/5 rounded-xl p-3 text-slate-500 cursor-not-allowed" 
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Avatar URL</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={formAvatar}
                                        onChange={(e) => setFormAvatar(e.target.value)}
                                        className="flex-1 bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-audi-pink outline-none text-sm font-mono" 
                                    />
                                    <div className="w-12 h-12 rounded-xl bg-black/30 border border-white/10 overflow-hidden shrink-0">
                                        <img src={formAvatar} alt="" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')} />
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
                        
                        {/* PROMOTIONAL ANNOUNCEMENT BANNER - FIXED & ENHANCED */}
                        {promoConfig.isActive && promoConfig.text && (
                            <div className="w-full p-4 mb-4 rounded-xl bg-gradient-to-r from-[#9d00ff] to-[#ff0099] flex items-center justify-center gap-3 animate-pulse shadow-[0_0_25px_rgba(255,0,153,0.5)] border border-white/20">
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-md">
                                    <Icons.Gem className="w-5 h-5 text-white" />
                                </div>
                                <span className="font-bold text-white text-sm md:text-base text-center leading-tight drop-shadow-md">
                                    {promoConfig.text}
                                </span>
                            </div>
                        )}

                        <div className="bg-gradient-to-br from-[#1a0b2e] to-[#240046] p-6 rounded-2xl border border-white/10 text-center space-y-4 relative overflow-hidden group shadow-lg">
                            {/* Decorative Background Elements */}
                            <div className="absolute top-0 right-0 w-40 h-40 bg-audi-purple/20 rounded-full blur-[60px] group-hover:bg-audi-purple/30 transition-all duration-1000"></div>
                            <div className="absolute bottom-0 left-0 w-40 h-40 bg-audi-pink/20 rounded-full blur-[60px] group-hover:bg-audi-pink/30 transition-all duration-1000"></div>

                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-audi-yellow animate-bounce relative z-10 border border-white/10 backdrop-blur-sm shadow-[0_0_15px_rgba(251,218,97,0.3)]">
                                <Icons.Gem className="w-8 h-8 drop-shadow-[0_0_5px_rgba(251,218,97,0.8)]" />
                            </div>
                            
                            <div className="relative z-10">
                                <h3 className="font-bold text-lg text-white">
                                    {lang === 'vi' ? 'Nhận Vcoin & Quà tặng' : 'Get Vcoin & Gifts'}
                                </h3>
                                <p className="text-sm text-slate-400 mt-1">
                                    {lang === 'vi' ? 'Nhập mã quà tặng từ các sự kiện để nhận thưởng ngay.' : 'Enter gift codes from events to get rewards instantly.'}
                                </p>
                            </div>
                            
                            <div className="flex gap-2 max-w-sm mx-auto relative z-10 pt-2">
                                <input 
                                    type="text" 
                                    value={giftcode}
                                    onChange={(e) => setGiftcode(e.target.value.toUpperCase())}
                                    placeholder="CODE..."
                                    className="flex-1 bg-black/60 border border-audi-yellow/30 rounded-xl p-3 text-white font-game text-center uppercase tracking-widest focus:border-audi-yellow outline-none placeholder:text-slate-600 focus:shadow-[0_0_15px_rgba(251,218,97,0.2)] transition-all h-12" 
                                />
                                <button 
                                    onClick={handleRedeemCode}
                                    className="w-12 h-12 bg-audi-yellow text-black font-bold rounded-xl hover:bg-yellow-300 transition-all shadow-[0_0_15px_rgba(251,218,97,0.4)] hover:scale-105 active:scale-95 flex items-center justify-center"
                                >
                                    <Icons.Zap className="w-6 h-6" />
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
