import React, { useEffect, useState } from 'react';
import { Transaction } from '../types';
import { Icons } from '../components/Icons';
import { updateLastActive } from '../services/economyService';

interface ManualPaymentGatewayProps {
  transaction: Transaction;
  onSuccess: () => void;
  onCancel: () => void;
}

export const ManualPaymentGateway: React.FC<ManualPaymentGatewayProps> = ({ transaction, onSuccess, onCancel }) => {
  const [isPaid, setIsPaid] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60);

  const BANK_INFO = {
      bankId: 'MB',
      accountNo: '0824280497',
      accountName: 'NGUYEN QUOC CUONG',
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

  const appliedGiftcode = String(transaction.topupGiftcode || '').trim().toUpperCase();
  const discountAmount = Number(transaction.discountAmount || 0);
  const originalAmount = Number(transaction.originalAmount || transaction.amount || 0);

  const handleConfirmPayment = async () => {
      setIsPaid(true);
      updateLastActive();
      setTimeout(() => {
          onSuccess();
      }, 2000);
  };

  const qrUrl = `https://img.vietqr.io/image/${BANK_INFO.bankId}-${BANK_INFO.accountNo}-${BANK_INFO.template}.png?amount=${transaction.amount || 0}&addInfo=${transaction.code}&accountName=${encodeURIComponent(BANK_INFO.accountName)}`;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center font-sans p-4 bg-black/70 backdrop-blur-md animate-fade-in overflow-y-auto">
        <div className="w-full max-w-4xl neu-raised-xl rounded-3xl overflow-hidden flex flex-col md:flex-row min-h-[580px] my-6">
            
            {/* Left Order Details */}
            <div className="w-full md:w-1/2 p-6 sm:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800">
                <div>
                    <div className="flex items-center gap-2 mb-6">
                        <div className="font-extrabold text-xl text-[#FF0099] flex items-center gap-2 font-accent">
                            SePay QR <span className="neu-inset-sm px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-500">TỰ ĐỘNG 24/7</span>
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div className="neu-inset-sm p-4 rounded-2xl space-y-2">
                            <div className="flex justify-between items-center text-xs text-slate-500">
                                <span>Đơn hàng hết hạn sau:</span>
                                <span className="font-mono text-base font-bold text-red-500">{formatTime(timeLeft)}</span>
                            </div>
                            <div className="h-px bg-slate-300 dark:bg-slate-700 my-1"></div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Mã giao dịch:</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-white text-sm">{transaction.code}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <span className="text-xs text-slate-500">Số tiền:</span>
                                <span className="font-black text-xl text-[#FF0099] font-accent">
                                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(transaction.amount || 0)}
                                </span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="space-y-1.5 pt-2 border-t border-slate-300 dark:border-slate-700">
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Giá niêm yết:</span>
                                        <span className="line-through">{new Intl.NumberFormat('vi-VN').format(originalAmount)}₫</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        <span>Đã giảm:</span>
                                        <span>-{new Intl.NumberFormat('vi-VN').format(discountAmount)}₫</span>
                                    </div>
                                </div>
                            )}
                            {appliedGiftcode && (
                                <div className="mt-2 neu-raised-sm p-2.5 rounded-xl flex items-center justify-between text-xs">
                                    <span className="font-bold text-amber-500">Mã giftcode:</span>
                                    <span className="font-mono font-bold text-emerald-500">{appliedGiftcode}</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Người thụ hưởng:</span>
                                <span className="font-bold uppercase text-slate-800 dark:text-white">{BANK_INFO.accountName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Ngân hàng:</span>
                                <span className="font-bold text-slate-800 dark:text-white">{BANK_INFO.bankId} BANK</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Số tài khoản:</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-white">{BANK_INFO.accountNo}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Nội dung CK:</span>
                                <span className="font-mono font-black text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">{transaction.code}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    onClick={onCancel}
                    className="mt-6 flex items-center gap-2 text-slate-400 hover:text-red-500 transition-colors text-xs font-bold w-fit"
                >
                    <Icons.ArrowUp className="w-4 h-4 -rotate-90" /> Hủy thanh toán và quay lại
                </button>
            </div>

            {/* Right QR Canvas */}
            <div className="w-full md:w-1/2 p-6 sm:p-8 flex flex-col items-center justify-center text-center">
                <div className="mb-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1 font-accent">Quét Mã QR Chuyển Khoản</h3>
                    <p className="text-xs text-slate-400">Sử dụng App Ngân hàng hoặc Ví điện tử bất kỳ</p>
                </div>

                <div className="neu-raised-xl p-4 rounded-3xl mb-6 relative">
                     {isPaid ? (
                         <div className="w-60 h-60 flex flex-col items-center justify-center neu-inset-sm rounded-2xl">
                             <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-3 animate-bounce shadow-lg">
                                 <Icons.Check className="w-8 h-8" />
                             </div>
                             <span className="font-bold text-emerald-500 text-sm">Đã ghi nhận thanh toán!</span>
                             <span className="text-[10px] text-slate-400 mt-1">Đang đối soát tự động...</span>
                         </div>
                     ) : (
                        <div className="relative">
                            <img src={qrUrl} alt="VietQR" className="w-60 h-60 object-contain rounded-xl" />
                        </div>
                     )}
                </div>

                {!isPaid && (
                    <div className="w-full max-w-xs space-y-3">
                        <button
                            onClick={handleConfirmPayment}
                            disabled={timeLeft <= 0}
                            className="w-full py-3.5 neu-button-primary rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg"
                        >
                            {timeLeft > 0 ? 'Tôi Đã Thanh Toán' : 'Đơn Hàng Đã Hết Hạn'}
                        </button>
                        <p className="text-[10px] text-slate-400">
                            Hệ thống sẽ tự động cộng Vcoin vào tài khoản sau 5-30 giây kể từ khi khớp lệnh ngân hàng.
                        </p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
