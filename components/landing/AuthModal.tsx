
import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

type AuthMode = 'login' | 'register' | 'forgot';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login' }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { login, loginWithEmail, registerWithEmail, resetPassword, showToast } = useAuth();
    const { t } = useTranslation();
    
    const [mode, setMode] = useState<AuthMode>(initialMode);
    const [showGoogleReferral, setShowGoogleReferral] = useState(false);

    // Form States
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [referralCode, setReferralCode] = useState(''); 

    // Reset loading state and form when modal is closed or mode changes
    useEffect(() => {
        if (!isOpen) {
            setIsLoading(false);
            setShowGoogleReferral(false); // Reset google referral step
            resetForm();
        } else {
            // When opening, respect the requested initial mode
            setMode(initialMode);
        }
    }, [isOpen, initialMode]);

    const resetForm = () => {
        setDisplayName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setReferralCode('');
    }

    // Step 1: User clicks "Continue with Google" -> Show Referral Input
    const handlePreGoogleLogin = () => {
        setShowGoogleReferral(true);
    };

    // Step 2a: User enters code and clicks Continue -> Save code & Login
    const handleGoogleContinue = async () => {
        if (referralCode.trim()) {
            localStorage.setItem('pendingReferralCode', referralCode.trim());
        }
        await performGoogleLogin();
    };

    // Step 2b: User clicks Skip -> Just Login
    const handleGoogleSkip = async () => {
        localStorage.removeItem('pendingReferralCode'); // Ensure no old code lingers
        await performGoogleLogin();
    };

    // Common Google Login Execution
    const performGoogleLogin = async () => {
        setIsLoading(true);
        const success = await login();
        if (!success) {
            setIsLoading(false);
        }
        // Note: If success, the AuthContext usually redirects, so we don't strictly need to close modal here,
        // but the auth state change listener in App.tsx will handle navigation.
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        
        try {
            if (mode === 'login') {
                if (!email || !password) {
                    showToast(t('modals.auth.errors.fillAll'), 'error');
                    setIsLoading(false);
                    return;
                }
                const success = await loginWithEmail(email, password);
                if (success) onClose();
            } 
            else if (mode === 'register') {
                if (!email || !password || !displayName || !confirmPassword) {
                    showToast(t('modals.auth.errors.fillAll'), 'error');
                    setIsLoading(false);
                    return;
                }
                if (password !== confirmPassword) {
                    showToast(t('modals.auth.errors.passwordMismatch'), 'error');
                    setIsLoading(false);
                    return;
                }
                if (password.length < 6) {
                    showToast(t('modals.auth.errors.passwordLength'), 'error');
                    setIsLoading(false);
                    return;
                }

                const success = await registerWithEmail(email, password, displayName);
                if (success) {
                    // If referral code is provided, process it after successful registration
                    if (referralCode.trim()) {
                        localStorage.setItem('pendingReferralCode', referralCode.trim());
                    }
                    onClose();
                }
            }
            else if (mode === 'forgot') {
                 if (!email) {
                    showToast(t('modals.auth.form.recoverEmail'), 'error');
                    setIsLoading(false);
                    return;
                }
                const success = await resetPassword(email);
                if (success) {
                    showToast(t('modals.auth.form.resetSuccess'), 'success');
                    setMode('login');
                }
            }
        } finally {
            setIsLoading(false);
        }
    };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={showGoogleReferral ? t('creator.settings.referral.title') : t('modals.auth.title')}>
        <div className="py-2">
            
            {/* --- GOOGLE REFERRAL FLOW --- */}
            {showGoogleReferral ? (
                <div className="animate-fade-in">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/30">
                            <i className="ph-fill ph-gift text-3xl text-white animate-bounce"></i>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1">Bạn có mã giới thiệu không?</h3>
                        <p className="text-sm text-gray-400">Nhập mã từ bạn bè để nhận ngay <span className="text-yellow-400 font-bold">5 Kim Cương</span> khởi nghiệp!</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-skin-muted uppercase mb-1">{t('modals.auth.form.referralCode')}</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-skin-muted"><i className="ph-fill ph-ticket"></i></span>
                                <input 
                                    type="text" 
                                    value={referralCode}
                                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                                    className="w-full pl-9 p-3 bg-skin-fill-secondary rounded-lg border border-skin-border focus:border-skin-accent focus:ring-1 focus:ring-skin-accent transition text-skin-base font-mono text-center tracking-widest text-lg"
                                    placeholder="XXXXXXXX"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleGoogleContinue}
                            disabled={isLoading || !referralCode.trim()}
                            className="themed-button-primary w-full py-3 flex justify-center items-center gap-2 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                             {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <i className="ph-fill ph-check-circle"></i> Xác nhận & Đăng nhập
                                </>
                            )}
                        </button>

                        <button
                            onClick={handleGoogleSkip}
                            disabled={isLoading}
                            className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors font-semibold"
                        >
                            Bỏ qua bước này
                        </button>
                    </div>
                </div>
            ) : (
                /* --- STANDARD AUTH FLOW --- */
                <>
                    {/* Tabs */}
                    {mode !== 'forgot' && (
                        <div className="flex mb-6 border-b border-skin-border">
                            <button 
                                onClick={() => { setMode('login'); resetForm(); }}
                                className={`flex-1 pb-3 font-semibold text-sm transition-colors ${mode === 'login' ? 'text-skin-accent border-b-2 border-skin-accent' : 'text-skin-muted hover:text-skin-base'}`}
                            >
                                {t('modals.auth.tabs.login')}
                            </button>
                            <button 
                                onClick={() => { setMode('register'); resetForm(); }}
                                className={`flex-1 pb-3 font-semibold text-sm transition-colors ${mode === 'register' ? 'text-skin-accent border-b-2 border-skin-accent' : 'text-skin-muted hover:text-skin-base'}`}
                            >
                                {t('modals.auth.tabs.register')}
                            </button>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'register' && (
                            <div>
                                <label className="block text-xs font-bold text-skin-muted uppercase mb-1">{t('modals.auth.form.name')}</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-skin-muted"><i className="ph-fill ph-user"></i></span>
                                    <input 
                                        type="text" 
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        className="w-full pl-9 p-3 bg-skin-fill-secondary rounded-lg border border-skin-border focus:border-skin-accent focus:ring-1 focus:ring-skin-accent transition text-skin-base"
                                        placeholder={t('modals.auth.form.name')}
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-skin-muted uppercase mb-1">{t('modals.auth.form.email')}</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-skin-muted"><i className="ph-fill ph-envelope"></i></span>
                                <input 
                                    type="email" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-9 p-3 bg-skin-fill-secondary rounded-lg border border-skin-border focus:border-skin-accent focus:ring-1 focus:ring-skin-accent transition text-skin-base"
                                    placeholder="name@example.com"
                                />
                            </div>
                        </div>

                        {mode !== 'forgot' && (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-skin-muted uppercase mb-1">{t('modals.auth.form.password')}</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-skin-muted"><i className="ph-fill ph-lock"></i></span>
                                        <input 
                                            type="password" 
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-9 p-3 bg-skin-fill-secondary rounded-lg border border-skin-border focus:border-skin-accent focus:ring-1 focus:ring-skin-accent transition text-skin-base"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>

                                {mode === 'register' && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-skin-muted uppercase mb-1">{t('modals.auth.form.confirmPassword')}</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-skin-muted"><i className="ph-fill ph-lock-key"></i></span>
                                                <input 
                                                    type="password" 
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    className="w-full pl-9 p-3 bg-skin-fill-secondary rounded-lg border border-skin-border focus:border-skin-accent focus:ring-1 focus:ring-skin-accent transition text-skin-base"
                                                    placeholder="••••••••"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-skin-muted uppercase mb-1">{t('modals.auth.form.referralCode')}</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-skin-muted"><i className="ph-fill ph-users"></i></span>
                                                <input 
                                                    type="text" 
                                                    value={referralCode}
                                                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                                                    className="w-full pl-9 p-3 bg-skin-fill-secondary rounded-lg border border-skin-border focus:border-skin-accent focus:ring-1 focus:ring-skin-accent transition text-skin-base"
                                                    placeholder="VD: X8J9K2L1"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {mode === 'login' && (
                                    <div className="text-right">
                                        <button 
                                            type="button"
                                            onClick={() => setMode('forgot')}
                                            className="text-xs text-skin-accent hover:text-white transition"
                                        >
                                            {t('modals.auth.form.forgotPassword')}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="themed-button-primary w-full py-3 flex justify-center items-center gap-2"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                mode === 'login' ? t('modals.auth.form.submitLogin') : 
                                mode === 'register' ? t('modals.auth.form.submitRegister') : 
                                t('modals.auth.form.sendLink')
                            )}
                        </button>
                    </form>

                    {mode === 'forgot' && (
                        <button 
                            type="button"
                            onClick={() => setMode('login')}
                            className="w-full mt-3 py-2 text-sm text-skin-muted hover:text-white transition"
                        >
                            {t('modals.auth.form.backToLogin')}
                        </button>
                    )}

                    {mode !== 'forgot' && (
                        <>
                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-skin-border"></div></div>
                                <div className="relative flex justify-center text-xs uppercase"><span className="bg-skin-fill-modal px-2 text-skin-muted">{t('modals.auth.form.or')}</span></div>
                            </div>
                            
                            <button
                            type="button"
                            onClick={handlePreGoogleLogin}
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-3 py-3 font-bold text-white bg-[#DB4437] hover:bg-[#C53929] rounded-lg transition-colors disabled:opacity-50"
                            >
                                <i className="ph-fill ph-google-logo text-xl"></i>
                                <span>{t('modals.auth.button')}</span>
                            </button>
                        </>
                    )}
                    
                    <p className="text-xs text-skin-muted mt-6 text-center">
                        {t('modals.auth.legal')} <a onClick={() => {}} className="underline hover:text-skin-accent cursor-pointer">{t('modals.auth.terms')}</a> {t('langName') === 'English' ? 'and' : 'và'} <a onClick={() => {}} className="underline hover:text-skin-accent cursor-pointer">{t('modals.auth.policy')}</a>.
                    </p>
                </>
            )}
        </div>
    </Modal>
  );
};

export default AuthModal;
