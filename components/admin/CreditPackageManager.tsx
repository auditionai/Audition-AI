import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CreditPackage } from '../../types';
import Modal from '../common/Modal';

const CreditPackageManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPackage, setEditingPackage] = useState<Partial<CreditPackage> | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const fetchPackages = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/credit-packages', {
                headers: { Authorization: `Bearer ${session?.access_token}` },
            });
            if (!res.ok) throw new Error('Không thể tải các gói nạp.');
            setPackages(await res.json());
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

    useEffect(() => {
        fetchPackages();
    }, [fetchPackages]);

    const handleOpenModal = (pkg: Partial<CreditPackage> | null = null) => {
        setEditingPackage(pkg || { name: '', credits_amount: 0, bonus_credits: 0, price_vnd: 0, tag: '', is_active: true, is_featured: false, display_order: 99 });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!editingPackage) return;
        setIsSaving(true);
        const isCreating = !editingPackage.id;
        try {
            const res = await fetch('/.netlify/functions/credit-packages', {
                method: isCreating ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(editingPackage),
            });
            const savedPackage = await res.json();
            if (!res.ok) throw new Error(savedPackage.error || `Lưu gói thất bại.`);

            if (isCreating) {
                setPackages([...packages, savedPackage].sort((a,b) => a.display_order - b.display_order));
            } else {
                setPackages(packages.map(p => p.id === savedPackage.id ? savedPackage : p).sort((a,b) => a.display_order - b.display_order));
            }
            showToast('Lưu gói thành công!', 'success');
            setIsModalOpen(false);
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <p className="text-center text-gray-400 p-8">Đang tải danh sách gói nạp...</p>;

    return (
        <div className="bg-[#12121A]/80 border border-green-500/20 rounded-2xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-green-400">Quản Lý Gói Nạp</h3>
                <button onClick={() => handleOpenModal(null)} className="themed-button-primary">Tạo Gói Mới</button>
            </div>
            <div className="space-y-2">
                {packages.map(pkg => (
                    <div key={pkg.id} className="grid grid-cols-12 gap-2 items-center p-3 bg-white/5 rounded-lg text-sm">
                        <div className="col-span-3 font-bold text-white">{pkg.name}</div>
                        <div className="col-span-2 text-pink-300">💎{pkg.credits_amount + pkg.bonus_credits}</div>
                        <div className="col-span-2">{pkg.price_vnd.toLocaleString()}đ</div>
                        <div className="col-span-3">{pkg.tag} {pkg.is_featured && '🌟'}</div>
                        <div className="col-span-2 flex justify-end gap-2">
                            <span className={`px-2 py-1 text-xs rounded-full ${pkg.is_active ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>{pkg.is_active ? 'Active' : 'Inactive'}</span>
                            <button onClick={() => handleOpenModal(pkg)} className="text-blue-400 hover:text-blue-300">Sửa</button>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && editingPackage && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingPackage.id ? 'Chỉnh Sửa Gói' : 'Tạo Gói Mới'}>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="col-span-2"><label>Tên gói</label><input type="text" value={editingPackage.name} onChange={e => setEditingPackage({...editingPackage, name: e.target.value})} className="auth-input mt-1" /></div>
                        <div><label>Kim cương</label><input type="number" value={editingPackage.credits_amount} onChange={e => setEditingPackage({...editingPackage, credits_amount: Number(e.target.value)})} className="auth-input mt-1" /></div>
                        <div><label>Thưởng</label><input type="number" value={editingPackage.bonus_credits} onChange={e => setEditingPackage({...editingPackage, bonus_credits: Number(e.target.value)})} className="auth-input mt-1" /></div>
                        <div><label>Giá (VND)</label><input type="number" value={editingPackage.price_vnd} onChange={e => setEditingPackage({...editingPackage, price_vnd: Number(e.target.value)})} className="auth-input mt-1" /></div>
                        <div><label>Thứ tự</label><input type="number" value={editingPackage.display_order} onChange={e => setEditingPackage({...editingPackage, display_order: Number(e.target.value)})} className="auth-input mt-1" /></div>
                        <div className="col-span-2"><label>Tag (e.g., Best Seller)</label><input type="text" value={editingPackage.tag || ''} onChange={e => setEditingPackage({...editingPackage, tag: e.target.value})} className="auth-input mt-1" /></div>
                        <div className="flex items-center"><input id="is_active" type="checkbox" checked={editingPackage.is_active} onChange={e => setEditingPackage({...editingPackage, is_active: e.target.checked})} /><label htmlFor="is_active" className="ml-2">Kích hoạt?</label></div>
                        <div className="flex items-center"><input id="is_featured" type="checkbox" checked={editingPackage.is_featured} onChange={e => setEditingPackage({...editingPackage, is_featured: e.target.checked})} /><label htmlFor="is_featured" className="ml-2">Nổi bật?</label></div>
                        <div className="col-span-2 flex justify-end gap-3 pt-4">
                            <button onClick={() => setIsModalOpen(false)} className="themed-button-secondary">Hủy</button>
                            <button onClick={handleSave} disabled={isSaving} className="themed-button-primary">{isSaving ? 'Đang lưu...' : 'Lưu'}</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default CreditPackageManager;
