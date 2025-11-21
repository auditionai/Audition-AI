
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';

const SystemMessageManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [target, setTarget] = useState<'inbox_all' | 'global'>('inbox_all');

    const handleSend = async () => {
        if (!message.trim()) {
            showToast('Vui lòng nhập nội dung tin nhắn.', 'error');
            return;
        }
        if (!confirm(target === 'inbox_all' ? 'Bạn chắc chắn muốn gửi tin nhắn này đến Hộp thư của TẤT CẢ người dùng?' : 'Bạn chắc chắn muốn gửi thông báo lên kênh Chat Thế Giới?')) {
            return;
        }

        setIsSending(true);
        try {
            const res = await fetch('/.netlify/functions/admin-broadcast', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ message, target }),
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            showToast(data.message, 'success');
            setMessage(''); // Clear input
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="bg-[#12121A]/80 border border-pink-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-4 text-pink-400 flex items-center gap-2">
                <i className="ph-fill ph-megaphone"></i> Gửi Thông Báo Hệ Thống
            </h3>
            
            <div className="space-y-4">
                {/* Target Selection */}
                <div className="flex gap-4">
                    <button 
                        onClick={() => setTarget('inbox_all')}
                        className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${target === 'inbox_all' ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-white/10 bg-white/5 text-gray-400'}`}
                    >
                        <i className="ph-fill ph-envelope-open"></i>
                        <div className="text-left">
                            <div className="font-bold text-sm">Gửi Hộp Thư (Inbox)</div>
                            <div className="text-[10px] opacity-70">Gửi riêng cho tất cả User</div>
                        </div>
                    </button>
                    
                    <button 
                        onClick={() => setTarget('global')}
                        className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${target === 'global' ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-white/10 bg-white/5 text-gray-400'}`}
                    >
                        <i className="ph-fill ph-chats-circle"></i>
                        <div className="text-left">
                            <div className="font-bold text-sm">Kênh Chat Thế Giới</div>
                            <div className="text-[10px] opacity-70">Hiển thị màu vàng nổi bật</div>
                        </div>
                    </button>
                </div>

                {/* Message Input */}
                <div>
                    <label className="block text-sm font-bold text-gray-300 mb-2">Nội dung tin nhắn</label>
                    <textarea 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={target === 'inbox_all' 
                            ? "VD: [CẬP NHẬT] Ra mắt tính năng Studio Nhóm mới! Hãy thử ngay..." 
                            : "VD: Server bảo trì trong 5 phút nữa. Vui lòng lưu tác phẩm."}
                        className="auth-input min-h-[120px] text-base"
                    />
                </div>

                {/* Action */}
                <div className="flex justify-end">
                    <button 
                        onClick={handleSend}
                        disabled={isSending || !message.trim()}
                        className="themed-button-primary px-8 py-3 font-bold flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSending ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Đang gửi...
                            </>
                        ) : (
                            <>
                                <i className="ph-fill ph-paper-plane-right"></i>
                                Gửi Thông Báo
                            </>
                        )}
                    </button>
                </div>
                
                <p className="text-xs text-gray-500 mt-4 italic">
                    * Lưu ý: Tin nhắn Inbox sẽ được gửi từ "Hệ thống" (System Bot). Tin nhắn Chat Thế Giới sẽ hiển thị dưới dạng thông báo hệ thống màu vàng.
                </p>
            </div>
        </div>
    );
};

export default SystemMessageManager;
