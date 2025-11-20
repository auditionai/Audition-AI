
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGameConfig } from '../../contexts/GameConfigContext';
import { CosmeticItem, Rank } from '../../types';
import Modal from '../common/Modal';
import { resizeImage } from '../../utils/imageUtils';

const GameConfigManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { refreshConfig, ranks, frames, titles } = useGameConfig();
    const [activeSubTab, setActiveSubTab] = useState<'ranks' | 'cosmetics'>('ranks');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // State for editing
    const [editingRank, setEditingRank] = useState<Partial<Rank> | null>(null);
    const [editingCosmetic, setEditingCosmetic] = useState<Partial<CosmeticItem> | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);

    // --- Ranks Logic ---
    const handleEditRank = (rank: Rank | null) => {
        setEditingRank(rank || { levelThreshold: 0, title: '', color: 'text-gray-400', icon: '' });
        setIsModalOpen(true);
    };

    const saveRank = async () => {
        if (!editingRank) return;
        setIsSaving(true);
        try {
            const res = await fetch('/.netlify/functions/admin-game-config?type=rank', {
                method: editingRank.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(editingRank),
            });
            if (!res.ok) throw new Error('Failed to save rank');
            showToast('Rank saved!', 'success');
            setIsModalOpen(false);
            refreshConfig();
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // --- Cosmetics Logic ---
    const handleEditCosmetic = (cosmetic: CosmeticItem | null) => {
        setEditingCosmetic(cosmetic || { 
            type: 'frame', 
            name: '', 
            rarity: 'common', 
            unlockCondition: { level: 0 },
            cssClass: 'frame-none'
        } as any);
        setUploadFile(null);
        setIsModalOpen(true);
    };

    const saveCosmetic = async () => {
        if (!editingCosmetic) return;
        setIsSaving(true);
        try {
            let finalImageUrl = editingCosmetic.imageUrl;

            if (uploadFile) {
                const { dataUrl } = await resizeImage(uploadFile, 512); // Resize logic if needed
                const uploadRes = await fetch('/.netlify/functions/upload-asset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                    body: JSON.stringify({ image: dataUrl, folder: 'assets' }),
                });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok) throw new Error(uploadData.error);
                finalImageUrl = uploadData.url;
            }

            const payload = { ...editingCosmetic, imageUrl: finalImageUrl };

            const res = await fetch('/.netlify/functions/admin-game-config?type=cosmetic', {
                method: editingCosmetic.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(payload),
            });
            
            if (!res.ok) throw new Error('Failed to save cosmetic');
            showToast('Cosmetic saved!', 'success');
            setIsModalOpen(false);
            refreshConfig();
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDelete = async (id: string, type: 'rank' | 'cosmetic') => {
        if (!confirm('Are you sure? This cannot be undone.')) return;
        try {
             await fetch(`/.netlify/functions/admin-game-config?type=${type}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            showToast('Deleted successfully', 'success');
            refreshConfig();
        } catch(e: any) {
             showToast(e.message, 'error');
        }
    }

    return (
        <div className="bg-[#12121A]/80 border border-blue-500/20 rounded-2xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-blue-400">Game Configuration</h3>
                <div className="flex gap-2">
                     <button onClick={() => setActiveSubTab('ranks')} className={`px-3 py-1 rounded ${activeSubTab === 'ranks' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400'}`}>Ranks</button>
                     <button onClick={() => setActiveSubTab('cosmetics')} className={`px-3 py-1 rounded ${activeSubTab === 'cosmetics' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400'}`}>Cosmetics</button>
                </div>
            </div>

            {activeSubTab === 'ranks' && (
                <div>
                    <button onClick={() => handleEditRank(null)} className="themed-button-primary mb-4 px-4 py-2 text-sm">+ Add Rank</button>
                    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                        {ranks.map(r => (
                            <div key={r.id || r.title} className="flex justify-between items-center p-2 bg-white/5 rounded">
                                <div className="flex gap-3 items-center">
                                    <span className="text-yellow-400 font-bold">Lv.{r.levelThreshold}</span>
                                    <span className={r.color}>{r.title}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEditRank(r)} className="text-blue-400 text-xs">Edit</button>
                                    {r.id && <button onClick={() => handleDelete(r.id!, 'rank')} className="text-red-400 text-xs">Del</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeSubTab === 'cosmetics' && (
                <div>
                    <button onClick={() => handleEditCosmetic(null)} className="themed-button-primary mb-4 px-4 py-2 text-sm">+ Add Cosmetic</button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto custom-scrollbar">
                        {[...frames, ...titles].map(c => (
                            <div key={c.id} className="flex gap-3 p-2 bg-white/5 rounded items-center">
                                <div className="w-12 h-12 bg-black/30 rounded flex items-center justify-center overflow-hidden">
                                    {c.imageUrl ? <img src={c.imageUrl} className="w-full h-full object-contain" alt=""/> : <span className="text-xs text-gray-500">CSS</span>}
                                </div>
                                <div className="flex-grow">
                                    <p className="font-bold text-sm text-white">{c.name}</p>
                                    <p className="text-xs text-gray-400 uppercase">{c.type} - {c.rarity}</p>
                                    <p className="text-xs text-yellow-500">Unlock: Lv.{c.unlockCondition?.level || 0}</p>
                                </div>
                                <div className="flex flex-col gap-1">
                                     <button onClick={() => handleEditCosmetic(c)} className="text-blue-400 text-xs">Edit</button>
                                     {c.id && c.id !== 'default' && c.id !== 'newbie' && <button onClick={() => handleDelete(c.id, 'cosmetic')} className="text-red-400 text-xs">Del</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {isModalOpen && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={activeSubTab === 'ranks' ? 'Edit Rank' : 'Edit Cosmetic'}>
                    {activeSubTab === 'ranks' && editingRank && (
                         <div className="space-y-3">
                            <input type="number" placeholder="Level Threshold" value={editingRank.levelThreshold} onChange={e => setEditingRank({...editingRank, levelThreshold: Number(e.target.value)})} className="auth-input" />
                            <input type="text" placeholder="Title Name" value={editingRank.title} onChange={e => setEditingRank({...editingRank, title: e.target.value})} className="auth-input" />
                            <input type="text" placeholder="Color Class (e.g. text-red-500)" value={editingRank.color} onChange={e => setEditingRank({...editingRank, color: e.target.value})} className="auth-input" />
                            <button onClick={saveRank} disabled={isSaving} className="themed-button-primary w-full mt-4">{isSaving ? 'Saving...' : 'Save Rank'}</button>
                         </div>
                    )}
                    {activeSubTab === 'cosmetics' && editingCosmetic && (
                        <div className="space-y-3">
                            <select value={editingCosmetic.type} onChange={e => setEditingCosmetic({...editingCosmetic, type: e.target.value as any})} className="auth-input">
                                <option value="frame">Avatar Frame</option>
                                <option value="title">Title Badge</option>
                            </select>
                            <input type="text" placeholder="Name" value={editingCosmetic.name} onChange={e => setEditingCosmetic({...editingCosmetic, name: e.target.value})} className="auth-input" />
                            <select value={editingCosmetic.rarity} onChange={e => setEditingCosmetic({...editingCosmetic, rarity: e.target.value as any})} className="auth-input">
                                <option value="common">Common</option>
                                <option value="rare">Rare</option>
                                <option value="epic">Epic</option>
                                <option value="legendary">Legendary</option>
                                <option value="mythic">Mythic</option>
                            </select>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-400">Unlock Level:</label>
                                <input type="number" value={editingCosmetic.unlockCondition?.level || 0} onChange={e => setEditingCosmetic({...editingCosmetic, unlockCondition: { level: Number(e.target.value) }})} className="auth-input w-20" />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Upload Image (Overrides CSS)</label>
                                <input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)} className="text-sm text-gray-400" />
                            </div>
                             <input type="text" placeholder="CSS Class (Optional/Legacy)" value={editingCosmetic.cssClass || ''} onChange={e => setEditingCosmetic({...editingCosmetic, cssClass: e.target.value})} className="auth-input" />
                            
                            <button onClick={saveCosmetic} disabled={isSaving} className="themed-button-primary w-full mt-4">{isSaving ? 'Saving...' : 'Save Cosmetic'}</button>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
};

export default GameConfigManager;
