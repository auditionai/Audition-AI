import React, { useState } from 'react';
import Modal from '../common/Modal';
import { useAuth } from '../../contexts/AuthContext';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTopUpSuccess?: (amount: number) => void;
}

type TopUpTab = 'qr' | 'bank';

const TopUpModal: React.FC<TopUpModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TopUpTab>('qr');
    const [isProcessing, setIsProcessing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const paymentCode = user ? `NAP AUAI ${user.email.split('@')[0]}` : 'Vui lòng đăng nhập';

    const handleConfirmTransfer = () => {
        setIsProcessing(true);
        setMessage("Hệ thống đang xác nhận, vui lòng chờ 5-10 phút...");
    }
    
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nạp Kim Cương">
        <div className="mb-6 border-b border-skin-border">
            <nav className="flex space-x-4" aria-label="Tabs">
                <button onClick={() => setActiveTab('qr')} className={`px-3 py-2 font-medium text-sm rounded-t-lg ${activeTab === 'qr' ? 'border-b-2 border-skin-border-accent text-skin-accent' : 'text-skin-muted hover:text-skin-base'}`}>Quét mã QR</button>
                <button onClick={() => setActiveTab('bank')} className={`px-3 py-2 font-medium text-sm rounded-t-lg ${activeTab === 'bank' ? 'border-b-2 border-skin-border-accent text-skin-accent' : 'text-skin-muted hover:text-skin-base'}`}>Chuyển khoản</button>
            </nav>
        </div>

        {activeTab === 'qr' && (
            <div className="text-center">
                <p className="text-skin-muted mb-4">Quét mã QR để thanh toán và ghi rõ nội dung bên dưới.</p>
                <div className="bg-white p-2 rounded-lg inline-block">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=audition-ai-payment" alt="QR Code" className="w-48 h-48 mx-auto"/>
                </div>
                <p className="mt-4 text-lg font-semibold">Nội dung: <span className="text-skin-accent">{paymentCode}</span></p>
            </div>
        )}

        {activeTab === 'bank' && (
            <div className="space-y-3 text-sm">
                <p className="text-skin-muted">Chuyển khoản đến thông tin sau:</p>
                <div className="bg-skin-fill-secondary p-3 rounded-lg">
                    <p className="text-skin-muted">Ngân hàng</p>
                    <p className="font-semibold text-skin-base">TECHCOMBANK</p>
                </div>
                 <div className="bg-skin-fill-secondary p-3 rounded-lg">
                    <p className="text-skin-muted">Số tài khoản</p>
                    <p className="font-semibold text-skin-base">1903 XXXX XXXX</p>
                </div>
                 <div className="bg-skin-fill-secondary p-3 rounded-lg">
                    <p className="text-skin-muted">Chủ tài khoản</p>
                    <p className="font-semibold text-skin-base">AUDITION AI</p>
                </div>
                 <div className="bg-skin-fill-secondary p-3 rounded-lg">
                    <p className="text-skin-muted">Nội dung chuyển khoản</p>
                    <p className="font-semibold text-skin-accent">{paymentCode}</p>
                </div>
            </div>
        )}

        <div className="mt-8">
             {message && (
                <div className="p-3 rounded-lg mb-4 text-sm text-center bg-blue-500/20 text-blue-300">
                  {message}
                </div>
            )}
            <button 
                onClick={handleConfirmTransfer}
                disabled={isProcessing}
                className="w-full py-3 font-bold themed-button-primary disabled:opacity-50 disabled:cursor-not-allowed">
                {isProcessing ? 'Đang chờ xác nhận...' : 'Tôi đã chuyển'}
            </button>
        </div>
    </Modal>
  );
};

export default TopUpModal;