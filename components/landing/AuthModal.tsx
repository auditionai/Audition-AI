import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const { t } = useTranslation();

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        const success = await login();
        if (!success) {
            // If the login prompt failed to start (e.g., missing client_id),
            // reset the loading state so the user isn't stuck.
            setIsLoading(false);
        }
        // If login() was successful, isLoading remains true, and we wait for the
        // Google callback and Supabase auth state change to navigate away or close the modal.
    }
    
    // Reset loading state when modal is closed
    useEffect(() => {
        if (!isOpen) {
            setIsLoading(false);
        }
    }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('modals.auth.title')}>
        <div className="text-center space-y-6 py-4">
            <p className="text-gray-400">
                {t('modals.auth.description')}
            </p>
            
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 font-bold text-white bg-[#DB4437]/80 hover:bg-[#DB4437] rounded-lg transition-colors disabled:opacity-50"
            >
                {isLoading ? (
                    <>
                        <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                        <span>{t('modals.auth.processing')}</span>
                    </>
                ) : (
                    <>
                        <i className="ph-fill ph-google-logo text-xl"></i>
                        <span>{t('modals.auth.button')}</span>
                    </>
                )}
            </button>
            
            <p className="text-xs text-gray-500 mt-6 text-center">
                {t('modals.auth.legal')} <a onClick={() => {}} className="underline hover:text-pink-400 cursor-pointer">{t('modals.auth.terms')}</a> {t('langName') === 'English' ? 'and' : 'và'} <a onClick={() => {}} className="underline hover:text-pink-400 cursor-pointer">{t('modals.auth.policy')}</a>.
            </p>
        </div>
    </Modal>
  );
};

export default AuthModal;
