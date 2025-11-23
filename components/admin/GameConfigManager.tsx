
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGameConfig } from '../../contexts/GameConfigContext';
import { useChat } from '../../contexts/ChatContext';
import { CosmeticItem, Rank } from '../../types';
import Modal from '../common/Modal';
import { resizeImage } from '../../utils/imageUtils';
import { useTranslation } from '../../hooks/useTranslation';
import UserName from '../common/UserName';

// UPDATED SQL SCRIPT TO FIX INFINITE RECURSION
const SQL_FIX_SCRIPT = `-- SỬA LỖI "INFINITE RECURSION" VÀ QUYỀN TIN NHẮN (V2)

-- 1. Xóa các Policies cũ gây lỗi đệ quy
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON direct_messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON direct_messages;

-- 2. Tạo hàm kiểm tra quyền (SECURITY DEFINER) để phá vỡ vòng lặp đệ quy
-- Hàm này chạy với quyền admin (bỏ qua RLS) để kiểm tra xem user có trong hội thoại không
CREATE OR REPLACE FUNCTION public.check_is_participant(conversation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversation_participants
    WHERE conversation_id = $1
    AND user_id = auth.uid()
  );
$$;

-- 3. Tạo lại Policies sử dụng hàm trên (An toàn, không đệ quy)

-- Bảng Conversations: Xem nếu mình là thành viên
CREATE POLICY "Users can view their conversations" ON conversations
FOR SELECT USING (
  check_is_participant(id)
);

-- Bảng Participants: Xem tất cả người tham gia trong các hội thoại của mình
CREATE POLICY "Users can view participants" ON conversation_participants
FOR SELECT USING (
  check_is_participant(conversation_id)
);

-- Cho phép tự thêm mình vào hội thoại (cần thiết khi tạo chat mới)
CREATE POLICY "Users can insert themselves" ON conversation_participants
FOR INSERT WITH CHECK (
  user_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid()) -- Cho phép insert nếu đã đăng nhập
);

-- Bảng Messages: Xem tin nhắn trong hội thoại của mình
CREATE POLICY "Users can view messages" ON direct_messages
FOR SELECT USING (
  check_is_participant(conversation_id)
);

-- Bảng Messages: Gửi tin nhắn vào hội thoại của mình
CREATE POLICY "Users can send messages" ON direct_messages
FOR INSERT WITH CHECK (
  check_is_participant(conversation_id) AND
  sender_id = auth.uid()
);

-- 4. Cấp quyền thực thi hàm
GRANT EXECUTE ON FUNCTION public.check_is_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_participant(uuid) TO service_role;

-- 5. Đảm bảo RLS được bật
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- 6. Fix lại Function tạo hội thoại (để chắc chắn nó hoạt động)
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(target_user_id UUID)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  conv_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

  -- Tìm hội thoại chung giữa 2 người
  SELECT c.id INTO conv_id
  FROM conversations c
  JOIN conversation_participants p1 ON c.id = p1.conversation_id
  JOIN conversation_participants p2 ON c.id = p2.conversation_id
  WHERE p1.user_id = current_user_id
    AND p2.user_id = target_user_id
  LIMIT 1;

  IF conv_id IS NOT NULL THEN
    RETURN conv_id;
  END IF;

  -- Tạo mới nếu chưa có
  INSERT INTO conversations (created_at, updated_at) 
  VALUES (NOW(), NOW()) 
  RETURNING id INTO conv_id;

  INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv_id, current_user_id);
  INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv_id, target_user_id);

  RETURN conv_id;
END;
$$;

SELECT 'Đã sửa lỗi Infinite Recursion thành công!' as status;
`;

const GameConfigManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const { refreshConfig, ranks, frames, titles, nameEffects } = useGameConfig();
    const { chatConfig, updateChatConfig } = useChat();
    
    // Tabs
    const [activeSubTab, setActiveSubTab] = useState<'ranks' | 'frames' | 'titles' | 'name_effects' | 'chat' | 'db_tools'>('frames');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // State for editing
    const [editingRank, setEditingRank] = useState<Partial<Rank> | null>(null);
    const [editingCosmetic, setEditingCosmetic] = useState<Partial<CosmeticItem> | null>(null);
    const [uploadIconFile, setUploadIconFile] = useState<File | null>(null);
    
    // Chat Config State
    const [forbiddenInput, setForbiddenInput] = useState('');

    useEffect(() => {
        if (chatConfig) {
            setForbiddenInput(chatConfig.forbidden_words.join(', '));
        }
    }, [chatConfig]);

    // Helper to check valid UUID
    const isUUID = (str?: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || '');

    // --- RESET SHOP ITEMS ---
    const handleResetShop = async () => {
        if (!confirm("CẢNH BÁO: Thao tác này sẽ XÓA TOÀN BỘ vật phẩm hiện có trong Database và nạp lại danh sách chuẩn (bao gồm 20 hiệu ứng tên mới). Bạn có chắc chắn muốn làm mới không?")) return;
        setIsSaving(true);
        try {
            const res = await fetch('/.netlify/functions/admin-game-config?action=reset', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            const data = await res.json();
            if(!res.ok) throw new Error(data.error);
            showToast(data.message || 'Đã làm mới cửa hàng thành công!', 'success');
            refreshConfig();
        } catch(e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    }

    // --- Ranks Logic ---
    const handleEditRank = (rank: Rank | null) => {
        setEditingRank(rank || { levelThreshold: 0, title: '', color: 'text-gray-400', icon: '' });
        setIsModalOpen(true);
    };

    const saveRank = async () => {
        if (!editingRank) return;
        setIsSaving(true);
        try {
            const dbPayload = {
                id: editingRank.id,
                level_threshold: editingRank.levelThreshold,
                title: editingRank.title,
                color_hex: editingRank.color,
                icon_url: typeof editingRank.icon === 'string' ? editingRank.icon : ''
            };

            const isNewOrLegacy = !editingRank.id || !isUUID(editingRank.id);
            const method = isNewOrLegacy ? 'POST' : 'PUT';
            if (isNewOrLegacy) delete dbPayload.id;

            const res = await fetch('/.netlify/functions/admin-game-config?type=rank', {
                method: method,
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
    const handleEditCosmetic = (cosmetic: CosmeticItem | null, defaultType: 'frame' | 'title' | 'name_effect') => {
        let cosmeticToEdit = cosmetic ? { ...cosmetic } : null;
        
        if (cosmeticToEdit && !cosmeticToEdit.name && cosmeticToEdit.nameKey) {
             cosmeticToEdit.name = t(cosmeticToEdit.nameKey);
        }

        setEditingCosmetic(cosmeticToEdit || { 
            type: defaultType,
            name: '', 
            rarity: 'common', 
            price: 0, 
            unlockCondition: { level: 0 },
            cssClass: defaultType === 'title' ? 'title-basic' : (defaultType === 'name_effect' ? 'name-effect-base' : 'frame-none')
        } as any);
        
        setUploadIconFile(null);
        setIsModalOpen(true);
    };

    const saveCosmetic = async () => {
        if (!editingCosmetic) return;
        setIsSaving(true);
        try {
            let finalIconUrl = editingCosmetic.iconUrl;

            if (uploadIconFile) {
                let finalDataUrl: string;
                if (uploadIconFile.type.toLowerCase().includes('gif')) {
                     finalDataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target?.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(uploadIconFile);
                     });
                } else {
                    const { dataUrl } = await resizeImage(uploadIconFile, 128); 
                    finalDataUrl = dataUrl;
                }

                const uploadRes = await fetch('/.netlify/functions/upload-asset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                    body: JSON.stringify({ image: finalDataUrl, folder: 'icons' }),
                });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok) throw new Error(uploadData.error);
                finalIconUrl = uploadData.url;
            }

            const isNewOrLegacy = !editingCosmetic.id || !isUUID(editingCosmetic.id);
            const method = isNewOrLegacy ? 'POST' : 'PUT';

            const dbPayload = {
                id: isNewOrLegacy ? undefined : editingCosmetic.id,
                type: editingCosmetic.type,
                name: editingCosmetic.name,
                rarity: editingCosmetic.rarity,
                price: editingCosmetic.price,
                css_class: editingCosmetic.cssClass,
                image_url: editingCosmetic.imageUrl,
                icon_url: finalIconUrl,
                unlock_level: editingCosmetic.unlockCondition?.level || 0,
                is_active: true
            };

            const res = await fetch('/.netlify/functions/admin-game-config?type=cosmetic', {
                method: method,
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
        if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn vật phẩm này khỏi Shop?')) return;
        
        if (!isUUID(id)) {
            showToast("Không thể xóa vật phẩm mặc định từ code. Vui lòng sử dụng tính năng 'Làm Mới Shop' để cập nhật Database.", "error");
            return;
        }

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

    const saveChatConfig = async () => {
        setIsSaving(true);
        try {
            const words = forbiddenInput.split(',').map(s => s.trim()).filter(s => s);
            await updateChatConfig({ forbidden_words: words });
            showToast("Đã cập nhật cấu hình chat!", "success");
        } catch(e) {
            showToast("Lỗi khi lưu cấu hình chat.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const getCosmeticList = () => {
        switch(activeSubTab) {
            case 'frames': return frames;
            case 'titles': return titles;
            case 'name_effects': return nameEffects;
            default: return [];
        }
    };

    return (
        <div className="bg-[#12121A]/80 border border-blue-500/20 rounded-2xl shadow-lg p-6">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h3 className="text-2xl font-bold text-blue-400">Quản Lý Shop & Cấu Hình</h3>
                <div className="flex gap-2 overflow-x-auto pb-2 w-full md:w-auto custom-scrollbar">
                     <button onClick={() => setActiveSubTab('frames')} className={`px-3 py-1 rounded whitespace-nowrap ${activeSubTab === 'frames' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400'}`}>Khung Avatar</button>
                     <button onClick={() => setActiveSubTab('titles')} className={`px-3 py-1 rounded whitespace-nowrap ${activeSubTab === 'titles' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400'}`}>Danh Hiệu</button>
                     <button onClick={() => setActiveSubTab('name_effects')} className={`px-3 py-1 rounded whitespace-nowrap ${activeSubTab === 'name_effects' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400'}`}>Hiệu Ứng Tên</button>
                     <button onClick={() => setActiveSubTab('ranks')} className={`px-3 py-1 rounded whitespace-nowrap ${activeSubTab === 'ranks' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400'}`}>Cấp Bậc</button>
                     <button onClick={() => setActiveSubTab('chat')} className={`px-3 py-1 rounded whitespace-nowrap ${activeSubTab === 'chat' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400'}`}>Chat</button>
                     <button onClick={() => setActiveSubTab('db_tools')} className={`px-3 py-1 rounded whitespace-nowrap ${activeSubTab === 'db_tools' ? 'bg-red-500 text-white' : 'bg-white/5 text-gray-400'}`}>Sửa Lỗi DB</button>
                </div>
            </div>

            {/* DB TOOLS TAB */}
            {activeSubTab === 'db_tools' && (
                <div className="space-y-4">
                    <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
                        <h4 className="text-yellow-400 font-bold mb-2 flex items-center gap-2"><i className="ph-fill ph-warning-circle"></i> SỬA LỖI CHAT & KẾT NỐI (BẮT BUỘC)</h4>
                        <p className="text-sm text-gray-300 mb-4">
                            Đoạn mã này sửa lỗi "Infinite Recursion" (Đệ quy vô hạn) khiến bạn không thể gửi tin nhắn hoặc xem người dùng khác.
                        </p>
                        <div className="relative">
                            <pre className="bg-black/50 p-3 rounded-lg text-xs text-green-400 overflow-x-auto font-mono border border-white/10 h-64 custom-scrollbar">
                                {SQL_FIX_SCRIPT}
                            </pre>
                            <button 
                                onClick={() => { navigator.clipboard.writeText(SQL_FIX_SCRIPT); showToast("Đã sao chép SQL!", "success"); }}
                                className="absolute top-2 right-2 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 px-3 py-1 rounded text-xs font-bold"
                            >
                                Sao Chép
                            </button>
                        </div>
                        <div className="mt-4 text-xs text-gray-400">
                            <strong>Hướng dẫn:</strong> Copy đoạn mã trên &rarr; Vào Supabase &rarr; SQL Editor &rarr; Paste &rarr; Run.
                        </div>
                    </div>
                </div>
            )}

            {/* CHAT CONFIG TAB */}
            {activeSubTab === 'chat' && (
                <div className="space-y-4">
                    <div className="bg-white/5 p-4 rounded-lg">
                        <label className="block text-sm font-bold text-gray-300 mb-2">Từ khóa bị cấm (Phân cách bằng dấu phẩy)</label>
                        <textarea 
                            value={forbiddenInput}
                            onChange={e => setForbiddenInput(e.target.value)}
                            className="auth-input min-h-[150px]"
                            placeholder="ví dụ: badword, spam, ..."
                        />
                        <p className="text-xs text-gray-500 mt-2">Hệ thống sẽ tự động chặn tin nhắn chứa các từ này.</p>
                    </div>
                    <button onClick={saveChatConfig} disabled={isSaving} className="themed-button-primary w-full md:w-auto px-6 py-2">
                        {isSaving ? 'Đang lưu...' : 'Lưu Cấu Hình Chat'}
                    </button>
                </div>
            )}

            {/* RANKS TAB */}
            {activeSubTab === 'ranks' && (
                <div>
                    <button onClick={() => handleEditRank(null)} className="themed-button-primary mb-4 px-4 py-2 text-sm">+ {t('creator.settings.admin.gameConfig.buttons.addRank')}</button>
                    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                        {ranks.map(r => (
                            <div key={r.id || r.title} className="flex justify-between items-center p-2 bg-white/5 rounded">
                                <div className="flex gap-3 items-center">
                                    <span className="text-yellow-400 font-bold">Lv.{r.levelThreshold}</span>
                                    <span className="text-sm font-medium text-gray-300">{r.title}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEditRank(r)} className="text-blue-400 text-xs">{t('creator.settings.admin.gameConfig.buttons.edit')}</button>
                                    {r.id && isUUID(r.id) && <button onClick={() => handleDelete(r.id!, 'rank')} className="text-red-400 text-xs">{t('creator.settings.admin.gameConfig.buttons.delete')}</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FRAMES, TITLES & NAME EFFECTS LIST VIEW */}
            {(activeSubTab === 'frames' || activeSubTab === 'titles' || activeSubTab === 'name_effects') && (
                <div>
                    <div className="flex justify-between mb-4 gap-3">
                        <button 
                            onClick={() => handleEditCosmetic(null, activeSubTab === 'frames' ? 'frame' : activeSubTab === 'titles' ? 'title' : 'name_effect')} 
                            className="themed-button-primary px-4 py-2 text-sm flex-grow md:flex-grow-0"
                        >
                            + Thêm Mới
                        </button>
                        
                        {/* RESET BUTTON */}
                        <button onClick={handleResetShop} disabled={isSaving} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg flex items-center gap-2 whitespace-nowrap">
                            <i className="ph-fill ph-arrow-counter-clockwise"></i>
                            {isSaving ? 'Đang xử lý...' : 'Làm Mới Shop (Reset)'}
                        </button>
                    </div>

                    {/* Info Alert */}
                    <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg mb-4 text-xs text-blue-200">
                        <i className="ph-fill ph-info mr-2"></i>
                        Nếu chưa thấy Hiệu Ứng Tên, hãy nhấn nút <strong>"Làm Mới Shop"</strong> để nạp 20 hiệu ứng mặc định vào Database.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                        {getCosmeticList().map(c => (
                            <div key={c.id} className="flex gap-3 p-3 bg-white/5 border border-white/10 rounded-lg items-center hover:border-blue-500/50 transition">
                                <div className="w-14 h-14 bg-black/40 rounded-lg flex items-center justify-center overflow-hidden relative flex-shrink-0">
                                     {c.iconUrl ? (
                                         <img src={c.iconUrl} alt="icon" className="w-10 h-10 object-contain" />
                                     ) : c.imageUrl ? (
                                         <img src={c.imageUrl} className="w-full h-full object-contain" alt="preview"/> 
                                     ) : activeSubTab === 'name_effects' ? (
                                         <div className="text-[8px] overflow-hidden text-center px-1">
                                             <UserName name="ABC" effectId={c.id} user={{ display_name: "ABC", equipped_name_effect_id: c.id }} />
                                         </div>
                                     ) : (
                                         <div className={`text-[10px] text-gray-500 ${c.type === 'frame' ? c.cssClass : ''}`}>CSS</div>
                                     )}
                                </div>
                                <div className="flex-grow min-w-0">
                                    <p className="font-bold text-sm text-white flex items-center gap-2 truncate">
                                        {c.nameKey ? t(c.nameKey) : c.name}
                                        {c.price && c.price > 0 && <span className="bg-yellow-500/20 text-yellow-300 text-[10px] px-1.5 py-0.5 rounded font-mono">{c.price}💎</span>}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[10px] font-bold uppercase px-1.5 rounded border ${c.rarity === 'mythic' ? 'border-red-500 text-red-500' : c.rarity === 'legendary' ? 'border-yellow-500 text-yellow-500' : 'border-gray-500 text-gray-500'}`}>
                                            {c.rarity}
                                        </span>
                                        <span className="text-[10px] text-gray-400">Lv.{c.unlockCondition?.level || 0}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                     <button onClick={() => handleEditCosmetic(c, c.type)} className="p-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30">
                                        <i className="ph-fill ph-pencil-simple"></i>
                                     </button>
                                     <button onClick={() => handleDelete(c.id, 'cosmetic')} className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">
                                        <i className="ph-fill ph-trash"></i>
                                     </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MODAL */}
            {isModalOpen && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={
                    activeSubTab === 'ranks' ? 'Sửa Cấp Bậc' : 
                    (editingCosmetic?.id ? 'Sửa Vật Phẩm Shop' : 'Thêm Vật Phẩm Mới')
                }>
                    {/* Rank Form */}
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
                    
                    {/* Cosmetics Form (Frames & Titles & Name Effects) */}
                    {(activeSubTab === 'frames' || activeSubTab === 'titles' || activeSubTab === 'name_effects') && editingCosmetic && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-sm text-gray-400">{t('creator.settings.admin.gameConfig.form.type')}</label>
                                <select value={editingCosmetic.type} onChange={e => setEditingCosmetic({...editingCosmetic, type: e.target.value as any})} className="auth-input mt-1" disabled>
                                    <option value="frame">Khung Avatar</option>
                                    <option value="title">Danh Hiệu</option>
                                    <option value="name_effect">Hiệu Ứng Tên</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Tên hiển thị</label>
                                <input type="text" value={editingCosmetic.name} onChange={e => setEditingCosmetic({...editingCosmetic, name: e.target.value})} className="auth-input mt-1" placeholder="VD: Huyết Tộc" />
                            </div>
                            <div>
                                <label className="text-sm text-gray-400">Độ hiếm (Quyết định màu sắc viền)</label>
                                <select value={editingCosmetic.rarity} onChange={e => setEditingCosmetic({...editingCosmetic, rarity: e.target.value as any})} className="auth-input mt-1">
                                    <option value="common">Thường (Xám)</option>
                                    <option value="rare">Hiếm (Xanh Dương)</option>
                                    <option value="epic">Sử Thi (Tím)</option>
                                    <option value="legendary">Huyền Thoại (Vàng)</option>
                                    <option value="mythic">Thần Thoại (Đỏ)</option>
                                </select>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-sm text-gray-400">{t('creator.settings.admin.gameConfig.form.unlockLevel')}</label>
                                    <input type="number" value={editingCosmetic.unlockCondition?.level || 0} onChange={e => setEditingCosmetic({...editingCosmetic, unlockCondition: { level: Number(e.target.value) }})} className="auth-input mt-1" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-sm text-yellow-400 font-bold">Giá bán (Kim cương)</label>
                                    <input 
                                        type="number" 
                                        value={editingCosmetic.price || 0} 
                                        onChange={e => setEditingCosmetic({...editingCosmetic, price: Number(e.target.value)})} 
                                        className="auth-input mt-1 border-yellow-500/50 focus:border-yellow-500" 
                                    />
                                </div>
                            </div>
                            
                            {/* Upload Icon Only */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">{t('creator.settings.admin.gameConfig.form.uploadIcon')}</label>
                                <div className="flex gap-2 items-center">
                                    {editingCosmetic.iconUrl && <img src={editingCosmetic.iconUrl} className="w-8 h-8 object-contain bg-black/50 rounded" alt="current icon" />}
                                    <input type="file" accept="image/*" onChange={e => setUploadIconFile(e.target.files?.[0] || null)} className="text-sm text-gray-400" />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-gray-400">CSS Class (Hiệu ứng)</label>
                                <input type="text" value={editingCosmetic.cssClass || ''} onChange={e => setEditingCosmetic({...editingCosmetic, cssClass: e.target.value})} className="auth-input mt-1" placeholder="VD: name-fire" />
                                <p className="text-[10px] text-gray-500 mt-1">Nhập tên class CSS để áp dụng hiệu ứng đặc biệt.</p>
                            </div>
                            
                            <button onClick={saveCosmetic} disabled={isSaving} className="themed-button-primary w-full mt-4">{isSaving ? 'Đang lưu...' : 'Lưu Vật Phẩm'}</button>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
};

export default GameConfigManager;
