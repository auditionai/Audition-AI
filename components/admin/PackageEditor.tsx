import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CreditPackage } from '../../types';
import Modal from '../common/Modal';

const EditPackageModal: React.FC<{ pkg: CreditPackage | null, onClose: () => void, onSave: (p: CreditPackage) => Promise<void> }> = ({ pkg, onClose, onSave }) => {
    const [formData, setFormData] = useState<Partial<CreditPackage>>(pkg || {});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setFormData(pkg || {});
    }, [pkg]);

    if (!pkg) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            setFormData({ ...formData, [name]: (e.target as HTMLInputElement).checked });
        } else if (type === 'number') {
            setFormData({ ...formData, [name]: Number(value) });
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(formData as CreditPackage);
        setIsSaving(false);
        onClose();
    };
    
    return (
        <Modal isOpen={!!pkg} onClose={onClose} title={pkg.id ? 'Chỉnh sửa gói' : 'Tạo gói mới'}>
            <div className="space-y-3">
                <input name="name" value={formData.name || ''} onChange={handleChange} placeholder="Tên gói" className="auth-input w-full"/>
                <input name="credits_amount" type="number" value={formData.credits_amount || ''} onChange={handleChange} placeholder="Số KC" className="auth-input w-full"/>
                <input name="bonus_credits" type="number" value={formData.bonus_credits || ''} onChange={handleChange} placeholder="Số KC thưởng" className="auth-input w-full"/>
                <input name="price_vnd" type="number" value={formData.price_vnd || ''} onChange={handleChange} placeholder="Giá (VND)" className="auth-input w-full"/>
                <input name="tag" value={formData.tag || ''} onChange={handleChange} placeholder="Tag (VD: Hot)" className="auth-input w-full"/>
                <input name="display_order" type="number" value={formData.display_order || 0} onChange={handleChange} placeholder="Thứ tự hiển thị" className="auth-input w-full"/>
                <div className="flex justify-between items-center"><label>Active</label><input name="is_active" type="checkbox" checked={formData.is_active || false} onChange={handleChange}/></div>
                <div className="flex justify-between items-center"><label>Flash Sale</label><input name="is_flash_sale" type="checkbox" checked={formData.is_flash_sale || false} onChange={handleChange}/></div>
                <div className="flex justify-between items-center"><label>Nổi bật</label><input name="is_featured" type="checkbox" checked={formData.is_featured || false} onChange={handleChange}/></div>
                <button onClick={handleSave} disabled={isSaving} className="themed-button-primary w-full py-2">{isSaving ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
        </Modal>
    );
};

const PackageEditor: React.FC = () => {
    const { session, showToast } = useAuth();
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);

    const fetchData = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/credit-packages', { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!res.ok) throw new Error('Could not fetch packages.');
            setPackages(await res.json());
        } catch (e: any) { showToast(e.message, 'error'); } 
        finally { setIsLoading(false); }
    }, [session, showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (pkg: CreditPackage) => {
        const method = pkg.id ? 'PUT' : 'POST';
        try {
            const res = await fetch('/.netlify/functions/credit-packages', {
                method,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(pkg),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            showToast('Lưu gói thành công!', 'success');
            fetchData();
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    if (isLoading) return <p className="text-center p-8">Đang tải...</p>;

    return (
        <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
            <EditPackageModal pkg={editingPackage} onClose={() => setEditingPackage(null)} onSave={handleSave} />
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-cyan-400">Quản lý Gói Nạp</h3>
                <button onClick={() => setEditingPackage({} as CreditPackage)} className="themed-button-primary px-4 py-2 text-sm">Tạo Gói Mới</button>
            </div>
            <div className="space-y-2">
                {packages.map(p => (
                    <div key={p.id} className="grid grid-cols-6 gap-4 items-center p-2 bg-white/5 rounded">
                        <div className="col-span-2 font-semibold">{p.name}</div>
                        <div>{p.price_vnd.toLocaleString()} đ</div>
                        <div>{p.credits_amount} + {p.bonus_credits} 💎</div>
                        <div>{p.is_active ? '✅' : '❌'}</div>
                        <button onClick={() => setEditingPackage(p)} className="text-pink-400 hover:underline">Sửa</button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PackageEditor;
