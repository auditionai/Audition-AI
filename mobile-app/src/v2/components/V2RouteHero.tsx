import {
  ArrowLeft,
  Coins,
  Crown,
  Film,
  History,
  Image,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

type HeroMeta = {
  eyebrow: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
};

const routeMeta: Array<[RegExp, HeroMeta]> = [
  [/^\/generate\/image/, { eyebrow: 'Image Dream Lab', title: 'Xưởng tạo ảnh 3D', description: 'Ghép nhân vật, khóa khuôn mặt và đạo diễn khung hình trong một studio nhiều lớp.', Icon: Image, accent: 'pink' }],
  [/^\/generate\/video/, { eyebrow: 'Motion Galaxy', title: 'Xưởng phim AI', description: 'Biến khung hình thành chuyển động điện ảnh với model, âm thanh và kịch bản thông minh.', Icon: Film, accent: 'violet' }],
  [/^\/tools\/ai-image/, { eyebrow: 'Prompt Composer', title: 'AI Art Composer', description: 'Kết hợp nhiều ảnh tham chiếu và mô tả để dựng một thế giới hoàn toàn mới.', Icon: WandSparkles, accent: 'cyan' }],
  [/^\/tools\//, { eyebrow: 'Magic Toolbox', title: 'Phòng chỉnh sửa', description: 'Tách nền, làm nét và biến đổi ảnh trong không gian chỉnh sửa chuyên dụng.', Icon: Sparkles, accent: 'cyan' }],
  [/^\/prompt-library/, { eyebrow: 'Trending Now', title: 'Vũ trụ mẫu HOT', description: 'Khám phá công thức đang thịnh hành và đưa thẳng vào studio chỉ bằng một chạm.', Icon: MessageSquareText, accent: 'orange' }],
  [/^\/gallery/, { eyebrow: 'Creation Timeline', title: 'Dòng thời gian sáng tạo', description: 'Theo dõi tiến trình, xem lại tác phẩm và quản lý toàn bộ lịch sử giao dịch.', Icon: History, accent: 'blue' }],
  [/^\/topup|^\/payment-gateway/, { eyebrow: 'Vcoin Planet', title: 'Kho năng lượng Vcoin', description: 'Chọn gói năng lượng, nhận ưu đãi và theo dõi thanh toán an toàn.', Icon: Coins, accent: 'gold' }],
  [/^\/profile/, { eyebrow: 'My Universe', title: 'Hồ sơ nhà sáng tạo', description: 'Quản lý danh tính, giao diện, bảo mật và các đặc quyền tài khoản.', Icon: Settings, accent: 'pink' }],
  [/^\/admin/, { eyebrow: 'Command Center', title: 'Trung tâm điều hành', description: 'Quan sát hệ thống, hàng đợi, người dùng, kinh tế và chiến dịch theo thời gian thực.', Icon: ShieldCheck, accent: 'gold' }],
  [/^\/about|^\/support|^\/guide/, { eyebrow: 'Creator Academy', title: 'Trạm hỗ trợ sáng tạo', description: 'Tìm hiểu công cụ, quy trình và nhận hỗ trợ khi bạn cần.', Icon: Crown, accent: 'cyan' }],
];

export function V2RouteHero() {
  const location = useLocation();
  const navigate = useNavigate();
  const meta = routeMeta.find(([pattern]) => pattern.test(location.pathname))?.[1] ?? {
    eyebrow: 'Audition AI',
    title: 'Creative Universe',
    description: 'Không gian sáng tạo dành riêng cho bạn.',
    Icon: LayoutDashboard,
    accent: 'pink',
  };
  const { Icon } = meta;

  return (
    <section className="v2-route-hero" data-accent={meta.accent}>
      <button type="button" className="v2-route-hero__back v2-tap" onClick={() => navigate(-1)} aria-label="Quay lại">
        <ArrowLeft size={20} />
      </button>
      <div className="v2-route-hero__copy">
        <span className="v2-route-hero__eyebrow"><Sparkles size={13} /> {meta.eyebrow}</span>
        <h1>{meta.title}</h1>
        <p>{meta.description}</p>
      </div>
      <div className="v2-route-hero__planet" aria-hidden="true">
        <span className="v2-route-hero__ring" />
        <Icon size={34} strokeWidth={1.55} />
      </div>
    </section>
  );
}
