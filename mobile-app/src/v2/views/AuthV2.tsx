import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../components/NotificationSystem';
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '../../services/supabaseClient';
import { AuditionV2Logo } from '../components/AuditionV2Logo';

type AuthMode = 'login' | 'register';

export function AuthV2() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (mode === 'register' && !displayName.trim()) nextErrors.displayName = 'Nhập tên hiển thị của bạn.';
    if (!email.trim()) nextErrors.email = 'Nhập địa chỉ email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Email chưa đúng định dạng.';
    if (!password) nextErrors.password = 'Nhập mật khẩu.';
    else if (password.length < 6) nextErrors.password = 'Mật khẩu cần ít nhất 6 ký tự.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signInWithEmail(email, password);
        if (error) throw error;
        notify('Chào mừng bạn trở lại Creative Universe!', 'success');
      } else {
        const { data, error } = await signUpWithEmail(email, password, displayName.trim());
        if (error) throw error;
        if (data?.user?.identities?.length === 0) {
          setMode('login');
          notify('Email đã tồn tại, hãy đăng nhập.', 'warning');
          return;
        }
        notify('Tài khoản nhà sáng tạo đã sẵn sàng!', 'success');
      }
      navigate('/home');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể xác thực. Vui lòng thử lại.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const googleLogin = async () => {
    setIsLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể đăng nhập Google.', 'error');
      setIsLoading(false);
    }
  };

  return (
    <div className="v2-auth">
      <section className="v2-auth__showcase">
        <div className="v2-auth__logo"><AuditionV2Logo /></div>
        <div className="v2-auth__scene" aria-hidden="true">
          <span className="v2-auth__planet" />
          <span className="v2-auth__orbit v2-auth__orbit--one" />
          <span className="v2-auth__orbit v2-auth__orbit--two" />
          <Sparkles className="v2-auth__spark v2-auth__spark--one" />
          <Sparkles className="v2-auth__spark v2-auth__spark--two" />
        </div>
        <span className="v2-auth__badge"><Sparkles size={13} /> Mobile experience V2</span>
        <h1>Đăng nhập vào<br /><span>vũ trụ sáng tạo</span></h1>
        <p>Tạo nhân vật, hình ảnh và video AI trong một studio sống động dành riêng cho cộng đồng Audition.</p>
        <div className="v2-auth__metrics">
          <span><strong>4K</strong><small>AI Image</small></span>
          <span><strong>3D</strong><small>Character</small></span>
          <span><strong>24/7</strong><small>Creative</small></span>
        </div>
      </section>

      <section className="v2-auth__panel" aria-label={mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}>
        <div className="v2-auth__tabs" role="tablist">
          <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>Đăng nhập</button>
          <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => setMode('register')}>Tạo tài khoản</button>
        </div>

        <div className="v2-auth__intro">
          <span>{mode === 'login' ? 'Welcome back' : 'New creator'}</span>
          <h2>{mode === 'login' ? 'Tiếp tục hành trình' : 'Bắt đầu câu chuyện mới'}</h2>
        </div>

        <div className="v2-auth__fields">
          {mode === 'register' && (
            <label className={errors.displayName ? 'has-error' : ''}>
              <span>Tên hiển thị</span>
              <div><UserRound size={19} /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" /></div>
              {errors.displayName && <small>{errors.displayName}</small>}
            </label>
          )}
          <label className={errors.email ? 'has-error' : ''}>
            <span>Email</span>
            <div><Mail size={19} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" /></div>
            {errors.email && <small>{errors.email}</small>}
          </label>
          <label className={errors.password ? 'has-error' : ''}>
            <span>Mật khẩu</span>
            <div>
              <LockKeyhole size={19} />
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <small>{errors.password}</small>}
          </label>
        </div>

        <button type="button" className="v2-auth__submit v2-tap" onClick={() => void submit()} disabled={isLoading}>
          {isLoading ? <Loader className="v2-spin" size={20} /> : <Sparkles size={19} />}
          {mode === 'login' ? 'Khám phá ngay' : 'Tạo tài khoản'}
          {!isLoading && <ArrowRight size={19} />}
        </button>
        <div className="v2-auth__divider"><span>hoặc tiếp tục với</span></div>
        <button type="button" className="v2-auth__google v2-tap" onClick={() => void googleLogin()} disabled={isLoading}>
          <b>G</b> Google
        </button>
        <p className="v2-auth__terms">Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng và Chính sách bảo mật.</p>
      </section>
    </div>
  );
}
