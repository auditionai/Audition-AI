import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { TransactionLogEntry } from '../../types';

const TransactionHistory: React.FC = () => {
    const { session } = useAuth();
    const { t, language } = useTranslation();
    const [logs, setLogs] = useState<TransactionLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            if (!session) return;
            try {
                const res = await fetch('/.netlify/functions/transaction-history', {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });
                if (res.ok) {
                    setLogs(await res.json());
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLogs();
    }, [session]);

    const translateDescription = (desc: string) => {
        if (!desc) return '';
        
        // Map static strings to keys or partial matches
        // Note: Ideally descriptions should be stored as codes in DB, but for now we map string patterns.
        if (desc.includes('Mua vật phẩm:')) return desc.replace('Mua vật phẩm:', t('creator.settings.transactionHistory.types.buy') + ':');
        if (desc.includes('Nạp tiền')) return t('creator.settings.transactionHistory.types.topup');
        if (desc.includes('Tạo ảnh')) return desc.replace('Tạo ảnh', t('creator.settings.transactionHistory.types.generate'));
        if (desc.includes('Tách nền')) return desc.replace('Tách nền', t('creator.settings.transactionHistory.types.bgRemoval'));
        if (desc.includes('Chia sẻ')) return t('creator.settings.transactionHistory.types.share');
        if (desc.includes('Điểm danh')) return t('creator.settings.transactionHistory.types.checkIn');
        if (desc.includes('giới thiệu') || desc.includes('Referral')) return t('creator.settings.transactionHistory.types.referral');
        if (desc.includes('Quay trúng')) return desc.replace('Quay trúng:', t('creator.settings.transactionHistory.types.luckyWheel') + ':');
        if (desc.includes('Chèn chữ ký')) return t('creator.settings.transactionHistory.types.signature');
        if (desc.includes('Xử lý Gương Mặt')) return desc.replace('Xử lý Gương Mặt', 'Face Lock Process'); 

        return desc;
    };

    return (
        <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6 mb-8">
            <h3 className="text-2xl font-bold mb-4 text-white flex items-center gap-2">
                <i className="ph-fill ph-receipt"></i> {t('creator.settings.transactionHistory.title')}
            </h3>
            {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t('creator.settings.transactionHistory.loading')}</div>
            ) : logs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">{t('creator.settings.transactionHistory.empty')}</div>
            ) : (
                <div className="max-h-80 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {logs.map(log => (
                        <div key={log.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5 text-sm">
                            <div>
                                <p className="font-semibold text-white">{translateDescription(log.description)}</p>
                                <p className="text-xs text-gray-500">{new Date(log.created_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}</p>
                            </div>
                            <div className={`font-bold ${log.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {log.amount >= 0 ? '+' : ''}{log.amount} 💎
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TransactionHistory;