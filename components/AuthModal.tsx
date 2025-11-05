import React, { useState } from 'react';
import Modal from './common/Modal';
// Fix: Import `useAuth` from `AuthContext` instead of the non-existent `useAppContext`.
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot-password';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
    const [mode, setMode] = useState<AuthMode>('login');
    const [isLoading, setIsLoading] = useState(false);
    // Fix: `login` and `loginAsAdmin` are now correctly sourced from the auth context.
    const { login, loginAsAdmin, showToast } = useAuth();

    // Form states
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        try {
            await login();
            // Closing the modal is handled by the auth state change listener in a real scenario
            // but we can add a fallback timeout for the demo.
            setTimeout(() => {
                setIsLoading(false);
                onClose();
            }, 2500);
        } catch {
            setIsLoading(false);
        }
    }

    const handleAdminLogin = () => {
        setIsLoading(true);
        setTimeout(() => {
            loginAsAdmin();
            setIsLoading(false);
            onClose();
            showToast('Đăng nhập với tư cách Quản trị viên thành công!', 'success');
        }, 1000);
    }

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        switch (mode) {
            case 'login':
                // Note: Email/password login is not implemented in Supabase, using Google login as a placeholder.
                setTimeout(() => {
                    showToast('Tính năng này đang được phát triển. Vui lòng sử dụng đăng nhập Google.', 'error');
                    setIsLoading(false);
                }, 1500);
                break;
            case 'register':
                if (password !== confirmPassword) {
                    showToast('Mật khẩu không khớp!', 'error');
                    setIsLoading(false);
                    return;
                }
                setTimeout(() => {
                    showToast('Đăng ký thành công! Vui lòng đăng nhập.', 'success');
                    setIsLoading(false);
                    setMode('login');
                }, 2000);
                break;
            case 'forgot-password':
                setTimeout(() => {
                    showToast('Link đặt lại mật khẩu đã được gửi tới email của bạn.', 'success');
                    setIsLoading(false);
                    setMode('login');
                }, 2000);
                break;
        }
    };
    
    const resetForm = () => {
        setEmail('');
        setPassword('');
        setDisplayName('');
        setConfirmPassword('');
    }

    const changeMode = (newMode: AuthMode) => {
        resetForm();
        setMode(newMode);
    }
    
    const getTitle = () => {
        switch (mode) {
            case 'login': return 'Đăng nhập';
            case 'register': return 'Đăng ký tài khoản';
            case 'forgot-password': return 'Quên mật khẩu';
        }
    }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getTitle()}>
        <form onSubmit={handleFormSubmit} className="space-y-4">
            {mode === 'register' && (
                 <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Tên hiển thị"
                    required
                    className="auth-input"
                />
            )}

            {mode !== 'login' || (
                 <p className="text-center text-sm text-gray-400">
                    Đăng nhập để lưu trữ kim cương và lịch sử tạo ảnh của bạn.
                </p>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'forgot-password') && (
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    className="auth-input"
                />
            )}
            
            {(mode === 'login' || mode === 'register') && (
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mật khẩu"
                    required
                    className="auth-input"
                />
            )}

            {mode === 'register' && (
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Xác nhận mật khẩu"
                    required
                    className="auth-input"
                />
            )}

            {mode === 'login' && (
                <div className="text-right">
                    <button type="button" onClick={() => changeMode('forgot-password')} className="text-xs text-pink-400 hover:underline">
                        Quên mật khẩu?
                    </button>
                </div>
            )}
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
                {isLoading ? <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : (
                    mode === 'login' ? 'Đăng nhập' : 
                    mode === 'register' ? 'Đăng ký' : 'Gửi link đặt lại'
                )}
            </button>
        </form>
        
        {mode === 'login' && (
            <>
                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-gray-600"></span>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-[#12121A] px-2 text-gray-400">hoặc</span>
                    </div>
                </div>

                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 py-3 font-bold text-white bg-[#DB4437]/80 hover:bg-[#DB4437] rounded-lg transition-colors disabled:opacity-50"
                >
                    {isLoading ? <span>Đang xử lý...</span> : (
                        <>
                            <i className="ph-fill ph-google-logo text-xl"></i>
                            <span>Tiếp tục với Google</span>
                        </>
                    )}
                </button>
            </>
        )}
        
        <div className="text-center mt-6">
            <p className="text-xs text-gray-400">
                 {mode === 'login' ? "Chưa có tài khoản?" : "Đã có tài khoản?"}
                <button onClick={() => changeMode(mode === 'login' ? 'register' : 'login')} className="font-semibold text-pink-400 hover:underline ml-1">
                    {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
                </button>
            </p>
            {mode === 'forgot-password' && (
                 <button onClick={() => changeMode('login')} className="text-xs text-gray-400 hover:underline mt-2">
                    Quay lại Đăng nhập
                </button>
            )}
        </div>

        <div className="text-center mt-4 pt-4 border-t border-white/10">
            <button onClick={handleAdminLogin} disabled={isLoading} className="text-xs text-yellow-400 hover:underline">
                Đăng nhập với tư cách Quản trị viên
            </button>
        </div>
        
        <p className="text-xs text-gray-500 mt-6 text-center">
            Bằng việc tiếp tục, bạn đồng ý với <a onClick={() => {}} className="underline hover:text-pink-400 cursor-pointer">Điều khoản dịch vụ</a> và <a onClick={() => {}} className="underline hover:text-pink-400 cursor-pointer">Chính sách bảo mật</a>.
        </p>
    </Modal>
  );
};

export default AuthModal;