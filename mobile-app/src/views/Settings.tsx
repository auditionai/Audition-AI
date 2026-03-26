/**
 * Settings Screen - Real auth integration & Functional Modals
 * Profile data from AuthContext, functional logout
 */

import React, { useState, useRef } from 'react';
import { Palette, LifeBuoy, FileText, LogOut, ChevronRight, Coins, Info, Key, Gift, CircleUser, X, Loader, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/NotificationSystem';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../services/supabaseClient';
import { redeemGiftcode, updateMyProfile } from '../services/economyService';
import { uploadFileToR2 } from '../services/storageService';

export function Settings() {
  const navigate = useNavigate();
  const { user, userRole, logout, refreshProfile } = useAuth();
  const { notify, confirm } = useNotification();
  const { theme, setTheme } = useTheme();

  // Modal States
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showGiftcodeModal, setShowGiftcodeModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Giftcode State
  const [giftcode, setGiftcode] = useState('');

  // Avatar Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = () => {
    confirm({
      title: 'Đăng xuất',
      message: 'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản?',
      confirmText: 'Đăng xuất',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        await logout();
        notify('Đã đăng xuất thành công.', 'info');
        navigate('/');
      },
    });
  };

  const displayName = user?.username || 'User';
  const displayEmail = user?.email || '';
  const displayInitial = displayName.charAt(0).toUpperCase();

  const handleThemeToggle = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const getThemeLabel = (t: string) => {
    if (t === 'light') return 'Sáng (Light)';
    if (t === 'dark') return 'Tối (Dark)';
    return 'Hệ thống (System)';
  };

  // --- ACTIONS ---

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        notify('Đang tải ảnh lên...', 'info');
        
        // Upload to R2 (re-using the logic from WorkspaceImage)
        const uploadedUrl = await uploadFileToR2(base64Data, `avatars/${user.id}`);
        
        // Update DB
        const res = await updateMyProfile({ ...user, avatar: uploadedUrl });
        if (res.success) {
          notify('Cập nhật Avatar thành công!', 'success');
          await refreshProfile();
        } else {
          notify(res.error || 'Lỗi cập nhật Avatar', 'error');
        }
        setLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      notify('Lỗi: ' + err.message, 'error');
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      notify('Mật khẩu mới phải có ít nhất 6 ký tự.', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify('Mật khẩu xác nhận không khớp.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      notify('Đổi mật khẩu thành công!', 'success');
      setShowPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      notify(err.message || 'Lỗi đổi mật khẩu', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemGiftcode = async () => {
    if (!giftcode.trim()) {
      notify('Vui lòng nhập mã Giftcode', 'warning');
      return;
    }

    setLoading(true);
    try {
      const res = await redeemGiftcode(giftcode);
      if (res.success) {
        notify(`Nhập Giftcode thành công! Nhận ${res.reward} Vcoin.`, 'success');
        setShowGiftcodeModal(false);
        setGiftcode('');
        await refreshProfile();
      } else {
        notify(res.message || 'Giftcode không hợp lệ', 'error');
      }
    } catch (err: any) {
      notify(err.message || 'Lỗi server', 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- MENU ITEMS ---

  const accountItems = [
    { icon: CircleUser, label: 'Đổi Avatar', value: '', action: () => fileInputRef.current?.click() },
    { icon: Key, label: 'Đổi mật khẩu', value: '', action: () => setShowPasswordModal(true) },
  ];

  const generalItems = [
    { icon: Gift, label: 'Nhập Giftcode', value: '', action: () => setShowGiftcodeModal(true) },
    { icon: Coins, label: 'Số dư Vcoin', value: user?.vcoin_balance?.toLocaleString() || '0', action: () => navigate('/topup') },
    { icon: Palette, label: 'Giao diện', value: getThemeLabel(theme), action: handleThemeToggle },
  ];

  const helpItems = [
    { icon: FileText, label: 'Hướng dẫn sử dụng', action: () => navigate('/guide') },
    { icon: LifeBuoy, label: 'Trung tâm hỗ trợ', action: () => navigate('/support') },
    { icon: Info, label: 'Về chúng tôi', action: () => navigate('/about') },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] dark:bg-[#09090B]">
      
      {/* Hidden file input for avatar */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarSelect}
        disabled={loading}
      />

      <div className="p-4 pb-32 space-y-8">
        {/* Profile Card */}
        <div className="bg-white dark:bg-[#18181B] rounded-[32px] p-6 text-center border border-gray-100 dark:border-zinc-800 shadow-sm relative overflow-hidden">
          {loading && (
             <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-10 flex items-center justify-center">
                <Loader className="w-8 h-8 text-black dark:text-white animate-spin" />
             </div>
          )}
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#111] to-[#555] mx-auto text-white flex items-center justify-center text-3xl font-bold mb-4 shadow-lg shadow-black/10 overflow-hidden relative group">
            {user?.avatar ? (
              <img src={user.avatar} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayInitial
            )}
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <CircleUser className="w-6 h-6 text-white" />
            </div>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">{displayName}</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">{displayEmail}</p>
        </div>

        {/* Settings List */}
        <div>
          <h3 className="text-sm font-bold tracking-tight text-gray-500 dark:text-zinc-400 uppercase mb-3 ml-2">Tài khoản & Bảo mật</h3>
          <div className="bg-white dark:bg-[#18181B] rounded-[24px] border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden mb-6">
            {accountItems.map((item, idx) => (
              <button key={idx} onClick={item.action} className="w-full flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:bg-zinc-800 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5 text-gray-500 dark:text-zinc-400" />
                  <span className="font-medium text-[15px] text-gray-900 dark:text-white">{item.label}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-400">
                  <span className="text-sm max-w-[150px] truncate">{item.value}</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>

          <h3 className="text-sm font-bold tracking-tight text-gray-500 dark:text-zinc-400 uppercase mb-3 ml-2">Cài đặt chung</h3>
          <div className="bg-white dark:bg-[#18181B] rounded-[24px] border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
            {generalItems.map((item, idx) => (
              <button key={idx} onClick={item.action} className="w-full flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:bg-zinc-800 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5 text-gray-500 dark:text-zinc-400" />
                  <span className="font-medium text-[15px] text-gray-900 dark:text-white">{item.label}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-400">
                  <span className="text-sm max-w-[150px] truncate">{item.value}</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold tracking-tight text-gray-500 dark:text-zinc-400 uppercase mb-3 ml-2">Hỗ trợ</h3>
          <div className="bg-white dark:bg-[#18181B] rounded-[24px] border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden mb-6">
            {helpItems.map((item, idx) => (
              <button
                key={idx}
                onClick={item.action}
                className="w-full flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:bg-[#27272A] active:bg-gray-100 dark:bg-zinc-800 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5 text-gray-500 dark:text-zinc-400" />
                  <span className="font-medium text-[15px] text-gray-900 dark:text-white">{item.label}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
              </button>
            ))}
          </div>

          {userRole === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="w-full flex items-center justify-between p-4 mb-4 bg-white dark:bg-[#18181B] rounded-[24px] border border-amber-200 dark:border-amber-500/30 shadow-sm text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-gray-900 dark:text-white">Quản trị hệ thống</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">Mở trang admin đầy đủ của ứng dụng</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-4 text-red-500 font-semibold bg-white dark:bg-[#18181B] rounded-[24px] border border-red-500/20 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Đăng xuất
          </button>
        </div>

        {/* App Info */}
        <p className="text-center text-xs text-gray-400 dark:text-zinc-500 pt-4">
          Audition AI Studio 2026
        </p>
      </div>

      {/* --- MODALS --- */}

      {/* Giftcode Modal */}
      {showGiftcodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#18181B] w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Nhập Giftcode</h3>
                </div>
                <button onClick={() => setShowGiftcodeModal(false)} className="p-2 bg-gray-50 dark:bg-zinc-800 rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2">Mã Giftcode</label>
                  <input
                    type="text"
                    value={giftcode}
                    onChange={(e) => setGiftcode(e.target.value.toUpperCase())}
                    placeholder="Nhập mã ưu đãi..."
                    className="w-full bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white rounded-[16px] px-4 py-4 font-bold tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <button
                  onClick={handleRedeemGiftcode}
                  disabled={loading || !giftcode.trim()}
                  className="w-full font-bold text-center justify-center bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-[16px] px-4 py-4 disabled:opacity-50 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-purple-500/25"
                >
                  {loading ? <Loader className="w-5 h-5 animate-spin mx-auto" /> : 'Xác Nhận Đổi Quà'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#18181B] w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                    <Key className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Đổi Mật Khẩu</h3>
                </div>
                <button onClick={() => setShowPasswordModal(false)} className="p-2 bg-gray-50 dark:bg-zinc-800 rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2">Mật khẩu mới</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
                    className="w-full bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white rounded-[16px] px-4 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2">Xác nhận mật khẩu mới</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white rounded-[16px] px-4 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleUpdatePassword}
                  disabled={loading || !newPassword || !confirmPassword}
                  className="w-full font-bold text-center justify-center bg-gray-900 dark:bg-white text-white dark:text-black rounded-[16px] px-4 py-4 disabled:opacity-50 active:scale-95 transition-all flex items-center gap-2"
                >
                  {loading ? <Loader className="w-5 h-5 animate-spin mx-auto text-current" /> : 'Lưu Thay Đổi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
