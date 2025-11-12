import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Announcement } from '../../types';

const AnnouncementManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const [announcement, setAnnouncement] = useState<Partial<Announcement> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchAnnouncement = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/announcements', {
                headers: { Authorization: `Bearer ${session?.access_token}` },
            });
            if (!res.ok) throw new Error('Không thể tải thông báo.');
            const data = await res.json();
            setAnnouncement(data || { title: '', content: '', is_active: false });
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

    useEffect(() => {
        fetchAnnouncement();
    }, [fetchAnnouncement]);

    const handleSave = async () => {
        if (!announcement || !announcement.title || !announcement.content) return;
        setIsSaving(true);
        try {
            const res = await fetch('/.netlify/functions/announcements', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(announcement),
            });
            const savedData = await res.json();
            if (!res.ok) throw new Error(savedData.error);
            setAnnouncement(savedData);
            showToast('Cập nhật thông báo thành công!', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    if (isLoading || !announcement) return <p className="text-center text-gray-400 p-8">Đang tải...</p>;

    return (
        <div className="bg-[#12121A]/80 border border-orange-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-orange-400">Quản Lý Thông Báo</h3>
            <div className="space-y-4">
                <input
                    type="text"
                    placeholder="Tiêu đề thông báo"
                    value={announcement.title || ''}
                    onChange={e => setAnnouncement({ ...announcement, title: e.target.value })}
                    className="auth-input"
                />
                <textarea
                    placeholder="Nội dung thông báo"
                    value={announcement.content || ''}
                    onChange={e => setAnnouncement({ ...announcement, content: e.target.value })}
                    className="auth-input min-h-[120px]"
                />
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <input id="is_active_ann" type="checkbox" checked={announcement.is_active} onChange={e => setAnnouncement({ ...announcement, is_active: e.target.checked })} className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-pink-500 focus:ring-pink-500" />
                        <label htmlFor="is_active_ann" className="ml-2 block text-sm text-gray-300">Kích hoạt thông báo này?</label>
                    </div>
                    <button onClick={handleSave} disabled={isSaving} className="themed-button-primary">{isSaving ? 'Đang lưu...' : 'Lưu Thông Báo'}</button>
                </div>
            </div>
        </div>
    );
};

export default AnnouncementManager;
