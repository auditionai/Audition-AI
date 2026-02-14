
import React, { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { Icons } from '../components/Icons';
import { mockPayOSSuccess } from '../services/economyService';

interface PayOSGatewayProps {
  transaction: Transaction;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PayOSGateway: React.FC<PayOSGatewayProps> = ({ transaction, onSuccess, onCancel }) => {
  const [isPaid, setIsPaid] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60); // 15 minutes

  // Bank Info for Real QR Generation (VietQR)
  const BANK_INFO = {
      bankId: 'MB',
      accountNo: '0824280497', 
      accountName: 'DONG MINH PHU',
      template: 'compact' 
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) {
            clearInterval(timer);
            return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleConfirmPayment = async () => {
      // Simulate API check
      setIsPaid(true);
      // Even though user clicks "Paid", in this flow we keep it pending until Admin approves,
      // But we show a success message then redirect.
      // Or if we want auto-approve logic (mocked):
      // await mockPayOSSuccess(transaction.id); 
      setTimeout(() => {
          onSuccess();
      }, 2000);
  };

  const qrUrl = `https://img.vietqr.io/image/${BANK_INFO.bankId}-${BANK_INFO.accountNo}-${BANK_INFO.template}.png?amount=${transaction.amount}&addInfo=${transaction.code}&accountName=${encodeURIComponent(BANK_INFO.accountName)}`;

  return (
    <div className="fixed inset-0 z-[200] bg-[#f0f2f5] flex items-center justify-center font-sans text-slate-800 animate-fade-in overflow-y-auto">
        <div className="w-full max-w-5xl bg-white shadow-2xl rounded-xl overflow-hidden flex flex-col md:flex-row min-h-[600px] m-4">
            
            {/* LEFT: Order Info */}
            <div className="w-full md:w-1/2 p-8 md:p-12 bg-white flex flex-col relative border-r border-slate-100">
                <div className="flex items-center gap-2 mb-8">
                    <div className="font-bold text-2xl text-[#233dff] flex items-center gap-1">
                        payOS <span className="text-xs bg-[#233dff] text-white px-1 py-0.5 rounded ml-1">SECURE</span>
                    </div>
                </div>

                <div className="flex-1">
                    <div className="mb-6">
                        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider mb-1">Đơn hàng hết hạn sau</p>
                        <div className="text-3xl font-bold text-red-500 font-mono">{formatTime(timeLeft)}</div>
                    </div>

                    <div className="space-y-6">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-slate-500">Mã đơn hàng</span>
                                <span className="font-bold font-mono text-lg">{transaction.code}</span>
                            </div>
                            <div className="w-full h-px bg-slate-200 my-2"></div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-500">Số tiền</span>
                                <span className="font-bold text-2xl text-[#233dff]">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(transaction.amount)}</span>
                            </div>
                        </div>

                        <div className="space-y-4 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Người thụ hưởng</span>
                                <span className="font-bold uppercase">{BANK_INFO.accountName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Ngân hàng</span>
                                <span className="font-bold">{BANK_INFO.bankId} BANK</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Số tài khoản</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">{BANK_INFO.accountNo}</span>
                                    <Icons.Copy className="w-3 h-3 text-slate-400 cursor-pointer hover:text-[#233dff]" />
                                </div>
                            </div>
                            <div className="flex justify-between items-start">
                                <span className="text-slate-500">Nội dung CK</span>
                                <div className="flex items-center gap-2 bg-yellow-100 px-2 py-0.5 rounded border border-yellow-200">
                                    <span className="font-bold text-red-600">{transaction.code}</span>
                                    <Icons.Copy className="w-3 h-3 text-red-400 cursor-pointer hover:text-red-600" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <button 
                    onClick={onCancel}
                    className="mt-8 flex items-center gap-2 text-slate-400 hover:text-red-500 transition-colors text-sm font-medium w-fit"
                >
                    <Icons.ArrowUp className="w-4 h-4 -rotate-90" /> Hủy thanh toán & Quay lại
                </button>
            </div>

            {/* RIGHT: QR Scan */}
            <div className="w-full md:w-1/2 bg-[#f8faff] p-8 md:p-12 flex flex-col items-center justify-center relative">
                <div className="absolute top-0 right-0 p-4">
                    <img src="https://img.vietqr.io/image/MB-0824280497-compact.png" className="w-16 h-auto opacity-0" alt="Preload" />
                </div>

                <div className="text-center mb-8">
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Quét mã QR để thanh toán</h3>
                    <p className="text-sm text-slate-500">Sử dụng ứng dụng ngân hàng hoặc ví điện tử</p>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] mb-8 relative group">
                     {isPaid ? (
                         <div className="w-64 h-64 flex flex-col items-center justify-center bg-green-50 rounded-xl border-2 border-green-500">
                             <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white mb-4 animate-bounce">
                                 <Icons.Check className="w-8 h-8" />
                             </div>
                             <span className="font-bold text-green-600">Thanh toán thành công!</span>
                             <span className="text-xs text-green-500">Đang chuyển hướng...</span>
                         </div>
                     ) : (
                        <>
                            <img src={qrUrl} alt="VietQR" className="w-64 h-64 object-contain" />
                            <div className="absolute inset-0 border-2 border-[#233dff]/20 rounded-xl pointer-events-none"></div>
                            {/* Scanning Animation */}
                            <div className="absolute top-4 left-4 right-4 h-0.5 bg-red-500 shadow-[0_0_10px_red] animate-[scan_2s_linear_infinite]"></div>
                        </>
                     )}
                </div>

                {!isPaid && (
                    <div className="w-full max-w-xs space-y-3">
                        <button 
                            onClick={handleConfirmPayment}
                            className="w-full py-3 bg-[#233dff] hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                        >
                            Đã thanh toán
                        </button>
                        <p className="text-xs text-center text-slate-400">
                            Lưu ý: Nhập chính xác nội dung chuyển khoản <b className="text-slate-600">{transaction.code}</b> để đơn hàng được duyệt tự động.
                        </p>
                    </div>
                )}
            </div>

        </div>
    </div>
  );
};
