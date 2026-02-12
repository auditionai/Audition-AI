
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Promotion } from '../../types';
import Modal from '../common/Modal';

const PromotionManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const [editingPromo, setEditingPromo] = useState<Partial<Promotion>>({
        title: '',
        description: '',
        bonus_percentage: 0,
        start_time: '',
        end_time: '',
        is_active: true
    });

    // Helper to format datetime-local input value
    const toLocalISO = (isoString: string) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        // Adjust to local timezone for input value
        const offsetMs = date.getTimezoneOffset() * 60 * 1000;
        const localDate = new Date(date.getTime() - offsetMs);
        return localDate.toISOString().slice(0, 16);
    };

    const fetchPromotions = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/admin-promotions', {
                headers: { Authorization: `Bearer ${session?.access_token}` },
            });
            if (!res.ok) throw new Error('Failed to load promotions');
            setPromotions(await res.json());
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

    useEffect(() => {
        fetchPromotions();
    }, [fetchPromotions]);

    const handleOpenModal = (promo: Promotion | null = null) => {
        if (promo) {
            setEditingPromo(promo);
        } else {
            // Default start now, end in 3 days
            const now = new Date();
            const end = new Date();
            end.setDate(end.getDate() + 3);
            setEditingPromo({
                title: '',
                description: '🔥 KHUYẾN MẠI: Tặng thêm 50% Kim Cương. Nạp ngay kẻo lỡ!',
                bonus_percentage: 50,
                start_time: now.toISOString(),
                end_time: end.toISOString(),
                is_active: true
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!editingPromo.title || !editingPromo.start_time || !editingPromo.end_time) {
            showToast('Vui lòng điền đầy đủ thông tin.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch('/.netlify/functions/admin-promotions', {
                method: editingPromo.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(editingPromo),
            });
            const saved = await res.json();
            if (!res.ok) throw new Error(saved.error);

            showToast('Lưu chương trình khuyến mại thành công!', 'success');
            setIsModalOpen(false);
            fetchPromotions();
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Bạn có chắc chắn muốn xóa chương trình này?")) return;
        try {
            const res = await fetch('/.netlify/functions/admin-promotions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) throw new Error('Failed to delete');
            setPromotions(prev => prev.filter(p => p.id !== id));
            showToast('Đã xóa.', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    if (isLoading) return <p className="text-center text-gray-400 p-8">Đang tải dữ liệu...</p>;

    return (
        <div className="bg-[#12121A]/80 border border-red-500/20 rounded-2xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-red-400 flex items-center gap-2"><i className="ph-fill ph-tag"></i> Quản Lý Khuyến Mại</h3>
                <button onClick={() => handleOpenModal(null)} className="themed-button-primary text-sm px-4 py-2">+ Tạo Mới</button>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {promotions.length === 0 ? <p className="text-center text-gray-500">Chưa có chương trình khuyến mại nào.</p> : promotions.map(promo => {
                    const isActive = promo.is_active && new Date() >= new Date(promo.start_time) && new Date() <= new Date(promo.end_time);
                    return (
                        <div key={promo.id} className={`p-4 rounded-lg border flex flex-col gap-2 transition-colors ${isActive ? 'bg-red-500/10 border-red-500/50' : 'bg-white/5 border-white/10'}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-white text-lg">{promo.title} {isActive && <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded animate-pulse">ĐANG CHẠY</span>}</h4>
                                    <p className="text-sm text-gray-400">{promo.description}</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-black text-yellow-400">+{promo.bonus_percentage}%</div>
                                </div>
                            </div>
                            <div className="flex justify-between items-center text-xs text-gray-500 mt-2 border-t border-white/5 pt-2">
                                <div>
                                    <p>Bắt đầu: {new Date(promo.start_time).toLocaleString('vi-VN')}</p>
                                    <p>Kết thúc: {new Date(promo.end_time).toLocaleString('vi-VN')}</p>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => handleOpenModal(promo)} className="text-blue-400 hover:text-blue-300 font-bold">Sửa</button>
                                    <button onClick={() => handleDelete(promo.id)} className="text-red-400 hover:text-red-300 font-bold">Xóa</button>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {isModalOpen && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingPromo.id ? "Sửa Khuyến Mại" : "Tạo Khuyến Mại Mới"}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Tên chương trình</label>
                            <input type="text" className="auth-input" value={editingPromo.title} onChange={e => setEditingPromo({...editingPromo, title: e.target.value})} placeholder="VD: Mừng Quốc Khánh 2/9" />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Nội dung thông báo (Marquee)</label>
                            <textarea className="auth-input h-20" value={editingPromo.description} onChange={e => setEditingPromo({...editingPromo, description: e.target.value})} placeholder="Nội dung chạy trên thanh thông báo..." />
                        </div>
                        <div>
                            <label className="block text-sm text-yellow-400 font-bold mb-1">% Khuyến mại thêm</label>
                            <input type="number" className="auth-input border-yellow-500/50" value={editingPromo.bonus_percentage} onChange={e => setEditingPromo({...editingPromo, bonus_percentage: Number(e.target.value)})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Bắt đầu</label>
                                <input 
                                    type="datetime-local" 
                                    className="auth-input" 
                                    value={toLocalISO(editingPromo.start_time!)} 
                                    onChange={e => setEditingPromo({...editingPromo, start_time: new Date(e.target.value).toISOString()})} 
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Kết thúc</label>
                                <input 
                                    type="datetime-local" 
                                    className="auth-input" 
                                    value={toLocalISO(editingPromo.end_time!)} 
                                    onChange={e => setEditingPromo({...editingPromo, end_time: new Date(e.target.value).toISOString()})} 
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                            <input type="checkbox" id="is_active_promo" className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-red-500 focus:ring-red-500" checked={editingPromo.is_active} onChange={e => setEditingPromo({...editingPromo, is_active: e.target.checked})} />
                            <label htmlFor="is_active_promo" className="text-sm text-white">Kích hoạt ngay</label>
                        </div>
                        <div className="flex justify-end pt-4 gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="themed-button-secondary">Hủy</button>
                            <button onClick={handleSave} disabled={isSaving} className="themed-button-primary">{isSaving ? 'Đang lưu...' : 'Lưu Lại'}</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default PromotionManager;
