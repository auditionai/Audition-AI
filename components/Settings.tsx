import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getRankForLevel } from '../utils/rankUtils';
import { RANKS } from '../constants/ranks';
import { Rank, ApiKey, User as AppUser, GalleryImage } from '../types';
import XPProgressBar from './common/XPProgressBar';

type SettingsTab = 'profile' | 'history' | 'gallery' | 'user_management' | 'rank_management' | 'api_management';

// --- Admin Components ---
const UserManagement = () => {
    // In a real app, this data would be fetched from a secure admin endpoint
    const [users, setUsers] = useState<AppUser[]>([]);
    // useEffect(() => { /* fetch users */ }, []);

    return (
        <div>
            <h2 className="text-xl font-bold mb-4">Quản lý Người dùng (Demo)</h2>
            <p className="text-sm text-gray-400 mb-4">Chức năng này sẽ yêu cầu một endpoint admin để tìm nạp và quản lý người dùng.</p>
        </div>
    )
};

const RankManagement = () => {
    // In a real app, this would fetch and update ranks in the database
    const [ranks, setRanks] = useState<Rank[]>(RANKS);
     return (
        <div>
            <h2 className="text-xl font-bold mb-4">Quản lý Cấp bậc & Danh hiệu (Demo)</h2>
            <p className="text-sm text-gray-400">Chức năng này sẽ yêu cầu các endpoints admin để quản lý cấu hình cấp bậc.</p>
        </div>
    );
};

const ApiKeyManagement = () => {
    const { session, showToast } = useAuth();
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyValue, setNewKeyValue] = useState('');

    const getHeaders = (includeContentType = false) => {
        const headers: Record<string, string> = {};
        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        if (includeContentType) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    };

    const fetchKeys = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/.netlify/functions/api-keys', { headers: getHeaders() });
            if (!response.ok) throw new Error('Không thể tải API keys.');
            const data = await response.json();
            setKeys(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);

    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyName.trim() || !newKeyValue.trim()) {
            showToast('Vui lòng điền đầy đủ thông tin!', 'error');
            return;
        }
        try {
            const response = await fetch('/.netlify/functions/api-keys', {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({ name: newKeyName, key_value: newKeyValue }),
            });
            if (!response.ok) throw new Error('Thêm key thất bại.');
            const newKey = await response.json();
            setKeys(prev => [newKey, ...prev]);
            setNewKeyName('');
            setNewKeyValue('');
            showToast('Thêm API Key thành công!', 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleToggleStatus = async (id: string, currentStatus: string) => {
        try {
            const response = await fetch('/.netlify/functions/api-keys', {
                method: 'PUT',
                headers: getHeaders(true),
                body: JSON.stringify({ id, status: currentStatus === 'active' ? 'inactive' : 'active' }),
            });
            if (!response.ok) throw new Error('Cập nhật thất bại.');
            fetchKeys(); // Refresh list
            showToast('Cập nhật trạng thái thành công!', 'success');
        } catch (error: any) {
             showToast(error.message, 'error');
        }
    };

    const handleDeleteKey = async (id: string) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa API Key này không?')) {
             try {
                const response = await fetch('/.netlify/functions/api-keys', {
                    method: 'DELETE',
                    headers: getHeaders(true),
                    body: JSON.stringify({ id }),
                });
                if (!response.ok) throw new Error('Xóa key thất bại.');
                setKeys(keys.filter(key => key.id !== id));
                showToast('Đã xóa API Key!', 'success');
            } catch (error: any) {
                showToast(error.message, 'error');
            }
        }
    };

    if (isLoading) return <div>Đang tải...</div>;

    return (
        <div>
            <h2 className="text-xl font-bold mb-6">Quản lý API Key</h2>
            <div className="bg-white/5 p-6 rounded-lg mb-8">
                <form onSubmit={handleAddKey} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    {/* Form inputs... */}
                     <div className="md:col-span-1">
                        <label htmlFor="keyName" className="block text-sm font-medium text-gray-400 mb-1">Tên gợi nhớ</label>
                        <input id="keyName" type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="VD: Gemini Project A" className="auth-input"/>
                    </div>
                     <div className="md:col-span-2">
                        <label htmlFor="keyValue" className="block text-sm font-medium text-gray-400 mb-1">API Key</label>
                        <input id="keyValue" type="text" value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)} placeholder="AIzaSy..." className="auth-input"/>
                    </div>
                    <div className="md:col-span-3 text-right">
                         <button type="submit" className="px-6 py-2 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition">
                            Thêm Key
                        </button>
                    </div>
                </form>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-400">
                     <thead className="text-xs text-gray-400 uppercase bg-white/5">
                        <tr>
                            <th scope="col" className="px-6 py-3">Tên gợi nhớ</th>
                            <th scope="col" className="px-6 py-3">Key</th>
                            <th scope="col" className="px-6 py-3">Trạng thái</th>
                            <th scope="col" className="px-6 py-3">Lượt sử dụng</th>
                            <th scope="col" className="px-6 py-3">Hành động</th>
                        </tr>
                    </thead>
                    <tbody>
                        {keys.map(k => (
                            <tr key={k.id} className="border-b border-gray-700 hover:bg-white/5">
                                <td className="px-6 py-4 font-medium text-white">{k.name}</td>
                                <td className="px-6 py-4 font-mono">{`${k.key_value.slice(0, 8)}...${k.key_value.slice(-4)}`}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${k.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-300'}`}>
                                        {k.status === 'active' ? 'Hoạt động' : 'Vô hiệu hóa'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">{k.usage_count.toLocaleString()}</td>
                                <td className="px-6 py-4 flex gap-4">
                                    <button onClick={() => handleToggleStatus(k.id, k.status)} className="font-medium text-cyan-400 hover:underline">
                                        {k.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt'}
                                    </button>
                                     <button onClick={() => handleDeleteKey(k.id)} className="font-medium text-red-400 hover:underline">Xóa</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- User Components ---
const ProfileSettings: React.FC = () => {
    const { user } = useAuth();
    if (!user) return null;

    const rank = getRankForLevel(user.level);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-6 pb-6 border-b border-white/10">
                <div className="relative">
                    <img src={user.photo_url} alt="Avatar" className="w-24 h-24 rounded-full" />
                </div>
                <div>
                     <h3 className="text-2xl font-bold text-white">{user.display_name}</h3>
                     <div className="flex items-center gap-2 mt-1 text-lg">
                        {rank.icon}
                        <span>{rank.title} - Cấp {user.level}</span>
                     </div>
                </div>
            </div>
            <div><XPProgressBar currentXp={user.xp} currentLevel={user.level} /></div>
            <div className="space-y-4 pt-6 border-t border-white/10">
                <div>
                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-400 mb-1">Tên hiển thị</label>
                    <input type="text" id="displayName" defaultValue={user.display_name} className="auth-input" />
                </div>
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                    <input type="email" id="email" value={user.email} className="auth-input bg-white/5 cursor-not-allowed" readOnly />
                </div>
            </div>
            <div className="flex justify-end pt-4">
                 <button className="px-6 py-2 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition">
                    Lưu thay đổi (Demo)
                </button>
            </div>
        </div>
    );
};

const HistorySettings: React.FC = () => (
    <div>
        <h2 className="text-xl font-bold mb-4">Lịch sử nạp tiền</h2>
        <div className="text-center py-12 bg-white/5 rounded-lg">
             <i className="ph-fill ph-clock-counter-clockwise text-5xl text-gray-500 mb-4"></i>
             <p className="text-gray-400">Lịch sử giao dịch của bạn sẽ xuất hiện ở đây.</p>
             <p className="text-sm text-gray-500">Tính năng này đang được phát triển.</p>
        </div>
    </div>
);

const GallerySettings: React.FC = () => {
    const { session, showToast } = useAuth();
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchImages = async () => {
            if (!session) {
                setIsLoading(false);
                return;
            };
            try {
                const headers: Record<string, string> = {};
                if (session.access_token) {
                    headers['Authorization'] = `Bearer ${session.access_token}`;
                }
                const response = await fetch('/.netlify/functions/user-gallery', {
                    headers: headers,
                });
                if (!response.ok) throw new Error('Không thể tải ảnh.');
                const data = await response.json();
                setImages(data);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchImages();
    }, [session]);

    if (isLoading) return <div>Đang tải kho ảnh...</div>;

    return (
         <div>
            <h2 className="text-xl font-bold mb-4">Kho ảnh đã tạo của bạn</h2>
            {images.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {images.map(image => (
                         <div key={image.id} className="group relative rounded-lg overflow-hidden aspect-[3/4]">
                            <img src={image.image_url} alt={image.prompt} className="w-full h-full object-cover"/>
                             <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 text-center">
                                <p className="text-xs text-gray-300 italic">"{image.prompt}"</p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                 <div className="text-center py-12 bg-white/5 rounded-lg">
                    <i className="ph-fill ph-image text-5xl text-gray-500 mb-4"></i>
                    <p className="text-gray-400">Những bức ảnh bạn tạo sẽ được lưu trữ ở đây.</p>
                 </div>
            )}
        </div>
    );
};

// --- Main Component ---
const Settings: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

    const renderContent = () => {
        switch (activeTab) {
            case 'profile': return <ProfileSettings />;
            case 'history': return <HistorySettings />;
            case 'gallery': return <GallerySettings />;
            case 'user_management': return user?.is_admin ? <UserManagement /> : null;
            case 'rank_management': return user?.is_admin ? <RankManagement /> : null;
            case 'api_management': return user?.is_admin ? <ApiKeyManagement /> : null;
            default: return null;
        }
    }
    // ... rest of the component is the same
     const TabButton: React.FC<{tabId: SettingsTab; label: string, icon: string}> = ({tabId, label, icon}) => (
        <button 
            onClick={() => setActiveTab(tabId)}
            className={`w-full flex items-center gap-3 text-left px-4 py-2.5 rounded-lg transition-colors text-sm ${activeTab === tabId ? 'bg-pink-500/20 text-white font-semibold' : 'text-gray-300 hover:bg-white/10'}`}
        >
            <i className={`ph-fill ${icon} text-lg`}></i>
            {label}
        </button>
    )

  return (
    <div className="container mx-auto px-4 py-8 animate-fade-in">
        <h1 className="text-3xl font-bold mb-8">Cài Đặt</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-1">
                <div className="space-y-2 p-2 bg-[#12121A]/80 border border-white/10 rounded-lg">
                   <TabButton tabId="profile" label="Hồ sơ" icon="ph-user-circle"/>
                   <TabButton tabId="history" label="Lịch sử nạp tiền" icon="ph-receipt"/>
                   <TabButton tabId="gallery" label="Kho ảnh đã tạo" icon="ph-images"/>
                   {user?.is_admin && (
                    <div className="pt-2 mt-2 border-t border-white/10">
                        <p className="px-4 py-2 text-xs font-semibold text-yellow-400 uppercase">Admin</p>
                        <TabButton tabId="user_management" label="Quản lý Người dùng" icon="ph-users-three"/>
                        <TabButton tabId="rank_management" label="Quản lý Cấp bậc" icon="ph-star-of-david"/>
                        <TabButton tabId="api_management" label="Quản lý API Key" icon="ph-key"/>
                    </div>
                   )}
                </div>
            </div>
            <div className="md:col-span-3">
                <div className="bg-[#12121A]/80 border border-white/10 rounded-lg p-6 min-h-[400px]">
                    {renderContent()}
                </div>
            </div>
        </div>
    </div>
  );
};

export default Settings;