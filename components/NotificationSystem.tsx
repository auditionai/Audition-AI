
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Icons } from './Icons';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  message: string;
  type: NotificationType;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

interface NotificationContextType {
  notify: (message: string, type?: NotificationType) => void;
  confirm: (options: ConfirmOptions) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // --- TOAST STATE ---
  const [toasts, setToasts] = useState<Toast[]>([]);

  // --- MODAL STATE ---
  const [confirmModal, setConfirmModal] = useState<ConfirmOptions & { isOpen: boolean } | null>(null);

  const notify = useCallback((message: string, type: NotificationType = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto dismiss
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmModal({ ...options, isOpen: true });
  }, []);

  const closeConfirm = () => {
    setConfirmModal(null);
  };

  const handleConfirm = () => {
    if (confirmModal?.onConfirm) confirmModal.onConfirm();
    closeConfirm();
  };

  const handleCancel = () => {
    if (confirmModal?.onCancel) confirmModal.onCancel();
    closeConfirm();
  };

  return (
    <NotificationContext.Provider value={{ notify, confirm }}>
      {children}

      {/* --- TOAST CONTAINER (Top Right) --- */}
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-xl border shadow-[0_5px_15px_rgba(0,0,0,0.5)] animate-slide-in-right backdrop-blur-xl min-w-[300px] max-w-[400px] ${
              t.type === 'success' ? 'bg-[#0f1f12]/95 border-green-500/50 text-green-400' :
              t.type === 'error' ? 'bg-[#1f0f0f]/95 border-red-500/50 text-red-400' :
              t.type === 'warning' ? 'bg-[#1f1f0f]/95 border-yellow-500/50 text-yellow-400' :
              'bg-[#0f151f]/95 border-audi-cyan/50 text-audi-cyan'
            }`}
          >
            <div className={`p-2 rounded-full shrink-0 ${
               t.type === 'success' ? 'bg-green-500/20' :
               t.type === 'error' ? 'bg-red-500/20' :
               t.type === 'warning' ? 'bg-yellow-500/20' :
               'bg-audi-cyan/20'
            }`}>
                {t.type === 'success' && <Icons.Check className="w-5 h-5" />}
                {t.type === 'error' && <Icons.X className="w-5 h-5" />}
                {t.type === 'warning' && <Icons.Flame className="w-5 h-5" />}
                {t.type === 'info' && <Icons.Info className="w-5 h-5" />}
            </div>
            <div className="flex-1">
                <h4 className="font-bold text-sm uppercase tracking-wider mb-0.5">
                    {t.type === 'success' ? 'Thành công' : t.type === 'error' ? 'Thất bại' : 'Thông báo'}
                </h4>
                <p className="text-sm font-medium text-white/90 leading-tight">{t.message}</p>
            </div>
            <button onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))} className="text-white/50 hover:text-white">
                <Icons.X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* --- CONFIRM MODAL OVERLAY (TRANSPARENT GLASS) --- */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 animate-fade-in">
          <div className="bg-[#12121a] border border-white/20 p-6 rounded-3xl max-w-sm w-full shadow-2xl transform scale-100 transition-all">
            
            <div className="w-16 h-16 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                {confirmModal.isDanger ? (
                    <Icons.Trash className="w-8 h-8 text-red-500" />
                ) : (
                    <Icons.Bell className="w-8 h-8 text-audi-yellow animate-swing" />
                )}
            </div>

            <h3 className="text-xl font-game font-bold text-white text-center mb-2">
              {confirmModal.title || 'Xác nhận'}
            </h3>
            
            <p className="text-slate-400 text-center text-sm mb-8 leading-relaxed">
              {confirmModal.message}
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold transition-colors border border-white/5"
              >
                {confirmModal.cancelText || 'Hủy bỏ'}
              </button>
              <button
                onClick={handleConfirm}
                className={`flex-1 py-3 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-105 ${
                    confirmModal.isDanger 
                    ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' 
                    : 'bg-gradient-to-r from-audi-pink to-audi-purple hover:shadow-audi-pink/40'
                }`}
              >
                {confirmModal.confirmText || 'Đồng ý'}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};
