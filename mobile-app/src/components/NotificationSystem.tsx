/**
 * Mobile Notification System
 * Ported from desktop /components/NotificationSystem.tsx
 * Provides toast notifications and confirm dialogs styled for mobile
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Check, X, Info, Flame, Trash2, Bell } from 'lucide-react';

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

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmModal, setConfirmModal] = useState<(ConfirmOptions & { isOpen: boolean }) | null>(null);

  const notify = useCallback((message: string, type: NotificationType = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmModal({ ...options, isOpen: true });
  }, []);

  const closeConfirm = () => setConfirmModal(null);
  const handleConfirm = () => {
    confirmModal?.onConfirm?.();
    closeConfirm();
  };
  const handleCancel = () => {
    confirmModal?.onCancel?.();
    closeConfirm();
  };

  const getToastColors = (type: NotificationType) => {
    switch (type) {
      case 'success': return 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-800';
      case 'error': return 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-800';
      case 'warning': return 'bg-amber-50 border-amber-200 text-amber-800';
      default: return 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-800';
    }
  };

  const getToastIcon = (type: NotificationType) => {
    switch (type) {
      case 'success': return <Check className="w-5 h-5 text-green-600" />;
      case 'error': return <X className="w-5 h-5 text-red-600" />;
      case 'warning': return <Flame className="w-5 h-5 text-amber-600" />;
      default: return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  return (
    <NotificationContext.Provider value={{ notify, confirm }}>
      {children}

      {/* Toast Container - Top center for mobile */}
      <div className="fixed top-4 left-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-md mx-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-lg animate-slide-down ${getToastColors(t.type)}`}
            style={{ animation: 'slideDown 0.3s ease-out' }}
          >
            <div className="shrink-0">{getToastIcon(t.type)}</div>
            <p className="flex-1 text-sm font-medium leading-tight">{t.message}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleCancel} />
          <div className="relative bg-white dark:bg-[#18181B] rounded-3xl max-w-sm w-full shadow-2xl p-6 animate-slide-up">
            <div className="w-14 h-14 mx-auto bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
              {confirmModal.isDanger ? (
                <Trash2 className="w-7 h-7 text-red-500" />
              ) : (
                <Bell className="w-7 h-7 text-amber-500" />
              )}
            </div>

            <h3 className="text-lg font-bold text-center mb-2">
              {confirmModal.title || 'Xác nhận'}
            </h3>

            <p className="text-gray-500 dark:text-zinc-400 text-center text-sm mb-6 leading-relaxed">
              {confirmModal.message}
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-200 font-semibold transition-colors text-sm"
              >
                {confirmModal.cancelText || 'Hủy'}
              </button>
              <button
                onClick={handleConfirm}
                className={`flex-1 py-3 rounded-2xl font-semibold text-white shadow-lg transition-all text-sm ${
                  confirmModal.isDanger
                    ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
                    : 'bg-black hover:bg-gray-800 shadow-gray-300'
                }`}
              >
                {confirmModal.confirmText || 'Đồng ý'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slideUp 0.3s ease-out; }
      `}</style>
    </NotificationContext.Provider>
  );
}
