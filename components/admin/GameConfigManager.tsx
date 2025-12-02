
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGameConfig } from '../../contexts/GameConfigContext';
import { useChat } from '../../contexts/ChatContext';
import { CosmeticItem, Rank } from '../../types';
import Modal from '../common/Modal';
import { resizeImage } from '../../utils/imageUtils';
import { useTranslation } from '../../hooks/useTranslation';
import UserName from '../common/UserName';

// UPDATED SQL SCRIPT TO FIX INFINITE RECURSION (FINAL FIX)
const SQL_FIX_SCRIPT = `-- SỬA LỖI ĐỆ QUY RLS (INFINITE RECURSION) - PHIÊN BẢN TRIỆT ĐỂ

-- 1. XÓA SẠCH CÁC POLICY CŨ (Để tránh xung đột)
-- Conversations
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "allow_select_conv" ON conversations;
DROP POLICY IF EXISTS "Enable read access for all users" ON conversations;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON conversations;

-- Participants
DROP POLICY IF EXISTS "Users can view participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can insert themselves" ON conversation_participants;
DROP POLICY IF EXISTS "allow_select_part" ON conversation_participants;
DROP POLICY IF EXISTS "allow_insert_part" ON conversation_participants;
DROP POLICY IF EXISTS "Enable read access for all users" ON conversation_participants;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON conversation_participants;

-- Messages
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON direct_messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON direct_messages;
DROP POLICY IF EXISTS "Users can view messages" ON direct_messages;
DROP POLICY IF EXISTS "Users can send messages" ON direct_messages;
DROP POLICY IF EXISTS "allow_all_msg" ON direct_messages;
DROP POLICY IF EXISTS "Enable read access for all users" ON direct_messages;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON direct_messages;

-- 2. TẠO HÀM HELPER "QUYỀN ADMIN" (SECURITY DEFINER)
-- Hàm này chạy với quyền chủ sở hữu (postgres), bỏ qua RLS, giúp phá vỡ vòng lặp.
CREATE OR REPLACE FUNCTION is_chat_participant(lookup_conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER 
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversation_participants
    WHERE conversation_id = lookup_conv_id
    AND user_id = (select auth.uid())
  );
$$;

-- 3. THIẾT LẬP POLICY MỚI (Sử dụng hàm trên)

-- Bảng: conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Conversations: View Own" ON conversations
FOR SELECT USING (
  is_chat_participant(id)
);

CREATE POLICY "Conversations: Create" ON conversations
FOR INSERT WITH CHECK ( true ); 

-- Bảng: conversation_participants
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants: View Group" ON conversation_participants
FOR SELECT USING (
  is_chat_participant(conversation_id) -- Ai trong nhóm thì thấy được các thành viên khác
);

CREATE POLICY "Participants: Insert" ON conversation_participants
FOR INSERT WITH CHECK (
  user_id = auth.uid() -- Tự thêm mình
  OR is_chat_participant(conversation_id) -- Hoặc thêm người khác nếu mình đã ở trong nhóm
);

-- Bảng: direct_messages
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages: View Own" ON direct_messages
FOR SELECT USING (
  is_chat_participant(conversation_id)
);

CREATE POLICY "Messages: Send" ON direct_messages
FOR INSERT WITH CHECK (
  is_chat_participant(conversation_id)
  AND sender_id = auth.uid()
);

-- 4. CẤP QUYỀN THỰC THI
GRANT EXECUTE ON FUNCTION is_chat_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_chat_participant(uuid) TO service_role;

-- 5. CẬP NHẬT HÀM TẠO CHAT (RPC)
CREATE OR REPLACE FUNCTION get_or_create_conversation(target_user_id UUID)
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
  
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Tìm hội thoại chung
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

  -- Tạo mới
  INSERT INTO conversations (created_at, updated_at) VALUES (NOW(), NOW()) RETURNING id INTO conv_id;
  INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv_id, current_user_id);
  INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv_id, target_user_id);

  RETURN conv_id;
END;
$$;

SELECT 'Sửa lỗi thành công! (Clean Install)' as status;
`;

const SQL_SYSTEM_SETTINGS = `-- TẠO BẢNG CÀI ĐẶT HỆ THỐNG (SYSTEM SETTINGS)

CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Public Read (Everyone can read settings like video url)
DROP POLICY IF EXISTS "Public Read Settings" ON public.system_settings;
CREATE POLICY "Public Read Settings" ON public.system_settings
    FOR SELECT USING (true);

-- Policy: Admin Write (Optional, if using service role key this is bypassed)
DROP POLICY IF EXISTS "Admin Full Access" ON public.system_settings;
CREATE POLICY "Admin Full Access" ON public.system_settings
    FOR ALL USING ( (SELECT is_admin FROM users WHERE id = auth.uid()) = true );
`;

const GameConfigManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const { refreshConfig, ranks, frames, titles, nameEffects } = useGameConfig();
    const { chatConfig, updateChatConfig } = useChat();
    
    // Tabs
    const [activeSubTab, setActiveSubTab] = useState<'ranks' | 'frames' | 'titles' | 'name_effects' | 'chat' | 'db_tools' | 'system'>('frames');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // Sorting State
    const [sortType, setSortType] = useState<'price_asc' | 'price_desc' | 'level_asc' | 'level_desc' | 'rarity'>('price_asc');

    // State for editing
    const [editingRank, setEditingRank] = useState<Partial<Rank> | null>(null);
    const [editingCosmetic, setEditingCosmetic] = useState<Partial<CosmeticItem> | null>(null);
    const [uploadIconFile, setUploadIconFile] = useState<File | null>(null);
    
    // Chat Config State
    const [forbiddenInput, setForbiddenInput] = useState('');

    // System Settings State
    const [videoUrls, setVideoUrls] = useState({
        single: '',
        group: '',
        comic: ''
    });

    useEffect(() => {
        if (chatConfig) {
            setForbiddenInput(chatConfig.forbidden_words.join(', '));
        }
    }, [chatConfig]);

    // Fetch System Settings
    useEffect(() => {
        const fetchSettings = async () => {
            if (activeSubTab === 'system') {
                try {
                    const res = await fetch('/.netlify/functions/admin-system-settings');
                    if (res.ok) {
                        const data = await res.json();
                        setVideoUrls({
                            single: data.tutorial_video_single || '',
                            group: data.tutorial_video_group || '',
                            comic: data.tutorial_video_comic || ''
                        });
                    }
                } catch (e) { console.error(e); }
            }
        };
        fetchSettings();
    }, [activeSubTab]);

    // Helper to check valid UUID
    const isUUID = (str?: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || '');

    // --- RESET SHOP ITEMS ---
    const handleResetShop = async () => {
        if (!confirm("CẢNH BÁO: Thao tác này sẽ XÓA TOÀN BỘ vật phẩm hiện có trong Database và nạp lại danh sách chuẩn (không có yêu cầu Level, ngoại trừ Legendary/Mythic). Bạn có chắc chắn muốn làm mới không?")) return;
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

    const saveSystemSettings = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/.netlify/functions/admin-system-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ 
                    settings: { 
                        tutorial_video_single: videoUrls.single,
                        tutorial_video_group: videoUrls.group,
                        tutorial_video_comic: videoUrls.comic
                    } 
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed');
            }
            showToast(t('creator.settings.admin.system.success'), 'success');
        } catch(e: any) {
            if (e.message && e.message.includes('relation "public.system_settings" does not exist')) {
                showToast("Lỗi: Bảng system_settings chưa được tạo. Hãy chạy SQL trong tab 'Sửa lỗi DB'.", 'error');
            } else {
                showToast(t('creator.settings.admin.system.error') + ': ' + e.message, 'error');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const getCosmeticList = () => {
        let list: CosmeticItem[] = [];
        switch(activeSubTab) {
            case 'frames': list = [...frames]; break;
            case 'titles': list = [...titles]; break;
            case 'name_effects': list = [...nameEffects]; break;
            default: return [];
        }

        // SORTING LOGIC
        return list.sort((a, b) => {
            switch (sortType) {
                case 'price_asc': return (a.price || 0) - (b.price || 0);
                case 'price_desc': return (b.price || 0) - (a.price || 0);
                case 'level_asc': return (a.unlockCondition?.level || 0) - (b.unlockCondition?.level || 0);
                case 'level_desc': return (b.unlockCondition?.level || 0) - (a.unlockCondition?.level || 0);
                case 'rarity': {
                    const rarityOrder = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
                    return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
                }
                default: return 0;
            }
        });
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
                     <button onClick={() => setActiveSubTab('system')} className={`px-3 py-1 rounded whitespace-nowrap ${activeSubTab === 'system' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400'}`}>Cài đặt chung</button>
                     <button onClick={() => setActiveSubTab('db_tools')} className={`px-3 py-1 rounded whitespace-nowrap ${activeSubTab === 'db_tools' ? 'bg-red-500 text-white' : 'bg-white/5 text-gray-400'}`}>Sửa Lỗi DB</button>
                </div>
            </div>

            {/* DB TOOLS TAB */}
            {activeSubTab === 'db_tools' && (
                <div className="space-y-4">
                    <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
                        <h4 className="text-yellow-400 font-bold mb-2 flex items-center gap-2"><i className="ph-fill ph-warning-circle"></i> SỬA LỖI CHAT (RLS FIX)</h4>
                        <div className="relative">
                            <pre className="bg-black/50 p-3 rounded-lg text-xs text-green-400 overflow-x-auto font-mono border border-white/10 h-32 custom-scrollbar">
                                {SQL_FIX_SCRIPT}
                            </pre>
                            <button onClick={() => { navigator.clipboard.writeText(SQL_FIX_SCRIPT); showToast("Đã sao chép!", "success"); }} className="absolute top-2 right-2 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 px-3 py-1 rounded text-xs font-bold">Copy</button>
                        </div>
                    </div>

                     <div className="bg-cyan-500/10 border border-cyan-500/30 p-4 rounded-lg">
                        <h4 className="text-cyan-400 font-bold mb-2 flex items-center gap-2"><i className="ph-fill ph-gear"></i> TẠO BẢNG SETTINGS</h4>
                        <div className="relative">
                            <pre className="bg-black/50 p-3 rounded-lg text-xs text-green-400 overflow-x-auto font-mono border border-white/10 h-32 custom-scrollbar">
                                {SQL_SYSTEM_SETTINGS}
                            </pre>
                            <button onClick={() => { navigator.clipboard.writeText(SQL_SYSTEM_SETTINGS); showToast("Đã sao chép!", "success"); }} className="absolute top-2 right-2 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 px-3 py-1 rounded text-xs font-bold">Copy</button>
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

            {/* SYSTEM SETTINGS TAB */}
            {activeSubTab === 'system' && (
                <div className="space-y-4">
                    <h4 className="text-xl font-bold text-white mb-2">{t('creator.settings.admin.system.title')}</h4>
                    <div className="bg-white/5 p-4 rounded-lg space-y-4">
                        <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg mb-2 text-xs text-yellow-200 flex justify-between items-center">
                            <span><i className="ph-fill ph-info mr-1"></i> Nếu không lưu được, vui lòng chạy SQL tạo bảng.</span>
                            <button 
                                onClick={() => { navigator.clipboard.writeText(SQL_SYSTEM_SETTINGS); showToast("Đã sao chép SQL!", "success"); }}
                                className="bg-yellow-500 hover:bg-yellow-600 text-black px-3 py-1 rounded font-bold text-xs"
                            >
                                Copy SQL Cài Đặt
                            </button>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">Video Hướng Dẫn: Tạo Ảnh Đơn</label>
                            <input 
                                type="text"
                                value={videoUrls.single}
                                onChange={e => setVideoUrls({...videoUrls, single: e.target.value})}
                                className="auth-input"
                                placeholder={t('creator.settings.admin.system.placeholderVideo')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">Video Hướng Dẫn: Studio Nhóm</label>
                            <input 
                                type="text"
                                value={videoUrls.group}
                                onChange={e => setVideoUrls({...videoUrls, group: e.target.value})}
                                className="auth-input"
                                placeholder={t('creator.settings.admin.system.placeholderVideo')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">Video Hướng Dẫn: Comic Studio</label>
                            <input 
                                type="text"
                                value={videoUrls.comic}
                                onChange={e => setVideoUrls({...videoUrls, comic: e.target.value})}
                                className="auth-input"
                                placeholder={t('creator.settings.admin.system.placeholderVideo')}
                            />
                        </div>
                    </div>
                    <button onClick={saveSystemSettings} disabled={isSaving} className="themed-button-primary w-full md:w-auto px-6 py-2">
                        {isSaving ? 'Đang lưu...' : t('creator.settings.admin.system.save')}
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
                    <div className="flex flex-col md:flex-row justify-between mb-4 gap-3">
                        <button 
                            onClick={() => handleEditCosmetic(null, activeSubTab === 'frames' ? 'frame' : activeSubTab === 'titles' ? 'title' : 'name_effect')} 
                            className="themed-button-primary px-4 py-2 text-sm flex-grow md:flex-grow-0"
                        >
                            + Thêm Mới
                        </button>
                        
                        <div className="flex gap-2">
                            {/* Sorting Dropdown */}
                            <select 
                                value={sortType} 
                                onChange={(e) => setSortType(e.target.value as any)}
                                className="bg-black/30 text-white border border-white/10 rounded px-3 py-2 text-sm focus:outline-none"
                            >
                                <option value="price_asc">Giá: Thấp &rarr; Cao</option>
                                <option value="price_desc">Giá: Cao &rarr; Thấp</option>
                                <option value="level_asc">Level: Thấp &rarr; Cao</option>
                                <option value="level_desc">Level: Cao &rarr; Thấp</option>
                                <option value="rarity">Độ hiếm</option>
                            </select>

                            {/* RESET BUTTON */}
                            <button onClick={handleResetShop} disabled={isSaving} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg flex items-center gap-2 whitespace-nowrap">
                                <i className="ph-fill ph-arrow-counter-clockwise"></i>
                                {isSaving ? '...' : 'Làm Mới Shop'}
                            </button>
                        </div>
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
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="bg-yellow-500/20 text-yellow-300 text-xs px-2 py-0.5 rounded font-bold font-mono border border-yellow-500/30">
                                            {c.price || 0} 💎
                                        </span>
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
                                        className="auth-input mt-1" 
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
