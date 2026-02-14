
import React, { useState, useEffect, useMemo } from 'react';
import { Language, Transaction, CreditPackage, PromotionCampaign, ViewId, HistoryItem } from '../types';
import { Icons } from '../components/Icons';
import { getPackages, createPaymentLink, getActivePromotion, getUnifiedHistory } from '../services/economyService';

interface TopUpProps {
  lang: Language;
  onNavigate: (view: ViewId, data?: any) => void;
}

export const TopUp: React.FC<TopUpProps> = ({ lang, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'packages' | 'history'>('packages');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<PromotionCampaign | null>(null);
  const [loading, setLoading] = useState(false);

  // Timer for Flash Sale (Added Days 'd')
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    // Load Packages & Active Campaign
    const loadData = async () => {
        const pkgs = await getPackages();
        setPackages(pkgs);
        const campaign = await getActivePromotion();
        setActiveCampaign(campaign);
    };
    loadData();
  }, []);

  // Update Countdown Timer based on Campaign End Time
  useEffect(() => {
    if (!activeCampaign) return;

    const interval = setInterval(() => {
        const now = new Date().getTime();
        const end = new Date(activeCampaign.endTime).getTime();
        const diff = end - now;

        if (diff <= 0) {
            setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
            return;
        }

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ d, h, m, s });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeCampaign]);

  // Load History from DB (merged logs and pending)
  useEffect(() => {
      if (activeTab === 'history') {
          const fetchHistory = async () => {
              const txs = await getUnifiedHistory();
              setHistory(txs);
          };
          fetchHistory();
      }
  }, [activeTab]);

  // --- SMART COPYWRITING GENERATOR ---
  // Generates an engaging description based on campaign data instead of raw title
  const smartDescription = useMemo(() => {
      if (!activeCampaign) return "";
      
      const { name, bonusPercent } = activeCampaign;
      const isHugeSale = bonusPercent >= 50;
      
      if (lang === 'vi') {
          if (isHugeSale) {
              return `🔥 Cơ hội vàng từ sự kiện "${name}"! Hệ thống đang tặng thêm +${bonusPercent}% Vcoin cho mọi giao dịch. Đây là thời điểm tốt nhất để tích lũy tài nguyên và sáng tạo không giới hạn. Đừng bỏ lỡ deal hời nhất tháng này!`;
          }
          return `✨ Chào mừng sự kiện "${name}". Tận hưởng ưu đãi nạp +${bonusPercent}% Vcoin ngay hôm nay. Nạp càng nhiều, ưu đãi càng lớn. Sẵn sàng bùng nổ cùng các tính năng AI mới nhất!`;
      } else {
          if (isHugeSale) {
              return `🔥 Massive offer from "${name}" event! Get an extra +${bonusPercent}% Vcoin on every top-up. This is the perfect time to stock up and create without limits. Don't miss the best deal of the month!`;
          }
          return `✨ Welcome to "${name}". Enjoy a +${bonusPercent}% Vcoin bonus today. The more you top up, the bigger the reward. Get ready to unleash your creativity with our latest AI tools!`;
      }
  }, [activeCampaign, lang]);

  const handleBuyPackage = async (pkg: CreditPackage) => {
      setLoading(true);
      try {
          const tx = await createPaymentLink(pkg.id);
          onNavigate('payment_gateway', { transaction: tx });
      } catch (e) {
          console.error(e);
          alert(lang === 'vi' ? 'Có lỗi khi tạo giao dịch' : 'Error creating transaction');
      } finally {
          setLoading(false);
      }
  };

  const getBadgeStyle = (type: string) => {
      switch(type) {
          case 'usage': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
          case 'topup': return 'bg-green-500/20 text-green-400 border-green-500/50';
          case 'pending_topup': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
          case 'reward': return 'bg-audi-pink/20 text-audi-pink border-audi-pink/50';
          case 'giftcode': return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
          case 'refund': return 'bg-audi-cyan/20 text-audi-cyan border-audi-cyan/50';
          default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
      }
  }

  const getBadgeLabel = (type: string) => {
      switch(type) {
          case 'usage': return 'SỬ DỤNG';
          case 'topup': return 'NẠP TIỀN';
          case 'pending_topup': return 'CHỜ DUYỆT';
          case 'reward': return 'THƯỞNG';
          case 'giftcode': return 'GIFTCODE';
          case 'refund': return 'HOÀN TIỀN';
          default: return 'KHÁC';
      }
  }

  return (
    <div className="pb-32 animate-fade-in max-w-6xl mx-auto">
        
        {/* --- HEADER TABS --- */}
        <div className="flex justify-center mb-10 sticky top-[72px] z-30">
            <div className="bg-[#0c0c14]/90 backdrop-blur-md p-1.5 rounded-full border border-white/20 flex gap-1 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                <button 
                    onClick={() => setActiveTab('packages')}
                    className={`px-8 py-3 rounded-full text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'packages' ? 'bg-gradient-to-r from-audi-pink to-audi-purple text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                    <Icons.Zap className="w-4 h-4" />
                    {lang === 'vi' ? 'Nạp Vcoin' : 'Top Up'}
                </button>
                <button 
                     onClick={() => setActiveTab('history')}
                     className={`px-8 py-3 rounded-full text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                    <Icons.Clock className="w-4 h-4" />
                    {lang === 'vi' ? 'Lịch sử' : 'History'}
                </button>
            </div>
        </div>

        {activeTab === 'history' ? (
            <div className="glass-panel p-8 rounded-[2rem] min-h-[500px] border border-white/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-audi-cyan via-white to-audi-cyan opacity-50"></div>
                <h2 className="text-2xl font-game font-bold text-white mb-8 flex items-center gap-3">
                    <Icons.Clock className="w-6 h-6 text-audi-cyan" />
                    {lang === 'vi' ? 'Lịch Sử Biến Động Số Dư' : 'Balance History'}
                </h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="text-xs uppercase bg-white/5 text-slate-300 font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-4 rounded-l-xl">Thời gian</th>
                                <th className="px-6 py-4">Nội dung</th>
                                <th className="px-6 py-4">Loại GD</th>
                                <th className="px-6 py-4">Vcoin</th>
                                <th className="px-6 py-4 rounded-r-xl">Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {history.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-12 text-slate-500 italic">Chưa có giao dịch nào</td></tr>
                            ) : history.map(item => (
                                <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4 font-mono text-xs">{new Date(item.createdAt).toLocaleString()}</td>
                                    <td className="px-6 py-4 font-bold text-white max-w-[200px] truncate" title={item.description}>
                                        {item.description}
                                        {item.code && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.code}</div>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded border text-[10px] font-bold ${getBadgeStyle(item.type)}`}>
                                            {getBadgeLabel(item.type)}
                                        </span>
                                    </td>
                                    <td className={`px-6 py-4 font-bold text-base ${item.vcoinChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {item.vcoinChange > 0 ? '+' : ''}{item.vcoinChange}
                                    </td>
                                    <td className="px-6 py-4">
                                        {item.status === 'success' ? (
                                            <Icons.Check className="w-4 h-4 text-green-500" />
                                        ) : item.status === 'pending' ? (
                                            <Icons.Loader className="w-4 h-4 text-yellow-500 animate-spin" />
                                        ) : (
                                            <Icons.X className="w-4 h-4 text-red-500" />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        ) : (
            <>
                {/* --- HERO BANNER (EVENT) --- */}
                {activeCampaign ? (
                    <div className="relative rounded-[2.5rem] overflow-hidden mb-12 border-2 border-audi-pink/50 shadow-[0_0_50px_rgba(255,0,153,0.3)] group">
                        {/* Dynamic Background */}
                        <div className="absolute inset-0 bg-gradient-to-r from-[#2a0b36] via-[#4a0e44] to-[#0c0c14] z-0"></div>
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30 z-0"></div>
                        
                        {/* Floating Shapes */}
                        <div className="absolute top-[-50%] left-[-20%] w-[500px] h-[500px] bg-audi-pink/20 rounded-full blur-[100px] animate-pulse"></div>
                        <div className="absolute bottom-[-50%] right-[-20%] w-[500px] h-[500px] bg-audi-cyan/20 rounded-full blur-[100px] animate-pulse delay-1000"></div>

                        <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
                            
                            {/* Left Content */}
                            <div className="flex-1 text-center md:text-left space-y-4">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-audi-yellow/50 backdrop-blur-md shadow-[0_0_15px_rgba(251,218,97,0.4)] animate-bounce-slow">
                                    <Icons.Zap className="w-4 h-4 text-audi-yellow fill-current" />
                                    <span className="text-xs font-bold text-audi-yellow uppercase tracking-widest">{activeCampaign.name}</span>
                                </div>
                                
                                <h1 className="text-5xl md:text-7xl font-game font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-slate-400 drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] leading-tight">
                                    BONUS <span className="text-audi-pink">+{activeCampaign.bonusPercent}%</span> <span className="text-audi-cyan">VCOIN</span>
                                </h1>
                                
                                {/* Smart AI Description */}
                                <p className="text-slate-300 text-sm md:text-base max-w-lg leading-relaxed border-l-4 border-audi-purple pl-4 italic">
                                    "{smartDescription}"
                                </p>
                            </div>

                            {/* Right Timer (Including Days) */}
                            <div className="flex gap-2 md:gap-4 p-4 md:p-6 bg-black/20 rounded-3xl border border-white/10 backdrop-blur-sm shadow-xl transform group-hover:scale-105 transition-transform duration-500">
                                {['d', 'h', 'm', 's'].map((unit) => (
                                    <div key={unit} className="flex flex-col items-center gap-2">
                                        <div className="w-14 h-16 md:w-20 md:h-24 bg-[#12121a] rounded-xl border-t border-white/20 border-b-4 border-black flex items-center justify-center relative overflow-hidden shadow-inner">
                                            <div className="absolute top-1/2 w-full h-px bg-black/50"></div>
                                            <span className="font-mono text-3xl md:text-5xl font-bold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                                                {String(timeLeft[unit as keyof typeof timeLeft]).padStart(2, '0')}
                                            </span>
                                        </div>
                                        <span className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                            {unit === 'd' ? 'DAYS' : unit === 'h' ? 'HOURS' : unit === 'm' ? 'MINS' : 'SECS'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center mb-12 py-8 bg-gradient-to-r from-audi-purple/10 to-audi-cyan/10 rounded-3xl border border-white/10">
                        <h2 className="text-3xl font-game font-bold text-white mb-2">STORE VCOIN</h2>
                        <p className="text-slate-400">Nạp Vcoin để trải nghiệm các tính năng AI cao cấp</p>
                    </div>
                )}

                {/* --- PACKAGES GRID --- */}
                <div className="flex items-center gap-3 mb-8">
                     <div className="w-10 h-10 rounded-xl bg-audi-cyan/20 flex items-center justify-center text-audi-cyan">
                         <Icons.ShoppingBag className="w-5 h-5" />
                     </div>
                     <h2 className="text-2xl font-bold text-white">{lang === 'vi' ? 'Chọn gói nạp' : 'Select Package'}</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {packages.map((pkg) => {
                        const activeBonusPercent = activeCampaign ? activeCampaign.bonusPercent : pkg.bonusPercent;
                        const hasBonus = activeBonusPercent > 0;
                        const finalCoins = Math.floor(pkg.coin + (pkg.coin * activeBonusPercent / 100));

                        return (
                            <div 
                                key={pkg.id}
                                className={`group relative bg-[#12121a] rounded-[2rem] p-6 border transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col ${pkg.isPopular ? 'border-audi-pink shadow-[0_0_20px_rgba(255,0,153,0.1)]' : 'border-white/10 hover:border-white/30'}`}
                            >
                                {/* Badges */}
                                {pkg.isPopular && (
                                    <div className="absolute top-0 right-0 bg-gradient-to-bl from-audi-pink to-audi-purple text-white text-[10px] font-bold px-4 py-1.5 rounded-tr-[1.8rem] rounded-bl-xl shadow-lg z-10 flex items-center gap-1">
                                        <Icons.Flame className="w-3 h-3 fill-white" /> HOT
                                    </div>
                                )}
                                {hasBonus && (
                                    <div className="absolute top-0 left-0 bg-audi-lime text-black text-[10px] font-bold px-4 py-1.5 rounded-tl-[1.8rem] rounded-br-xl shadow-lg z-10">
                                        BONUS +{activeBonusPercent}%
                                    </div>
                                )}

                                {/* Icon & Coin */}
                                <div className="flex flex-col items-center justify-center py-6 border-b border-white/5 border-dashed relative">
                                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110 duration-500 bg-gradient-to-b ${pkg.id === 'pkg_4' ? 'from-audi-pink/20 to-transparent' : pkg.id === 'pkg_3' ? 'from-audi-purple/20 to-transparent' : 'from-audi-cyan/20 to-transparent'}`}>
                                        <Icons.Gem className={`w-10 h-10 ${pkg.id === 'pkg_4' ? 'text-audi-pink' : pkg.id === 'pkg_3' ? 'text-audi-purple' : 'text-audi-cyan'} drop-shadow-[0_0_10px_currentColor]`} />
                                    </div>
                                    <div className="text-center">
                                        <div className="text-4xl font-game font-black text-white mb-1 group-hover:text-audi-yellow transition-colors">{finalCoins}</div>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">VCOIN</div>
                                        {hasBonus && <div className="text-[10px] text-slate-400 line-through mt-1">{pkg.coin}</div>}
                                    </div>
                                </div>

                                {/* Details */}
                                <div className="flex-1 py-6 space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400">Giá trị thực</span>
                                        <span className="text-white font-bold">1 Vcoin = 1.000đ</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400">Bonus Event</span>
                                        <span className="text-audi-lime font-bold">+{Math.floor(pkg.coin * activeBonusPercent / 100)} VC</span>
                                    </div>
                                    <div className="w-full h-px bg-white/5 my-2"></div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400 font-bold uppercase text-xs">Thành tiền</span>
                                        <span className="text-xl font-bold text-white">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(pkg.price)}</span>
                                    </div>
                                </div>

                                {/* Button */}
                                <button 
                                    onClick={() => handleBuyPackage(pkg)}
                                    disabled={loading}
                                    className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all relative overflow-hidden ${pkg.isPopular ? 'bg-gradient-to-r from-audi-pink to-audi-purple text-white shadow-[0_5px_20px_rgba(255,0,153,0.3)] hover:shadow-[0_5px_30px_rgba(255,0,153,0.5)]' : 'bg-white text-black hover:bg-slate-200'}`}
                                >
                                    <span className="relative z-10">{lang === 'vi' ? 'Nạp Ngay' : 'Buy Now'}</span>
                                    <Icons.ChevronRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </>
        )}
    </div>
  );
};
