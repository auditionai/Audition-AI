
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CHANGELOG_DATA } from '../../constants/changelogData';
import { useTranslation } from '../../hooks/useTranslation';

const SystemMessageManager: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [target, setTarget] = useState<'inbox_all' | 'global'>('inbox_all');

    const handleSend = async (msgContent: string = message) => {
        if (!msgContent.trim()) {
            showToast(t('creator.settings.admin.broadcast.errorMsg'), 'error');
            return;
        }
        if (!confirm(target === 'inbox_all' ? t('creator.settings.admin.broadcast.confirmInbox') : t('creator.settings.admin.broadcast.confirmGlobal'))) {
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
                body: JSON.stringify({ message: msgContent, target }),
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            showToast(data.message, 'success');
            if (msgContent === message) setMessage(''); // Clear input if manual send
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="bg-[#12121A]/80 border border-pink-500/20 rounded-2xl shadow-lg p-6">
            <h3 className="text-2xl font-bold mb-6 text-pink-400 flex items-center gap-2">
                <i className="ph-fill ph-megaphone"></i> {t('creator.settings.admin.broadcast.title')}
            </h3>
            
            <div className="space-y-6">
                {/* Target Selection */}
                <div className="flex gap-4">
                    <button 
                        onClick={() => setTarget('inbox_all')}
                        className={`flex-1 py-4 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-3 ${target === 'inbox_all' ? 'border-blue-500 bg-blue-500/20 text-blue-300 shadow-lg shadow-blue-500/20' : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'}`}
                    >
                        <i className="ph-fill ph-envelope-open text-2xl"></i>
                        <div className="text-left">
                            <div className="font-bold text-base">{t('creator.settings.admin.broadcast.target.inbox')}</div>
                            <div className="text-xs opacity-70">{t('creator.settings.admin.broadcast.target.inboxDesc')}</div>
                        </div>
                    </button>
                    
                    <button 
                        onClick={() => setTarget('global')}
                        className={`flex-1 py-4 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-3 ${target === 'global' ? 'border-yellow-500 bg-yellow-500/20 text-yellow-300 shadow-lg shadow-yellow-500/20' : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'}`}
                    >
                        <i className="ph-fill ph-chats-circle text-2xl"></i>
                        <div className="text-left">
                            <div className="font-bold text-base">{t('creator.settings.admin.broadcast.target.global')}</div>
                            <div className="text-xs opacity-70">{t('creator.settings.admin.broadcast.target.globalDesc')}</div>
                        </div>
                    </button>
                </div>

                {/* Manual Message Input */}
                <div className="bg-black/20 p-4 rounded-xl border border-white/10">
                    <label className="block text-sm font-bold text-gray-300 mb-2">{t('creator.settings.admin.broadcast.manualTitle')}</label>
                    <textarea 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={target === 'inbox_all' 
                            ? t('creator.settings.admin.broadcast.placeholderInbox') 
                            : t('creator.settings.admin.broadcast.placeholderGlobal')}
                        className="auth-input min-h-[100px] text-base mb-3"
                    />
                    <div className="flex justify-end">
                        <button 
                            onClick={() => handleSend()}
                            disabled={isSending || !message.trim()}
                            className="themed-button-primary px-6 py-2 font-bold flex items-center gap-2 disabled:opacity-50 text-sm"
                        >
                            {isSending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <i className="ph-fill ph-paper-plane-right"></i>}
                            {t('creator.settings.admin.broadcast.sendButton')}
                        </button>
                    </div>
                </div>

                {/* Changelog History */}
                <div className="border-t border-white/10 pt-6">
                    <h4 className="font-bold text-white mb-4 flex items-center gap-2">
                        <i className="ph-fill ph-clock-counter-clockwise text-cyan-400"></i>
                        {t('creator.settings.admin.broadcast.historyTitle')}
                    </h4>
                    <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                        {CHANGELOG_DATA.map((log) => (
                            <div key={log.id} className="flex items-start justify-between p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/20 transition-colors group">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-pink-500/20 text-pink-300 text-[10px] font-bold px-2 py-0.5 rounded">{log.version}</span>
                                        <span className="text-gray-400 text-xs">{log.date}</span>
                                    </div>
                                    <p className="text-sm font-bold text-white">{t(log.title)}</p>
                                    <p className="text-xs text-gray-400 line-clamp-1">{t(log.description)}</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        const content = `[UPDATE ${log.version}] ${t(log.title)}\n\n${t(log.description)}`;
                                        handleSend(content);
                                    }}
                                    disabled={isSending}
                                    className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-bold rounded border border-cyan-500/30 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                                >
                                    {t('creator.settings.admin.broadcast.resend')}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                
                <p className="text-xs text-gray-500 italic text-center">
                    {t('creator.settings.admin.broadcast.note')}
                </p>
            </div>
        </div>
    );
};

export default SystemMessageManager;
