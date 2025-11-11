import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AdminTransaction } from '../../types';

const TransactionApproval: React.FC = () => {
    const { session, showToast } = useAuth();
    const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchPendingTransactions = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const response = await fetch('/.netlify/functions/admin-transactions', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!response.ok) throw new Error('Không thể tải giao dịch.');
            setTransactions(await response.json());
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

    useEffect(() => {
        fetchPendingTransactions();
    }, [fetchPendingTransactions]);

    const handleTransaction = async (transactionId: string, action: 'approve' | 'reject') => {
        setProcessingId(transactionId);
        try {
            const response = await fetch('/.netlify/functions/admin-transactions', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ transactionId, action }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            showToast(result.message, 'success');
            setTransactions(prev => prev.filter(t => t.id !== transactionId));
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setProcessingId(null);
        }
    };

    if (isLoading) {
        return <p className="text-center p-8">Đang tải danh sách giao dịch chờ duyệt...</p>;
    }

    return (
        <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-cyan-400">Duyệt Giao Dịch Đang Chờ</h3>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {transactions.length === 0 ? (
                    <p className="text-center text-gray-500 py-12">Không có giao dịch nào đang chờ duyệt.</p>
                ) : (
                    transactions.map(t => (
                        <div key={t.id} className="p-4 bg-white/5 rounded-lg flex flex-col md:flex-row items-start md:items-center gap-4">
                            <div className="flex items-center gap-3 flex-grow">
                                <img src={t.users.photo_url} alt={t.users.display_name} className="w-12 h-12 rounded-full" />
                                <div>
                                    <p className="font-bold text-white">{t.users.display_name}</p>
                                    <p className="text-xs text-gray-400">{t.users.email}</p>
                                </div>
                            </div>
                            <div className="text-sm text-gray-300 flex-shrink-0 md:text-center">
                                <p>Đơn hàng: #{t.order_code}</p>
                                <p>{new Date(t.created_at).toLocaleString('vi-VN')}</p>
                            </div>
                            <div className="font-semibold text-lg md:text-center">
                                <p className="text-green-400">+{t.diamonds_received.toLocaleString()} 💎</p>
                                <p className="text-yellow-400">{t.amount_vnd.toLocaleString('vi-VN')} đ</p>
                            </div>
                            <div className="flex gap-2 self-end md:self-center">
                                <button
                                    onClick={() => handleTransaction(t.id, 'approve')}
                                    disabled={processingId === t.id}
                                    className="px-4 py-2 text-sm font-bold bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50"
                                >
                                    {processingId === t.id ? '...' : 'Duyệt'}
                                </button>
                                <button
                                    onClick={() => handleTransaction(t.id, 'reject')}
                                    disabled={processingId === t.id}
                                    className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50"
                                >
                                    {processingId === t.id ? '...' : 'Từ chối'}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default TransactionApproval;
