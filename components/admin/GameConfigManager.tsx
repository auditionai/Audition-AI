
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGameConfig } from '../../contexts/GameConfigContext';
import { CosmeticItem, Rank } from '../../types';
import Modal from '../common/Modal';
import { resizeImage } from '../../utils/imageUtils';
import { useTranslation } from '../../hooks/useTranslation';

const GameConfigManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
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
            // Map to snake_case for DB
            const dbPayload = {
                id: editingRank.id,
                level_threshold: editingRank.levelThreshold,
                title: editingRank.title,
                color_hex: editingRank.color,
                icon_url: typeof editingRank.icon === 'string' ? editingRank.icon : ''
            };

            const res = await fetch('/.netlify/functions/admin-game-config?type=rank', {
                method: editingRank.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(dbPayload),
            });
            
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to save rank');
            }
            
            showToast(t('creator.settings.admin.gameConfig.buttons.save'), 'success');
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
                const { dataUrl } = await resizeImage(uploadFile, 512); 
                const uploadRes = await fetch('/.netlify/functions/upload-asset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                    body: JSON.stringify({ image: dataUrl, folder: 'cosmetics' }),
                });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok) throw new Error(uploadData.error);
                finalImageUrl = uploadData.url;
            }

            // Map to snake_case for DB
            const dbPayload = {
                id: editingCosmetic.id,
                type: editingCosmetic.type,
                name: editingCosmetic.name,
                rarity: editingCosmetic.rarity,
                css_class: editingCosmetic.cssClass,
                image_url: finalImageUrl,
                unlock_level: editingCosmetic.unlockCondition?.level || 0,
                is_active: true
            };

            const res = await fetch('/.netlify/functions/admin-game-config?type=cosmetic', {
                method: editingCosmetic.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify(dbPayload),
            });
            
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to save cosmetic');
            }
            
            showToast(t('creator.settings.admin.gameConfig.buttons.save'), 'success');
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
            showToast(t('creator.settings.admin.gameConfig.buttons.delete'), 'success');
            refreshConfig();
        } catch(e: any) {
             showToast(e.message, 'error');
        }
    }

    return (
        <div className="bg-[#12121A]/80 border border-blue-500/20 rounded-2xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-blue-400">{t('creator.settings.admin.gameConfig.title')}</h3>
                <div className="flex gap-2">
                     <button onClick={() => setActiveSubTab('ranks')} className={`px-3 py-1 rounded ${activeSubTab === 'ranks' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400'}`}>{t('creator.settings.admin.gameConfig.tabs.ranks')}</button>
                     <button onClick={() => setActiveSubTab('cosmetics')} className={`px-3 py-1 rounded ${activeSubTab === 'cosmetics' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400'}`}>{t('creator.settings.admin.gameConfig.tabs.cosmetics')}</button>
                </div>
            </div>

            {activeSubTab === 'ranks' && (
                <div>
                    <button onClick={() => handleEditRank(null)} className="themed-button-primary mb-4 px-4 py-2 text-sm">+ {t('creator.settings.admin.gameConfig.buttons.addRank')}</button>
                    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                        {ranks.map(r => (
                            <div key={r.id || r.title} className="flex justify-between items-center p-2 bg-white/5 rounded">
                                <div className="flex gap-3 items-center">
                                    <span className="text-yellow-400 font-bold">Lv.{r.levelThreshold}</span>
                                    <span className={r.color}>{r.title}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEditRank(r)} className="text-blue-400 text-xs">{t('creator.settings.admin.gameConfig.buttons.edit')}</button>
                                    {r.id && <button onClick={() => handleDelete(r.id!, 'rank')} className="text-red-400 text-xs">{t('creator.settings.admin.gameConfig.buttons.delete')}</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeSubTab === 'cosmetics' && (
                <div>
                    <button onClick={() => handleEditCosmetic(null)} className="themed-button-primary mb-4 px-4 py-2 text-sm">+ {t('creator.settings.admin.gameConfig.buttons.addCosmetic')}</button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto custom-scrollbar">
                        {[...frames, ...titles].map(c => (
                            <div key={c.id} className="flex gap-3 p-2 bg-white/5 rounded items-center">
                                <div className="w-12 h-12 bg-black/30 rounded flex items-center justify-center overflow-hidden relative">
                                    {c.imageUrl ? <img src={c.imageUrl} className="w-full h-full object-contain" alt=""/> : <span className="text-xs text-gray-500">CSS</span>}
                                </div>
                                <div className="flex-grow">
                                    <p className="font-bold text-sm text-white">{c.nameKey ? t(c.nameKey) : c.name}</p>
                                    <p className="text-xs text-gray-400 uppercase">{t(`creator.settings.admin.gameConfig.types.${c.type}`)} - {t(`creator.settings.admin.gameConfig.rarities.${c.rarity}`)}</p>
                                    <p className="text-xs text-yellow-500">{t('creator.settings.admin.gameConfig.form.unlockLevel')}: {c.unlockCondition?.level || 0}</p>
                                </div>
                                <div className="flex flex-col gap-1">
                                     <button onClick={() => handleEditCosmetic(c)} className="text-blue-400 text-xs">{t('creator.settings.admin.gameConfig.buttons.edit')}</button>
                                     {c.id && c.id !== 'default' && c.id !== 'newbie' && <button onClick={() => handleDelete(c.id, 'cosmetic')} className="text-red-400 text-xs">{t('creator.settings.admin.gameConfig.buttons.delete')}</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {isModalOpen && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={activeSubTab === 'ranks' ? t('creator.settings.admin.gameConfig.buttons.addRank') : t('creator.settings.admin.gameConfig.buttons.addCosmetic')}>
                    {activeSubTab === 'ranks' && editingRank && (
                         <div className="space-y-3">
                            <div>
                                <label className="text-sm text-gray-400">{t('creator.settings.admin.gameConfig.form.level')}</label>
                                <input type="number" value={editingRank.levelThreshold} onChange={e => setEditingRank({...editingRank, levelThreshold: Number(e.target.value)})} className="auth-input mt-1" />
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">{t('creator.settings.admin.gameConfig.form.titleName')}</label>
                                <input type="text" value={editingRank.title} onChange={e => setEditingRank({...editingRank, title: e.target.value})} className="auth-input mt-1" />
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">{t('creator.settings.admin.gameConfig.form.colorClass')}</label>
                                <input type="text" value={editingRank.color} onChange={e => setEditingRank({...editingRank, color: e.target.value})} className="auth-input mt-1" />
                            </div>
                            <button onClick={saveRank} disabled={isSaving} className="themed-button-primary w-full mt-4">{isSaving ? t('creator.settings.admin.gameConfig.buttons.saving') : t('creator.settings.admin.gameConfig.buttons.save')}</button>
                         </div>
                    )}
                    {activeSubTab === 'cosmetics' && editingCosmetic && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-sm text-gray-400">{t('creator.settings.admin.gameConfig.form.type')}</label>
                                <select value={editingCosmetic.type} onChange={e => setEditingCosmetic({...editingCosmetic, type: e.target.value as any})} className="auth-input mt-1">
                                    <option value="frame">{t('creator.settings.admin.gameConfig.types.frame')}</option>
                                    <option value="title">{t('creator.settings.admin.gameConfig.types.title')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">{t('creator.settings.admin.gameConfig.form.name')}</label>
                                <input type="text" value={editingCosmetic.name} onChange={e => setEditingCosmetic({...editingCosmetic, name: e.target.value})} className="auth-input mt-1" />
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">{t('creator.settings.admin.gameConfig.form.rarity')}</label>
                                <select value={editingCosmetic.rarity} onChange={e => setEditingCosmetic({...editingCosmetic, rarity: e.target.value as any})} className="auth-input mt-1">
                                    <option value="common">{t('creator.settings.admin.gameConfig.rarities.common')}</option>
                                    <option value="rare">{t('creator.settings.admin.gameConfig.rarities.rare')}</option>
                                    <option value="epic">{t('creator.settings.admin.gameConfig.rarities.epic')}</option>
                                    <option value="legendary">{t('creator.settings.admin.gameConfig.rarities.legendary')}</option>
                                    <option value="mythic">{t('creator.settings.admin.gameConfig.rarities.mythic')}</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-400">{t('creator.settings.admin.gameConfig.form.unlockLevel')}:</label>
                                <input type="number" value={editingCosmetic.unlockCondition?.level || 0} onChange={e => setEditingCosmetic({...editingCosmetic, unlockCondition: { level: Number(e.target.value) }})} className="auth-input w-20" />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">{t('creator.settings.admin.gameConfig.form.uploadImage')}</label>
                                <input type="file" accept="image/*" onChange={e => setUploadFile(e.target.files?.[0] || null)} className="text-sm text-gray-400" />
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">{t('creator.settings.admin.gameConfig.form.cssClass')}</label>
                                <input type="text" value={editingCosmetic.cssClass || ''} onChange={e => setEditingCosmetic({...editingCosmetic, cssClass: e.target.value})} className="auth-input mt-1" />
                            </div>
                            
                            <button onClick={saveCosmetic} disabled={isSaving} className="themed-button-primary w-full mt-4">{isSaving ? t('creator.settings.admin.gameConfig.buttons.saving') : t('creator.settings.admin.gameConfig.buttons.save')}</button>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
};

export default GameConfigManager;
