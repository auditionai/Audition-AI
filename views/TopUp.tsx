
import React, { useState, useEffect } from 'react';
import { Language, Transaction, CreditPackage } from '../types';
import { Icons } from '../components/Icons';
import { getPackages, createPaymentLink, mockPayOSSuccess, getPromotionConfig } from '../services/economyService';

interface TopUpProps {
  lang: Language;
}

export const TopUp: React.FC<TopUpProps> = ({ lang }) => {
  const [activeTab, setActiveTab] = useState<'packages' | 'history'>('packages');
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [promo, setPromo] = useState({ isActive: false, bonusPercent: 0 });

  // Timer for Flash Sale
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });

  // Bank Info for Real QR Generation (VietQR)
  const BANK_INFO = {
      bankId: 'MB', // MB Bank, TCB, VCB...
      accountNo: '0824280497', 
      accountName: 'DONG MINH PHU',
      template: 'compact' 
  };

  useEffect(() => {
    // Load Packages & Promo
    const loadData = async () => {
        const pkgs = await getPackages();
        setPackages(pkgs);
        const p = await getPromotionConfig();
        setPromo({ isActive: p.isActive, bonusPercent: p.bonusPercent });
    };
    loadData();

    // Mock countdown
    const target = new Date();
    target.setHours(target.getHours() + 5); 
    const interval = setInterval(() => {
        const now = new Date();
        const diff = target.getTime() - now.getTime();
        if (diff <= 0) return;
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ h, m, s });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load History
  useEffect(() => {
      if (activeTab === 'history') {
          const txs = JSON.parse(localStorage.getItem('dmp_transactions') || '[]');
          setHistory(txs.reverse());
      }
  }, [activeTab]);

  const handlePayment = async () => {
      if (!selectedPkg) return;
      setLoading(true);
      try {
          const tx = await createPaymentLink(selectedPkg);
          setTransaction(tx);
          
          // Simulation: Auto-check status after 15s (In real app, use WebSocket or Polling)
          setTimeout(async () => {
              const success = await mockPayOSSuccess(tx.id);
              if (success) {
                  // Alert logic or Toast here
              }
          }, 15000); 
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      alert(lang === 'vi' ? 'Đã sao chép!' : 'Copied!');
  };

  return (
    <div className="pb-24 animate-fade-in max-w-5xl mx-auto">
        
        {/* Tabs */}
        <div className="flex justify-center mb-8">
            <div className="bg-[#12121a] p-1.5 rounded-2xl border border-white/10 flex gap-1 shadow-lg">
                <button 
                    onClick={() => setActiveTab('packages')}
                    className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'packages' ? 'bg-white text-black' : 'text-slate-500 hover:text-white'}`}
                >
                    {lang === 'vi' ? 'Nạp Vcoin' : 'Top Up'}
                </button>
                <button 
                     onClick={() => setActiveTab('history')}
                     className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-black' : 'text-slate-500 hover:text-white'}`}
                >
                    {lang === 'vi' ? 'Lịch sử giao dịch' : 'History'}
                </button>
            </div>
        </div>

        {activeTab === 'history' ? (
            <div className="glass-panel p-6 rounded-3xl min-h-[400px]">
                <h2 className="text-xl font-bold text-white mb-6">Transaction Logs</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="text-xs uppercase bg-white/5 text-slate-300">
                            <tr>
                                <th className="px-4 py-3">Time</th>
                                <th className="px-4 py-3">Code</th>
                                <th className="px-4 py-3">Amount</th>
                                <th className="px-4 py-3">Coins</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {history.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8">No transactions found</td></tr>
                            ) : history.map(tx => (
                                <tr key={tx.id} className="hover:bg-white/5">
                                    <td className="px-4 py-3">{new Date(tx.createdAt).toLocaleString()}</td>
                                    <td className="px-4 py-3 font-mono text-white">{tx.code}</td>
                                    <td className="px-4 py-3 text-white">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}</td>
                                    <td className="px-4 py-3 text-audi-yellow font-bold">+{tx.coins}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                            tx.status === 'paid' ? 'bg-green-500/20 text-green-500' : 
                                            tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-500'
                                        }`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        ) : (
            <>
                {/* Header Banner (Active only if Global Promotion is ON) */}
                {promo.isActive && (
                    <div className="relative rounded-3xl overflow-hidden mb-8 border border-audi-pink/30 shadow-[0_0_30px_rgba(255,0,153,0.2)]">
                        <div className="absolute inset-0 bg-gradient-to-r from-audi-purple/80 to-audi-pink/80 z-0"></div>
                        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] z-0"></div>
                        
                        <div className="relative z-10 p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div>
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/30 border border-white/20 mb-2">
                                    <Icons.Zap className="w-4 h-4 text-audi-yellow animate-pulse" />
                                    <span className="text-xs font-bold text-audi-yellow uppercase tracking-wider">Flash Sale</span>
                                </div>
                                <h1 className="text-3xl md:text-5xl font-game font-bold text-white mb-2">
                                    BONUS +{promo.bonusPercent}% <span className="text-audi-cyan">VCOIN</span>
                                </h1>
                                <p className="text-white/80 text-sm max-w-md">
                                    {lang === 'vi' ? 'Khuyến mãi đặc biệt trong thời gian có hạn.' : 'Special promotion for a limited time.'}
                                </p>
                            </div>
                            {/* Timer */}
                            <div className="flex gap-4">
                                {['h', 'm', 's'].map((unit) => (
                                    <div key={unit} className="flex flex-col items-center">
                                        <div className="w-12 h-12 md:w-16 md:h-16 bg-black/40 backdrop-blur-md border border-white/20 rounded-xl flex items-center justify-center">
                                            <span className="font-mono text-2xl md:text-3xl font-bold text-white">
                                                {String(timeLeft[unit as keyof typeof timeLeft]).padStart(2, '0')}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-bold text-white/50 uppercase mt-1">{unit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Packages Grid */}
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Icons.ShoppingBag className="w-5 h-5 text-audi-cyan" />
                    {lang === 'vi' ? 'Chọn gói nạp' : 'Select Package'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                    {packages.map((pkg) => {
                        // LOGIC: If Global Promo is active, use Global %. Else use Package Specific %.
                        const activeBonusPercent = promo.isActive ? promo.bonusPercent : pkg.bonusPercent;
                        const hasBonus = activeBonusPercent > 0;

                        return (
                            <div 
                                key={pkg.id}
                                onClick={() => setSelectedPkg(pkg.id)}
                                className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 group ${selectedPkg === pkg.id ? `${pkg.colorTheme} bg-white/5 scale-105 shadow-[0_0_20px_rgba(0,0,0,0.5)]` : 'border-white/10 bg-[#0c0c14] hover:border-white/30'}`}
                            >
                                {pkg.isPopular && (
                                    <div className="absolute top-0 right-0 bg-audi-pink text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-lg shadow-lg">
                                        HOT
                                    </div>
                                )}
                                
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-white/5`}>
                                        <Icons.Gem className={`w-6 h-6 ${pkg.id === 'pkg_4' ? 'text-audi-pink' : pkg.id === 'pkg_3' ? 'text-audi-purple' : pkg.id === 'pkg_2' ? 'text-audi-cyan' : 'text-slate-400'}`} />
                                    </div>
                                    {selectedPkg === pkg.id && <div className="w-4 h-4 rounded-full bg-audi-cyan flex items-center justify-center"><Icons.Sparkles className="w-2.5 h-2.5 text-black" /></div>}
                                </div>

                                <h3 className="text-lg font-bold text-white mb-1">{pkg.name}</h3>
                                <div className="flex items-baseline gap-1 mb-4">
                                    <span className="text-2xl font-black text-audi-yellow">{pkg.coin}</span>
                                    <span className="text-xs text-slate-400">Vcoin</span>
                                </div>

                                <div className="w-full h-px bg-white/10 mb-4"></div>

                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm text-slate-400">Bonus</span>
                                    {hasBonus ? (
                                        <span className="text-sm font-bold text-green-400 animate-pulse">
                                            +{activeBonusPercent}%
                                        </span>
                                    ) : (
                                        <span className="text-sm font-bold text-slate-500">{pkg.bonusText || '0%'}</span>
                                    )}
                                </div>

                                <button className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${selectedPkg === pkg.id ? 'bg-white text-black' : 'bg-white/10 text-white group-hover:bg-white/20'}`}>
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(pkg.price)}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Professional Payment Modal */}
                {transaction && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
                        <div className="w-full max-w-4xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
                             
                             {/* Left: Info */}
                             <div className="flex-1 p-8 md:p-10 flex flex-col justify-between bg-[#f8f9fa] text-slate-800">
                                 <div>
                                     <h3 className="text-2xl font-bold text-[#002e6e] mb-2">{lang === 'vi' ? 'Thanh toán đơn hàng' : 'Payment Information'}</h3>
                                     <p className="text-slate-500 text-sm mb-8">Vui lòng thực hiện chuyển khoản theo thông tin bên dưới.</p>
                                     
                                     <div className="space-y-6">
                                         <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                                             <span className="text-slate-500 font-medium">Ngân hàng</span>
                                             <div className="flex items-center gap-2">
                                                 <span className="font-bold text-[#002e6e]">{BANK_INFO.bankId} Bank</span>
                                             </div>
                                         </div>
                                         
                                         <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                                             <span className="text-slate-500 font-medium">Chủ tài khoản</span>
                                             <span className="font-bold text-slate-800 uppercase">{BANK_INFO.accountName}</span>
                                         </div>

                                         <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                                             <span className="text-slate-500 font-medium">Số tài khoản</span>
                                             <div className="flex items-center gap-2">
                                                 <span className="font-bold text-lg text-slate-800">{BANK_INFO.accountNo}</span>
                                                 <button onClick={() => copyToClipboard(BANK_INFO.accountNo)} className="text-audi-purple hover:text-purple-700"><Icons.Share className="w-4 h-4" /></button>
                                             </div>
                                         </div>

                                         <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                                             <span className="text-slate-500 font-medium">Số tiền</span>
                                             <span className="font-bold text-2xl text-[#002e6e]">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(transaction.amount)}</span>
                                         </div>

                                         <div className="flex justify-between items-center bg-yellow-50 p-3 rounded-xl border border-yellow-200">
                                             <span className="text-yellow-700 font-bold">Nội dung CK</span>
                                             <div className="flex items-center gap-2">
                                                 <span className="font-mono font-bold text-lg text-red-500">{transaction.code}</span>
                                                 <button onClick={() => copyToClipboard(transaction.code)} className="text-audi-purple hover:text-purple-700"><Icons.Share className="w-4 h-4" /></button>
                                             </div>
                                         </div>
                                     </div>
                                 </div>

                                 <div className="mt-8 text-xs text-slate-500">
                                     * Vcoin sẽ được cộng tự động sau 1-3 phút khi hệ thống nhận được tiền.
                                 </div>
                             </div>

                             {/* Right: QR Code */}
                             <div className="w-full md:w-[400px] bg-[#002e6e] p-8 md:p-10 flex flex-col items-center justify-center text-white relative overflow-hidden">
                                 {/* Decorative Circles */}
                                 <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                                 <div className="absolute bottom-0 left-0 w-64 h-64 bg-audi-pink/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

                                 <h4 className="text-lg font-bold mb-6 relative z-10">Quét mã QR để thanh toán</h4>
                                 
                                 <div className="bg-white p-4 rounded-2xl shadow-2xl mb-6 relative z-10">
                                     {/* Real VietQR Generation */}
                                     <img 
                                        src={`https://img.vietqr.io/image/${BANK_INFO.bankId}-${BANK_INFO.accountNo}-${BANK_INFO.template}.png?amount=${transaction.amount}&addInfo=${transaction.code}&accountName=${encodeURIComponent(BANK_INFO.accountName)}`}
                                        alt="VietQR" 
                                        className="w-56 h-56 object-contain" 
                                     />
                                 </div>

                                 <div className="flex items-center gap-2 text-sm text-white/80 relative z-10">
                                     <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                                     Đang chờ thanh toán...
                                 </div>

                                 <button onClick={() => setTransaction(null)} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
                                     <Icons.X className="w-6 h-6" />
                                 </button>
                             </div>

                        </div>
                    </div>
                )}

                {/* Action Bar */}
                <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                             <Icons.Shield className="w-5 h-5 text-green-500" />
                         </div>
                         <div className="text-sm">
                             <div className="text-white font-bold">{lang === 'vi' ? 'Thanh toán an toàn' : 'Secure Payment'}</div>
                             <div className="text-slate-400 text-xs">Hỗ trợ mọi ngân hàng Việt Nam</div>
                         </div>
                    </div>
                    
                    <button 
                        onClick={handlePayment}
                        disabled={loading || !selectedPkg}
                        className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-audi-pink to-audi-purple rounded-xl font-bold text-white shadow-lg hover:shadow-audi-pink/40 hover:scale-105 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Icons.Sparkles className="animate-spin w-5 h-5" /> : <Icons.QrCode className="w-5 h-5" />}
                        {lang === 'vi' ? 'Tạo Mã Thanh Toán' : 'Generate Payment QR'}
                    </button>
                </div>
            </>
        )}

    </div>
  );
};
