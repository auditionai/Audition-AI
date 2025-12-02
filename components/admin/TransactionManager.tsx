import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AdminTransaction } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';

const TransactionManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    const fetchTransactions = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/admin-transactions', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) throw new Error(t('creator.settings.admin.transactions.error'));
            setTransactions(await res.json());
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast, t]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    const handleAction = async (transactionId: string, action: 'approve' | 'reject') => {
        setIsProcessing(transactionId);
        try {
            const res = await fetch('/.netlify/functions/admin-transactions', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ transactionId, action }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);

            const actionText = action === 'approve' ? t('creator.settings.admin.transactions.approved') : t('creator.settings.admin.transactions.rejected');
            showToast(t('creator.settings.admin.transactions.success', { action: actionText }), 'success');
            setTransactions(prev => prev.filter(t => t.id !== transactionId));
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    if (isLoading) return <p className="text-center text-gray-400 p-8">{t('creator.settings.admin.transactions.loading')}</p>;

    return (
        <div className="bg-[#12121A]/80 border border-blue-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-blue-400">{t('creator.settings.admin.transactions.title')}</h3>
            {transactions.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                    {transactions.map(tx => (
                        <div key={tx.id} className="grid grid-cols-12 gap-4 items-center p-3 bg-white/5 rounded-lg text-sm">
                            <div className="col-span-12 md:col-span-5 flex items-center gap-3">
                                <img src={tx.users.photo_url} alt={tx.users.display_name} className="w-10 h-10 rounded-full" />
                                <div>
                                    <p className="font-bold text-white">{tx.users.display_name}</p>
                                    <p className="text-gray-400 text-xs">{tx.users.email}</p>
                                </div>
                            </div>
                            <div className="col-span-6 md:col-span-3">
                                <p className="font-semibold text-pink-300">💎 +{tx.diamonds_received.toLocaleString()}</p>
                                <p className="text-gray-300">{tx.amount_vnd.toLocaleString()} đ</p>
                            </div>
                             <div className="col-span-6 md:col-span-2 text-gray-400 text-right md:text-left">
                                {new Date(tx.created_at).toLocaleString('vi-VN')}
                            </div>
                            <div className="col-span-12 md:col-span-2 flex justify-end gap-2">
                                <button
                                    onClick={() => handleAction(tx.id, 'approve')}
                                    disabled={isProcessing === tx.id}
                                    className="px-3 py-1 text-xs font-semibold rounded-md bg-green-500/80 hover:bg-green-600 text-white disabled:opacity-50"
                                >
                                    {t('creator.settings.admin.transactions.approve')}
                                </button>
                                <button
                                    onClick={() => handleAction(tx.id, 'reject')}
                                    disabled={isProcessing === tx.id}
                                    className="px-3 py-1 text-xs font-semibold rounded-md bg-red-500/80 hover:bg-red-600 text-white disabled:opacity-50"
                                >
                                    {t('creator.settings.admin.transactions.reject')}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-center text-gray-500 py-8">{t('creator.settings.admin.transactions.empty')}</p>
            )}
        </div>
    );
};

export default TransactionManager;