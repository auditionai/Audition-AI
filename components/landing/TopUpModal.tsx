import React, { useState } from 'react';
import Modal from '../common/Modal';
import { useAuth } from '../../contexts/AuthContext';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Fix: Add the onTopUpSuccess prop to resolve type errors in parent components.
  // It's marked as optional because the component's demo logic doesn't call it.
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
        // In a real app, you'd poll a backend here.
        // For the demo, we'll just show the message and let the user close.
        // We won't auto-close or grant diamonds to simulate the waiting period.
    }
    
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nạp Kim Cương">
        <div className="mb-6 border-b border-gray-700">
            <nav className="flex space-x-4" aria-label="Tabs">
                <button onClick={() => setActiveTab('qr')} className={`px-3 py-2 font-medium text-sm rounded-t-lg ${activeTab === 'qr' ? 'border-b-2 border-pink-500 text-pink-400' : 'text-gray-400 hover:text-white'}`}>Quét mã QR</button>
                <button onClick={() => setActiveTab('bank')} className={`px-3 py-2 font-medium text-sm rounded-t-lg ${activeTab === 'bank' ? 'border-b-2 border-pink-500 text-pink-400' : 'text-gray-400 hover:text-white'}`}>Chuyển khoản</button>
            </nav>
        </div>

        {activeTab === 'qr' && (
            <div className="text-center">
                <p className="text-gray-400 mb-4">Quét mã QR để thanh toán và ghi rõ nội dung bên dưới.</p>
                <div className="bg-white p-2 rounded-lg inline-block">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=audition-ai-payment" alt="QR Code" className="w-48 h-48 mx-auto"/>
                </div>
                <p className="mt-4 text-lg font-semibold">Nội dung: <span className="text-pink-400">{paymentCode}</span></p>
            </div>
        )}

        {activeTab === 'bank' && (
            <div className="space-y-3 text-sm">
                <p className="text-gray-400">Chuyển khoản đến thông tin sau:</p>
                <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-gray-500">Ngân hàng</p>
                    <p className="font-semibold text-white">TECHCOMBANK</p>
                </div>
                 <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-gray-500">Số tài khoản</p>
                    <p className="font-semibold text-white">1903 XXXX XXXX</p>
                </div>
                 <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-gray-500">Chủ tài khoản</p>
                    <p className="font-semibold text-white">AUDITION AI</p>
                </div>
                 <div className="bg-white/5 p-3 rounded-lg">
                    <p className="text-gray-500">Nội dung chuyển khoản</p>
                    <p className="font-semibold text-pink-400">{paymentCode}</p>
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
                className="w-full py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed">
                {isProcessing ? 'Đang chờ xác nhận...' : 'Tôi đã chuyển'}
            </button>
        </div>
    </Modal>
  );
};

export default TopUpModal;