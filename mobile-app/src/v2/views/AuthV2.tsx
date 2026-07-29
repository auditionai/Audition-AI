import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../components/NotificationSystem';
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '../../services/supabaseClient';
import { AuditionV2Logo } from '../components/AuditionV2Logo';

type AuthMode = 'login' | 'register';

function GoogleMark() {
  return (
    <svg className="v2-auth__google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.74-.07-1.45-.19-2.14H12v4.05h5.38a4.6 4.6 0 0 1-2 3.02v2.63h3.24c1.9-1.75 2.98-4.33 2.98-7.56Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.63c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.72A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.77A6.02 6.02 0 0 1 6.08 12c0-.61.1-1.21.31-1.77V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.49l3.35-2.72Z" />
      <path fill="#EA4335" d="M12 6.1c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.72C7.18 7.86 9.39 6.1 12 6.1Z" />
    </svg>
  );
}

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
      <div className="v2-auth__card">
        <section className="v2-auth__showcase">
          <div className="v2-auth__scene" aria-hidden="true" />
          <div className="v2-auth__logo"><AuditionV2Logo /></div>
          <span className="v2-auth__badge"><Sparkles size={13} /> Creative access</span>
          <h1>Chạm vào<br /><span>thế giới Audition</span></h1>
          <p>Đăng nhập để tiếp tục tạo nhân vật, hình ảnh và video AI mang phong cách riêng của bạn.</p>
          <div className="v2-auth__metrics">
            <span><strong>4K</strong><small>Hình ảnh</small></span>
            <span><strong>3D</strong><small>Nhân vật</small></span>
            <span><strong>AI</strong><small>Sáng tạo</small></span>
          </div>
        </section>

        <section className="v2-auth__panel" aria-label={mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}>
          <div className="v2-auth__tabs" role="tablist" aria-label="Chọn hình thức xác thực">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>Đăng nhập</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-active' : ''} onClick={() => setMode('register')}>Tạo tài khoản</button>
          </div>

          <div className="v2-auth__intro">
            <span>{mode === 'login' ? 'Chào mừng trở lại' : 'Nhà sáng tạo mới'}</span>
            <h2>{mode === 'login' ? 'Đăng nhập tài khoản' : 'Tạo hồ sơ sáng tạo'}</h2>
            <p>{mode === 'login' ? 'Nhập thông tin của bạn để mở lại studio.' : 'Chỉ mất một phút để bắt đầu hành trình.'}</p>
          </div>

          <div className="v2-auth__fields">
            {mode === 'register' && (
              <label className={errors.displayName ? 'has-error' : ''}>
                <span>Tên hiển thị</span>
                <div><UserRound size={19} /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="Tên bạn muốn hiển thị" /></div>
                {errors.displayName && <small>{errors.displayName}</small>}
              </label>
            )}
            <label className={errors.email ? 'has-error' : ''}>
              <span>Email</span>
              <div><Mail size={19} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" placeholder="name@example.com" /></div>
              {errors.email && <small>{errors.email}</small>}
            </label>
            <label className={errors.password ? 'has-error' : ''}>
              <span>Mật khẩu</span>
              <div>
                <LockKeyhole size={19} />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Tối thiểu 6 ký tự" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <small>{errors.password}</small>}
            </label>
          </div>

          <button type="button" className="v2-auth__submit v2-tap" onClick={() => void submit()} disabled={isLoading}>
            <span className="v2-auth__submit-icon">{isLoading ? <Loader className="v2-spin" size={19} /> : <LockKeyhole size={19} />}</span>
            <span>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</span>
            {!isLoading && <ArrowRight size={19} />}
          </button>
          <div className="v2-auth__divider"><span>Hoặc</span></div>
          <button type="button" className="v2-auth__google v2-tap" onClick={() => void googleLogin()} disabled={isLoading}>
            <GoogleMark />
            <span>Đăng nhập bằng Google</span>
          </button>
          <p className="v2-auth__terms">Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng và Chính sách bảo mật.</p>
        </section>
      </div>
    </div>
  );
}
