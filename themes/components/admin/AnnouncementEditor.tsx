import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Announcement } from '../../types';

const AnnouncementEditor: React.FC = () => {
    const { session, showToast } = useAuth();
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchData = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/announcements', { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!res.ok) throw new Error('Could not fetch announcement.');
            setAnnouncement(await res.json());
        } catch (e: any) { showToast(e.message, 'error'); } 
        finally { setIsLoading(false); }
    }, [session, showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async () => {
        if (!announcement) return;
        setIsSaving(true);
        try {
             const res = await fetch('/.netlify/functions/announcements', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(announcement),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            showToast('Lưu thông báo thành công!', 'success');
        } catch (e: any) { showToast(e.message, 'error'); }
        finally { setIsSaving(false); }
    };
    
    if (isLoading) return <p className="text-center p-8">Đang tải...</p>;

    return (
        <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-cyan-400">Quản lý Thông Báo</h3>
            {announcement ? (
                <div className="space-y-4">
                    <input 
                        value={announcement.title} 
                        onChange={e => setAnnouncement({...announcement, title: e.target.value})} 
                        placeholder="Tiêu đề thông báo" 
                        className="auth-input w-full"
                    />
                    <textarea 
                        value={announcement.content}
                        onChange={e => setAnnouncement({...announcement, content: e.target.value})}
                        placeholder="Nội dung thông báo..."
                        className="auth-input w-full min-h-[150px]"
                        rows={5}
                    />
                    <div className="flex items-center justify-between">
                        <label className="font-medium text-gray-300">Kích hoạt thông báo này?</label>
                        <input 
                            type="checkbox" 
                            checked={announcement.is_active} 
                            onChange={e => setAnnouncement({...announcement, is_active: e.target.checked})}
                            className="h-5 w-5 rounded text-pink-500 focus:ring-pink-500"
                        />
                    </div>
                    <button onClick={handleSave} disabled={isSaving} className="themed-button-primary w-full py-3">{isSaving ? 'Đang lưu...' : 'Lưu và Phát Thông Báo'}</button>
                </div>
            ) : (
                <p className="text-center text-gray-500">Chưa có thông báo nào.</p>
            )}
        </div>
    );
};

export default AnnouncementEditor;
