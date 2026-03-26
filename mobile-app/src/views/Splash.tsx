import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader, Lock, Mail, User } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useNotification } from '../components/NotificationSystem';
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '../services/supabaseClient';

type AuthMode = 'login' | 'register';

export function Splash() {
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; displayName?: string }>({});

  const validate = () => {
    const nextErrors: typeof errors = {};

    if (mode === 'register' && !displayName.trim()) {
      nextErrors.displayName = 'Vui lòng nhập tên người dùng.';
    }

    if (!email.trim()) {
      nextErrors.email = 'Vui lòng nhập email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = 'Email không hợp lệ.';
    }

    if (!password) {
      nextErrors.password = 'Vui lòng nhập mật khẩu.';
    } else if (password.length < 6) {
      nextErrors.password = 'Mật khẩu tối thiểu 6 ký tự.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleEmailAuth = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          if (error.message?.includes('Invalid login credentials')) {
            notify('Email hoặc mật khẩu không đúng.', 'error');
          } else {
            notify(error.message || 'Đăng nhập thất bại.', 'error');
          }
          return;
        }

        notify('Đăng nhập thành công!', 'success');
        navigate('/home');
        return;
      }

      const { data, error } = await signUpWithEmail(email, password, displayName.trim());
      if (error) {
        if (error.message?.includes('already registered')) {
          notify('Email này đã được đăng ký.', 'error');
        } else {
          notify(error.message || 'Đăng ký thất bại.', 'error');
        }
        return;
      }

      if (data?.user?.identities?.length === 0) {
        notify('Email này đã tồn tại. Vui lòng đăng nhập.', 'warning');
        setMode('login');
        return;
      }

      notify('Đăng ký thành công! Đang chuyển vào ứng dụng...', 'success');
      navigate('/home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
      notify(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        notify(error.message || 'Đăng nhập Google thất bại.', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Có lỗi xảy ra.';
      notify(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mobile-ui-theme min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#09090B] xl:min-h-full">
      <div className="flex-1 flex flex-col justify-center items-center px-6 pt-16 pb-8">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#111] to-[#444] shadow-2xl flex items-center justify-center mb-6 animate-fade-in">
          <span className="text-white text-4xl font-bold tracking-tighter">A</span>
        </div>

        <div className="text-center mb-8 animate-fade-in" style={{ animationDelay: '0.08s' }}>
          <h1 className="text-3xl font-bold tracking-tight mb-2 text-gray-900 dark:text-white">Audition AI</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed max-w-[280px]">
            Khơi nguồn sáng tạo không giới hạn với trí tuệ nhân tạo.
          </p>
        </div>

        <div className="w-full max-w-sm space-y-4 animate-fade-in" style={{ animationDelay: '0.16s' }}>
          {mode === 'register' && (
            <div>
              <div className={`flex items-center gap-3 bg-white dark:bg-[#18181B] rounded-2xl px-4 py-3.5 border transition-colors ${errors.displayName ? 'border-red-500/50' : 'border-gray-100 dark:border-zinc-800 focus-within:border-[var(--color-muted)]'}`}>
                <User className="w-5 h-5 text-gray-500 dark:text-zinc-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Tên người dùng"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setErrors((prev) => ({ ...prev, displayName: undefined }));
                  }}
                  className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-zinc-400"
                  disabled={isLoading}
                />
              </div>
              {errors.displayName && <p className="text-xs text-red-500 mt-1 ml-4">{errors.displayName}</p>}
            </div>
          )}

          <div>
            <div className={`flex items-center gap-3 bg-white dark:bg-[#18181B] rounded-2xl px-4 py-3.5 border transition-colors ${errors.email ? 'border-red-500/50' : 'border-gray-100 dark:border-zinc-800 focus-within:border-[var(--color-muted)]'}`}>
              <Mail className="w-5 h-5 text-gray-500 dark:text-zinc-400 shrink-0" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-zinc-400"
                disabled={isLoading}
              />
            </div>
            {errors.email && <p className="text-xs text-red-500 mt-1 ml-4">{errors.email}</p>}
          </div>

          <div>
            <div className={`flex items-center gap-3 bg-white dark:bg-[#18181B] rounded-2xl px-4 py-3.5 border transition-colors ${errors.password ? 'border-red-500/50' : 'border-gray-100 dark:border-zinc-800 focus-within:border-[var(--color-muted)]'}`}>
              <Lock className="w-5 h-5 text-gray-500 dark:text-zinc-400 shrink-0" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mật khẩu"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-zinc-400"
                disabled={isLoading}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleEmailAuth();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1 ml-4">{errors.password}</p>}
          </div>

          <Button size="lg" className="w-full shadow-xl" onClick={() => void handleEmailAuth()} disabled={isLoading}>
            {isLoading ? <Loader className="w-5 h-5 animate-spin mx-auto" /> : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </Button>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-[var(--color-border)]" />
            <span className="text-xs text-gray-500 dark:text-zinc-400">hoặc</span>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
          </div>

          <button
            onClick={() => void handleGoogleAuth()}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-[#18181B] hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-2xl py-3.5 text-sm font-medium text-gray-900 dark:text-white transition-colors border border-gray-100 dark:border-zinc-800 shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09A6.96 6.96 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A10.94 10.94 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Tiếp tục với Google
          </button>

          <p className="text-center text-sm text-gray-500 dark:text-zinc-400">
            {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
            <button
              onClick={() => {
                setMode((prev) => (prev === 'login' ? 'register' : 'login'));
                setErrors({});
              }}
              className="ml-1 font-semibold text-gray-900 dark:text-white hover:underline"
              disabled={isLoading}
            >
              {mode === 'login' ? 'Đăng ký' : 'Đăng nhập'}
            </button>
          </p>
        </div>
      </div>

      <div className="pb-8 px-6">
        <p className="text-center text-xs text-gray-500 dark:text-zinc-400">
          Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng của Audition AI.
        </p>
      </div>
    </div>
  );
}
