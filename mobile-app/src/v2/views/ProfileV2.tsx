import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Coins,
  Gift,
  KeyRound,
  Loader,
  LogOut,
  MoonStar,
  ShieldCheck,
  Sparkles,
  SunMedium,
  UserRound,
  WandSparkles,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../components/NotificationSystem';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getGiftcodePromoConfig, redeemGiftcode, updateMyProfile } from '../../services/economyService';
import { supabase } from '../../services/supabaseClient';
import { uploadFileToR2 } from '../../services/storageService';

type ProfileModal = 'password' | 'giftcode' | null;

export function ProfileV2() {
  const navigate = useNavigate();
  const { notify, confirm } = useNotification();
  const { user, userRole, logout, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const avatarInput = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<ProfileModal>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [giftcode, setGiftcode] = useState('');
  const [giftPromo, setGiftPromo] = useState({ text: '', isActive: false });

  useEffect(() => {
    getGiftcodePromoConfig().then(setGiftPromo).catch(() => setGiftPromo({ text: '', isActive: false }));
  }, []);

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    setLoading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const url = await uploadFileToR2(data, `avatars/${user.id}`);
      const result = await updateMyProfile({ ...user, avatar: url });
      if (!result.success) throw new Error(result.error || 'Không thể cập nhật avatar.');
      await refreshProfile();
      notify('Avatar mới đã được cập nhật.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể tải avatar.', 'error');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const changePassword = async () => {
    if (password.length < 6) return notify('Mật khẩu cần ít nhất 6 ký tự.', 'warning');
    if (password !== passwordAgain) return notify('Hai mật khẩu chưa trùng nhau.', 'warning');
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setModal(null);
      setPassword('');
      setPasswordAgain('');
      notify('Đã đổi mật khẩu.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể đổi mật khẩu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const redeem = async () => {
    if (!giftcode.trim()) return;
    setLoading(true);
    try {
      const result = await redeemGiftcode(giftcode.trim());
      if (!result.success) throw new Error(result.message || 'Giftcode không hợp lệ.');
      await refreshProfile();
      setModal(null);
      setGiftcode('');
      notify(`Đã nhận ${result.reward?.toLocaleString('vi-VN')} Vcoin.`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể sử dụng Giftcode.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => confirm({
    title: 'Rời Creative Universe?',
    message: 'Bạn có thể đăng nhập lại bất cứ lúc nào.',
    confirmText: 'Đăng xuất',
    cancelText: 'Ở lại',
    isDanger: true,
    onConfirm: async () => {
      await logout();
      navigate('/');
    },
  });

  const displayName = user?.username || 'Nhà sáng tạo';
  const currentThemeIcon = theme === 'dark' ? MoonStar : theme === 'light' ? SunMedium : Sparkles;
  const CurrentThemeIcon = currentThemeIcon;

  return (
    <div className="v2-profile-page">
      <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(event) => void uploadAvatar(event)} />

      <section className="v2-profile-identity">
        <div className="v2-profile-avatar">
          {user?.avatar ? <img src={user.avatar} alt={displayName} /> : <span>{displayName.charAt(0).toUpperCase()}</span>}
          <button type="button" onClick={() => avatarInput.current?.click()} aria-label="Đổi avatar"><Camera size={17} /></button>
          {loading && <i><Loader className="v2-spin" size={21} /></i>}
        </div>
        <div className="v2-profile-identity__copy">
          <span><Sparkles size={13} /> Creator profile</span>
          <h1>{displayName}</h1>
          <p>{user?.email}</p>
          <b><ShieldCheck size={14} /> {userRole === 'admin' ? 'Quản trị viên' : 'Tài khoản đã xác thực'}</b>
        </div>
        <div className="v2-profile-rings" aria-hidden="true"><i /><i /></div>
      </section>

      <section className="v2-profile-wallet" onClick={() => navigate('/topup')}>
        <span><Coins size={24} /></span>
        <div><small>Năng lượng hiện có</small><strong>{(user?.vcoin_balance || 0).toLocaleString('vi-VN')} <em>Vcoin</em></strong></div>
        <button type="button">Nạp thêm <ArrowRight size={16} /></button>
      </section>

      <section className="v2-profile-theme">
        <div className="v2-profile-section-title">
          <div><span>Không gian hiển thị</span><h2>Chọn giao diện</h2></div>
          <CurrentThemeIcon size={23} />
        </div>
        <div className="v2-theme-options" role="group" aria-label="Chọn chế độ giao diện">
          {([
            ['light', 'Sáng', SunMedium],
            ['dark', 'Tối', MoonStar],
            ['system', 'Hệ thống', Sparkles],
          ] as const).map(([value, label, Icon]) => (
            <button
              type="button"
              key={value}
              className={`v2-theme-option${theme === value ? ' is-active' : ''}`}
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              <span className="v2-theme-option__icon"><Icon size={20} /></span>
              <span className="v2-theme-option__copy">
                <strong>{label}</strong>
                <small>{value === 'light' ? 'Nền sáng' : value === 'dark' ? 'Nền tối' : 'Theo thiết bị'}</small>
              </span>
              <span className="v2-theme-option__check">{theme === value && <Check size={14} />}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="v2-profile-actions">
        <button type="button" onClick={() => setModal('giftcode')}>
          <span className="is-pink"><Gift size={23} /></span>
          <div><strong>Nhập Giftcode</strong><small>{giftPromo.isActive ? giftPromo.text : 'Nhận quà và Vcoin'}</small></div>
          <ChevronRight size={19} />
        </button>
        <button type="button" onClick={() => setModal('password')}>
          <span className="is-violet"><KeyRound size={23} /></span>
          <div><strong>Bảo mật tài khoản</strong><small>Đổi mật khẩu đăng nhập</small></div>
          <ChevronRight size={19} />
        </button>
        <button type="button" onClick={() => navigate('/guide')}>
          <span className="is-cyan"><WandSparkles size={23} /></span>
          <div><strong>Học viện sáng tạo</strong><small>Hướng dẫn dùng các công cụ AI</small></div>
          <ChevronRight size={19} />
        </button>
        <button type="button" onClick={() => navigate('/support')}>
          <span className="is-gold"><CircleHelp size={23} /></span>
          <div><strong>Trung tâm hỗ trợ</strong><small>Giải đáp và liên hệ đội ngũ</small></div>
          <ChevronRight size={19} />
        </button>
        {userRole === 'admin' && (
          <button type="button" className="is-admin" onClick={() => navigate('/admin')}>
            <span><ShieldCheck size={23} /></span>
            <div><strong>Command Center</strong><small>Mở trung tâm quản trị</small></div>
            <ChevronRight size={19} />
          </button>
        )}
      </section>

      <button type="button" className="v2-profile-logout" onClick={signOut}><LogOut size={19} /> Đăng xuất</button>

      {modal && (
        <div className="v2-profile-modal" role="dialog" aria-modal="true" aria-label={modal === 'password' ? 'Đổi mật khẩu' : 'Nhập Giftcode'}>
          <button type="button" onClick={() => setModal(null)} aria-label="Đóng"><X size={20} /></button>
          <span>{modal === 'password' ? <KeyRound size={25} /> : <Gift size={25} />}</span>
          <h2>{modal === 'password' ? 'Khóa bảo mật mới' : 'Mở hộp quà'}</h2>
          <p>{modal === 'password' ? 'Sử dụng ít nhất 6 ký tự và không chia sẻ mật khẩu.' : giftPromo.isActive ? giftPromo.text : 'Nhập mã Giftcode để nhận phần thưởng.'}</p>
          {modal === 'password' ? (
            <div>
              <label>Mật khẩu mới<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              <label>Nhập lại mật khẩu<input type="password" value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} /></label>
            </div>
          ) : (
            <label>Mã Giftcode<input value={giftcode} onChange={(event) => setGiftcode(event.target.value.toUpperCase())} placeholder="AUDITION2026" /></label>
          )}
          <button type="button" className="v2-profile-modal__submit" onClick={() => void (modal === 'password' ? changePassword() : redeem())} disabled={loading}>
            {loading ? <Loader className="v2-spin" size={18} /> : modal === 'password' ? <ShieldCheck size={18} /> : <Gift size={18} />}
            {modal === 'password' ? 'Cập nhật mật khẩu' : 'Nhận phần thưởng'}
          </button>
        </div>
      )}
    </div>
  );
}
