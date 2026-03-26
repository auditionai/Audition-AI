/**
 * Support View (Mobile)
 */
import { Heart, Phone, Mail, MessageCircle, MonitorSmartphone } from 'lucide-react';

export function Support() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] pb-28 animate-fade-in">
      {/* Header */}
      <div className="bg-white dark:bg-[#18181B] px-4 py-8 text-center border-b border-gray-100 dark:border-zinc-800 shadow-sm">
        <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 rounded-full mx-auto flex items-center justify-center mb-3">
          <Heart className="w-6 h-6 text-red-500 fill-current" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Hỗ trợ & Liên hệ</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1 max-w-[280px] mx-auto">
          Kết nối với nhà phát triển để được trợ giúp hoặc hợp tác.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Support contacts */}
        <div className="bg-white dark:bg-[#18181B] rounded-2xl p-2 shadow-sm border border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:bg-zinc-800 active:bg-gray-100 dark:bg-zinc-800/50 rounded-xl transition-colors">
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-zinc-400">Email Hỗ trợ</p>
              <a href="mailto:support@auditionai.io.vn" className="text-sm font-bold text-gray-900 dark:text-white">support@auditionai.io.vn</a>
            </div>
          </div>
          <div className="h-px bg-[var(--color-border)] mx-4" />
          <div className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:bg-zinc-800 active:bg-gray-100 dark:bg-zinc-800/50 rounded-xl transition-colors">
            <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center text-green-500 shrink-0">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-zinc-400">Hotline</p>
              <a href="tel:+84824280497" className="text-sm font-bold text-gray-900 dark:text-white">0824.280.497</a>
            </div>
          </div>
          <div className="h-px bg-[var(--color-border)] mx-4" />
          <a href="https://zalo.me/g/1qg1zchu1pbspz7elple" target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-500/10 m-2 rounded-xl active:opacity-80 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-700 dark:text-blue-400">Cộng đồng Zalo</p>
                <p className="text-[10px] text-blue-500">Tham gia nhóm hỗ trợ trực tuyến</p>
              </div>
            </div>
          </a>
          <div className="h-px bg-[var(--color-border)] mx-4" />
          <a href="https://m.me/cm/AbZT2-fW9wJlrX7M" target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-500/10 m-2 rounded-xl active:opacity-80 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0">
                <MonitorSmartphone className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-800 dark:text-blue-500">Cộng đồng Facebook</p>
                <p className="text-[10px] text-blue-600">Trang chủ nhóm Audition AI</p>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
