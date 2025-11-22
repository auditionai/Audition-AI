
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGameConfig } from '../../contexts/GameConfigContext';
import { useChat } from '../../contexts/ChatContext';
import { CosmeticItem, Rank } from '../../types';
import Modal from '../common/Modal';
import { resizeImage } from '../../utils/imageUtils';
import { useTranslation } from '../../hooks/useTranslation';
import UserName from '../common/UserName';

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

    const sqlFixScript = `-- SCRIPT SỬA LỖI TIN NHẮN & TẠO BOT HỆ THỐNG (UPDATE)

-- 1. BẬT CHẾ ĐỘ XEM CÔNG KHAI CHO BẢNG USERS
-- Điều này rất quan trọng để mọi người có thể thấy tên và avatar của nhau (kể cả Bot)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Xóa policy cũ nếu có để tránh lỗi
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;

-- Tạo policy mới: Ai cũng có thể xem (SELECT) thông tin user khác (cần thiết cho Chat)
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.users FOR SELECT 
USING (true);

-- Policy cập nhật: Chỉ chủ sở hữu mới được sửa
CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE 
USING (auth.uid() = id);

-- 2. TẠO USER "HỆ THỐNG" (BOT)
-- User này sẽ dùng để gửi tin nhắn tự động
INSERT INTO public.users (id, email, display_name, photo_url, diamonds, xp, level)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'system@auditionai.io.vn',
    'HỆ THỐNG',
    'https://api.dicebear.com/7.x/bottts/svg?seed=System',
    999999,
    999999,
    999
) ON CONFLICT (id) DO NOTHING;

-- 3. ĐẢM BẢO CÁC BẢNG CHAT TỒN TẠI VÀ CÓ QUYỀN
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT,
    type TEXT DEFAULT 'text',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bật RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Xóa policy cũ của chat
DROP POLICY IF EXISTS "Users can view conversations they are in" ON public.conversations;
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.direct_messages;
DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON public.direct_messages;

-- Tạo lại Policy chuẩn
-- 1. Conversations
CREATE POLICY "Users can view conversations they are in" ON public.conversations
FOR SELECT USING (
    exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = conversations.id
        and cp.user_id = auth.uid()
    )
);

-- 2. Participants
CREATE POLICY "Users can view participants of their conversations" ON public.conversation_participants
FOR SELECT USING (
    exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = conversation_participants.conversation_id
        and cp.user_id = auth.uid()
    )
);

-- 3. Messages (View)
CREATE POLICY "Users can view messages in their conversations" ON public.direct_messages
FOR SELECT USING (
    exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = direct_messages.conversation_id
        and cp.user_id = auth.uid()
    )
);

-- 4. Messages (Insert)
CREATE POLICY "Users can insert messages in their conversations" ON public.direct_messages
FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = direct_messages.conversation_id
        and cp.user_id = auth.uid()
    )
);

-- Cấp quyền cho Service Role (cho các hàm Admin chạy nền)
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.conversation_participants TO service_role;
GRANT ALL ON public.direct_messages TO service_role;

-- Refresh Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'direct_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;

SELECT 'Sửa lỗi thành công! Đã tạo Bot Hệ Thống và mở quyền xem Profile.' as ket_qua;
`;

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
                        <h4 className="text-yellow-400 font-bold mb-2 flex items-center gap-2"><i className="ph-fill ph-warning-circle"></i> Cập Nhật Database (BẮT BUỘC)</h4>
                        <p className="text-sm text-gray-300 mb-4">
                            Để sửa lỗi <strong>"Gửi tin nhắn thành công nhưng người khác không nhận được"</strong>, bạn phải chạy đoạn mã SQL này. Nó sẽ tạo User Hệ Thống và mở quyền xem Profile công khai.
                        </p>
                        <div className="relative">
                            <pre className="bg-black/50 p-3 rounded-lg text-xs text-green-400 overflow-x-auto font-mono border border-white/10 h-64 custom-scrollbar">
                                {sqlFixScript}
                            </pre>
                            <button 
                                onClick={() => { navigator.clipboard.writeText(sqlFixScript); showToast("Đã sao chép SQL!", "success"); }}
                                className="absolute top-2 right-2 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 px-3 py-1 rounded text-xs font-bold"
                            >
                                Sao Chép
                            </button>
                        </div>
                        <div className="mt-4 text-xs text-gray-400">
                            <strong>Hướng dẫn thực hiện:</strong>
                            <ol className="list-decimal list-inside mt-1 space-y-1">
                                <li>Đăng nhập <a href="https://supabase.com/dashboard" target="_blank" className="text-blue-400 underline">Supabase Dashboard</a>.</li>
                                <li>Chọn Project của bạn.</li>
                                <li>Bấm vào biểu tượng <strong>SQL Editor</strong> ở thanh bên trái.</li>
                                <li>Bấm <strong>New Query</strong>.</li>
                                <li>Dán đoạn code trên vào và bấm <strong>Run</strong>.</li>
                            </ol>
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
                                    <span className={r.color}>{r.title}</span>
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
                                    <input type="number" value={editingCosmetic.price || 0} onChange={e => setEditingCosmetic({...editingCosmetic, price: Number(e.target.value)})} className="auth-input mt-1 border-yellow-500/50 focus:border-yellow-500" />
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
