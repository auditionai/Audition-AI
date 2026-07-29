/**
 * About View (Mobile V2)
 */
import { Bot, BrainCircuit, Film, Info, Sparkles, Video, WandSparkles, Zap } from 'lucide-react';

const coreModels = [
  {
    name: 'GPT 2',
    description: 'Mô hình tạo ảnh và hiểu yêu cầu hình ảnh nâng cao.',
    Icon: Bot,
    color: 'text-blue-600 bg-blue-500/10',
  },
  {
    name: 'Nano Banana 2',
    description: 'Mô hình tạo ảnh nhanh, tối ưu cho tác vụ hằng ngày.',
    Icon: Sparkles,
    color: 'text-cyan-600 bg-cyan-500/10',
  },
  {
    name: 'Nano Banana Pro',
    description: 'Mô hình ảnh chất lượng cao cho chi tiết và bố cục phức tạp.',
    Icon: WandSparkles,
    color: 'text-purple-600 bg-purple-500/10',
  },
  {
    name: 'Grok',
    description: 'Mô hình AI hỗ trợ phân tích ý tưởng và nội dung sáng tạo.',
    Icon: BrainCircuit,
    color: 'text-rose-600 bg-rose-500/10',
  },
  {
    name: 'Seedance 2.0',
    description: 'Mô hình tạo video AI với chuyển động tự nhiên.',
    Icon: Film,
    color: 'text-orange-600 bg-orange-500/10',
  },
  {
    name: 'Kling 3.0',
    description: 'Mô hình video AI chất lượng cao và chuyển động điện ảnh.',
    Icon: Video,
    color: 'text-indigo-600 bg-indigo-500/10',
  },
];

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
          <ul className="grid gap-3">
            {coreModels.map(({ name, description, Icon, color }) => (
              <li key={name} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-zinc-400">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-2 pt-2 text-center">
          <p className="text-xs text-gray-500 dark:text-zinc-400">© 2026 AUDITION AI Photo Studio. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
