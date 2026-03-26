/**
 * About View (Mobile)
 */
import { Sparkles, Info, Zap, Image as ImageIcon } from 'lucide-react';

export function About() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] pb-28 animate-fade-in text-gray-900 dark:text-white">
      {/* Header */}
      <div className="bg-white dark:bg-[#18181B] px-4 py-8 text-center border-b border-gray-100 dark:border-zinc-800 shadow-sm">
        <div className="w-16 h-16 bg-gradient-to-tr from-purple-500 to-blue-500 rounded-[20px] mx-auto flex items-center justify-center shadow-lg mb-4">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Audition AI Studio</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Ứng dụng tạo ảnh game AUDITION AI 2026</p>
        <span className="inline-block px-3 py-1 bg-gray-50 dark:bg-zinc-800 rounded-full text-xs font-bold font-mono text-gray-500 dark:text-zinc-400 mt-3">Design by CodyCN</span>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white dark:bg-[#18181B] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800">
          <h2 className="text-sm font-bold flex items-center gap-2 mb-3 text-gray-900 dark:text-white border-b border-gray-100 dark:border-zinc-800 pb-2">
            <Info className="w-4 h-4 text-purple-500" />
            Mục tiêu phát triển Audition AI
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed text-justify">
            AUDITION AI STUDIO được thiết kế và phát triển bởi CodyCN là ứng dụng tạo ảnh AUDITION AI dành cho game thủ AUDITION yêu thích sự sáng tạo và nghệ thuật, có đam mê làm ảnh AUDITION AI.
          </p>
        </div>

        <div className="bg-white dark:bg-[#18181B] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800">
          <h2 className="text-sm font-bold flex items-center gap-2 mb-3 text-gray-900 dark:text-white border-b border-gray-100 dark:border-zinc-800 pb-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            Công nghệ cốt lõi
          </h2>
          <ul className="space-y-3">
            <li className="flex gap-3">
              <div className="p-2 shrink-0 h-8 w-8 bg-blue-500/10 rounded-lg text-blue-500 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">Google Gemini 3 Pro</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Mô hình tạo ảnh AI mới nhất.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="p-2 shrink-0 h-8 w-8 bg-purple-500/10 rounded-lg text-purple-500 flex items-center justify-center">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">Kling Video 3.0</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Mô hình tạo video AI mới nhất.</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="px-2 pt-2 text-center">
          <p className="text-xs text-gray-500 dark:text-zinc-400">© 2026 AUDITION AI Photo Studio. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
