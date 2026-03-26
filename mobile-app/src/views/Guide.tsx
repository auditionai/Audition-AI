/**
 * Guide View (Mobile)
 */
import { Menu, Wand, Zap, Download, Sparkles } from 'lucide-react';

export function Guide() {
  const steps = [
    { title: 'Chọn công cụ', desc: 'Chọn tính năng phục vụ nhu cầu của bạn (Ảnh, Video...).', icon: Menu },
    { title: 'Nhập thông tin', desc: 'Miêu tả chi tiết bằng Prompt hoặc tải ảnh khuôn mặt của bạn.', icon: Wand },
    { title: 'Chờ xử lý', desc: 'AI sẽ sáng tạo và hoàn thành yêu cầu trong 10-30 giây.', icon: Zap },
    { title: 'Tải xuống', desc: 'Lưu kết quả về thiết bị của bạn miễn phí.', icon: Download },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] pb-28 animate-fade-in">
      <div className="bg-white dark:bg-[#18181B] px-4 py-6 text-center border-b border-gray-100 dark:border-zinc-800 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Hướng dẫn sử dụng</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Làm chủ AI trong 4 bước cơ bản.</p>
      </div>

      <div className="p-4 space-y-6">
        <div className="space-y-4 relative">
          <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-gray-100 dark:bg-zinc-800 z-0"></div>
          {steps.map((step, idx) => (
            <div key={idx} className="flex gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#18181B] border-2 border-purple-100 dark:border-purple-500/30 shadow-sm flex items-center justify-center shrink-0">
                <step.icon className="w-5 h-5 text-purple-500" />
              </div>
              <div className="bg-white dark:bg-[#18181B] flex-1 p-3 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm">
                <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Bước {idx + 1}</span>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">{step.title}</h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-4 text-white shadow-md">
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-300" /> Mẹo viết Prompt
          </h2>
          <div className="space-y-3">
            <div className="bg-white dark:bg-[#18181B]/10 rounded-xl p-3">
              <p className="text-xs font-bold mb-1 opacity-90">Chi tiết hơn là tốt hơn!</p>
              <p className="text-xs text-white/80">Thay vì "Cô gái", hãy thử "Cô gái mặc áo dài truyền thống, mỉm cười, phong cách cinematic".</p>
            </div>
            <div className="bg-white dark:bg-[#18181B]/10 rounded-xl p-3">
              <p className="text-xs font-bold mb-1 opacity-90">Tùy biến phong cách</p>
              <p className="text-xs text-white/80">Thêm từ khóa: cyberpunk, watercolor, oil painting, anime, realistic 4k...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
