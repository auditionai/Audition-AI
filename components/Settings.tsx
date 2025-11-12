import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { TransactionLogEntry } from '../types';
import XPProgressBar from './common/XPProgressBar';
import RedeemGiftCode from './user/RedeemGiftCode';
import Dashboard from './admin/Dashboard';
import GiftCodeManager from './admin/GiftCodeManager';
import TransactionManager from './admin/TransactionManager';
import UserManager from './admin/UserManager';
import CreditPackageManager from './admin/CreditPackageManager';
import CheckInRewardManager from './admin/CheckInRewardManager';
import AnnouncementManager from './admin/AnnouncementManager';
import ApiKeyManager from './admin/ApiKeyManager';


// User-facing Transaction History Component
const TransactionHistory: React.FC = () => {
    const { session, showToast } = useAuth();
    const [logs, setLogs] = useState<TransactionLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!session) return;
            try {
                const res = await fetch('/.netlify/functions/transaction-history', {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });
                if (!res.ok) throw new Error('Không thể tải lịch sử giao dịch.');
                setLogs(await res.json());
            } catch (e: any) {
                showToast(e.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchHistory();
    }, [session, showToast]);

    if (isLoading) return <p className="text-center text-gray-400">Đang tải lịch sử...</p>;

    return (
        <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2">
            {logs.length > 0 ? logs.map(log => (
                <div key={log.id} className="grid grid-cols-12 gap-2 items-center p-3 bg-white/5 rounded-lg text-sm">
                    <div className="col-span-3 md:col-span-2 text-gray-400">{new Date(log.created_at).toLocaleDateString('vi-VN')}</div>
                    <div className="col-span-6 md:col-span-7 text-white">{log.description}</div>
                    <div className={`col-span-3 text-right font-bold ${log.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {log.amount >= 0 ? '+' : ''}{log.amount.toLocaleString()} 💎
                    </div>
                </div>
            )) : <p className="text-center text-gray-500 py-8">Chưa có giao dịch nào.</p>}
        </div>
    );
};

// Admin Panel
const AdminPanel: React.FC = () => {
    type AdminTab = 'dashboard' | 'transactions' | 'users' | 'gift_codes' | 'packages' | 'rewards' | 'announcements' | 'api_keys';
    const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard />;
            case 'transactions': return <TransactionManager />;
            case 'users': return <UserManager />;
            case 'gift_codes': return <GiftCodeManager />;
            case 'packages': return <CreditPackageManager />;
            case 'rewards': return <CheckInRewardManager />;
            case 'announcements': return <AnnouncementManager />;
            case 'api_keys': return <ApiKeyManager />;
            default: return <p className="text-center text-gray-500 py-8">Chức năng này đang được phát triển.</p>;
        }
    };
    
    return (
        <div className="mt-12">
            <h2 className="text-3xl font-bold mb-6 text-center bg-gradient-to-r from-red-500 to-orange-500 text-transparent bg-clip-text">Bảng Điều Khiển Admin</h2>
            <div className="flex flex-wrap justify-center gap-2 border-b border-white/10 mb-6 pb-4">
                <button onClick={() => setActiveTab('dashboard')} className={activeTab === 'dashboard' ? 'admin-tab-active' : 'admin-tab'}>Dashboard</button>
                <button onClick={() => setActiveTab('transactions')} className={activeTab === 'transactions' ? 'admin-tab-active' : 'admin-tab'}>Duyệt Giao Dịch</button>
                <button onClick={() => setActiveTab('users')} className={activeTab === 'users' ? 'admin-tab-active' : 'admin-tab'}>Quản lý User</button>
                <button onClick={() => setActiveTab('gift_codes')} className={activeTab === 'gift_codes' ? 'admin-tab-active' : 'admin-tab'}>Giftcode</button>
                <button onClick={() => setActiveTab('packages')} className={activeTab === 'packages' ? 'admin-tab-active' : 'admin-tab'}>Gói Nạp</button>
                <button onClick={() => setActiveTab('rewards')} className={activeTab === 'rewards' ? 'admin-tab-active' : 'admin-tab'}>Thưởng Điểm Danh</button>
                <button onClick={() => setActiveTab('announcements')} className={activeTab === 'announcements' ? 'admin-tab-active' : 'admin-tab'}>Thông Báo</button>
                <button onClick={() => setActiveTab('api_keys')} className={activeTab === 'api_keys' ? 'admin-tab-active' : 'admin-tab'}>API Keys</button>
            </div>
            <div>{renderContent()}</div>
        </div>
    );
}

// Main Settings Component
const Settings: React.FC = () => {
    const { user, session, showToast, updateUserProfile } = useAuth();
    const [displayName, setDisplayName] = useState(user?.display_name || '');
    const [isSaving, setIsSaving] = useState(false);
    
    if (!user) return null;

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (displayName.trim() === user.display_name || !displayName.trim()) return;
        setIsSaving(true);
        try {
            const res = await fetch('/.netlify/functions/user-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`},
                body: JSON.stringify({ display_name: displayName }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            updateUserProfile({ display_name: data.display_name });
            showToast('Cập nhật tên hiển thị thành công!', 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <div className="max-w-4xl mx-auto">
                <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6 flex flex-col md:flex-row items-center gap-6">
                    <div className="relative">
                        <img src={user.photo_url} alt={user.display_name} className="w-28 h-28 rounded-full" />
                    </div>
                    <div className="flex-grow w-full">
                        <form onSubmit={handleProfileUpdate} className="flex flex-col sm:flex-row gap-4 items-center">
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="auth-input flex-grow"
                            />
                            <button type="submit" disabled={isSaving || displayName === user.display_name} className="themed-button-primary w-full sm:w-auto px-6 py-2 font-semibold">
                                {isSaving ? 'Đang lưu...' : 'Lưu Tên'}
                            </button>
                        </form>
                        <div className="mt-4 w-full">
                            <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                        </div>
                    </div>
                </div>

                <div className="mt-8">
                    <RedeemGiftCode />
                </div>

                <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6 mt-8">
                     <h3 className="text-2xl font-bold mb-4 text-cyan-400">Lịch sử giao dịch Kim cương</h3>
                    <TransactionHistory />
                </div>

                {user.is_admin && <AdminPanel />}
            </div>
        </div>
    );
};

export default Settings;