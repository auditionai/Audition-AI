import {
  ArrowLeft,
  Gem,
  Crown,
  Film,
  History,
  Image,
  Images,
  LayoutDashboard,
  MessageSquareText,
  ScanFace,
  Scissors,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
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
  [/^\/prompt-library/, { eyebrow: 'Trending Now', title: 'Vũ trụ mẫu HOT', description: 'Khám phá công thức đang thịnh hành và đưa thẳng vào studio chỉ bằng một chạm.', Icon: MessageSquareText, accent: 'orange' }],
  [/^\/gallery/, { eyebrow: 'Creation Timeline', title: 'Dòng thời gian sáng tạo', description: 'Theo dõi tiến trình, xem lại tác phẩm và quản lý toàn bộ lịch sử giao dịch.', Icon: History, accent: 'blue' }],
  [/^\/topup|^\/payment-gateway/, { eyebrow: 'Vcoin Planet', title: 'Kho năng lượng Vcoin', description: 'Chọn gói năng lượng, nhận ưu đãi và theo dõi thanh toán an toàn.', Icon: Gem, accent: 'gold' }],
  [/^\/profile/, { eyebrow: 'My Universe', title: 'Hồ sơ nhà sáng tạo', description: 'Quản lý danh tính, giao diện, bảo mật và các đặc quyền tài khoản.', Icon: Settings, accent: 'pink' }],
  [/^\/admin/, { eyebrow: 'Command Center', title: 'Trung tâm điều hành', description: 'Quan sát hệ thống, hàng đợi, người dùng, kinh tế và chiến dịch theo thời gian thực.', Icon: ShieldCheck, accent: 'gold' }],
  [/^\/about|^\/support|^\/guide/, { eyebrow: 'Creator Academy', title: 'Trạm hỗ trợ sáng tạo', description: 'Tìm hiểu công cụ, quy trình và nhận hỗ trợ khi bạn cần.', Icon: Crown, accent: 'cyan' }],
];

const imageToolMeta: Record<string, HeroMeta> = {
  single_photo_gen: { eyebrow: 'Single Portrait Lab', title: 'Tạo ảnh đơn 3D', description: 'Tập trung độ chính xác khuôn mặt, trang phục và thần thái của một nhân vật.', Icon: ScanFace, accent: 'pink' },
  couple_photo_gen: { eyebrow: 'Couple Story Lab', title: 'Tạo ảnh đôi 3D', description: 'Ghép hai nhân vật vào cùng bố cục với tương tác và cảm xúc tự nhiên.', Icon: UsersRound, accent: 'violet' },
  group_3_gen: { eyebrow: 'Trio Composition', title: 'Tạo ảnh nhóm 3', description: 'Sắp xếp đội hình ba nhân vật cân bằng, rõ mặt và đồng nhất bối cảnh.', Icon: Users, accent: 'cyan' },
  group_4_gen: { eyebrow: 'Squad Composition', title: 'Tạo ảnh nhóm 4', description: 'Dựng đội hình bốn nhân vật với bố cục lớp lang và cá tính riêng.', Icon: Images, accent: 'blue' },
  group_5_gen: { eyebrow: 'Five Star Crew', title: 'Tạo ảnh nhóm 5', description: 'Kết hợp năm nhân vật trong một khung hình rõ ràng và hài hòa.', Icon: Users, accent: 'pink' },
  group_6_gen: { eyebrow: 'Extended Group Lab', title: 'Tạo ảnh nhóm 6', description: 'Tạo đội hình sáu nhân vật bằng luồng tham chiếu mở rộng của Gommo.', Icon: Images, accent: 'violet' },
  group_7_gen: { eyebrow: 'Extended Group Lab', title: 'Tạo ảnh nhóm 7', description: 'Điều phối bảy nhân vật, giữ nhận diện và bố cục nhất quán.', Icon: Users, accent: 'cyan' },
  group_8_gen: { eyebrow: 'Maximum Group Lab', title: 'Tạo ảnh nhóm 8', description: 'Dựng đội hình tám nhân vật bằng cấu hình GPT chuyên biệt, không dùng ảnh mẫu.', Icon: Images, accent: 'gold' },
};

const videoToolMeta: Record<string, HeroMeta> = {
  video_ai_gen: { eyebrow: 'AI Video Studio', title: 'Tạo Video AI', description: 'Biến một bức ảnh thành cảnh quay có chuyển động, âm thanh và kịch bản.', Icon: Film, accent: 'violet' },
  motion_control_gen: { eyebrow: 'Motion Director', title: 'Motion Control', description: 'Điều khiển chuyển động nhân vật theo video mẫu và khung hình tham chiếu.', Icon: WandSparkles, accent: 'cyan' },
};

const exactRouteMeta: Record<string, HeroMeta> = {
  '/tools/remove-bg': { eyebrow: 'Background Studio', title: 'Tách nền Pro', description: 'Tách chủ thể khỏi nền và giữ lại tóc, trang phục cùng các chi tiết nhỏ.', Icon: Scissors, accent: 'cyan' },
  '/tools/enhance': { eyebrow: 'Detail Recovery', title: 'Làm nét & Upscale', description: 'Phục hồi chi tiết và nâng độ rõ cho ảnh trước khi đưa vào quy trình AI.', Icon: Sparkles, accent: 'blue' },
  '/tools/edit': { eyebrow: 'Magic Editor', title: 'Chỉnh sửa ảnh AI', description: 'Biến đổi vùng ảnh, màu sắc và chi tiết bằng mô tả tự nhiên.', Icon: WandSparkles, accent: 'violet' },
  '/tools/ai-image': { eyebrow: 'Prompt Composer', title: 'AI Art Composer', description: 'Kết hợp nhiều ảnh tham chiếu và mô tả để dựng một thế giới hoàn toàn mới.', Icon: Image, accent: 'pink' },
};

export function V2RouteHero() {
  const location = useLocation();
  const navigate = useNavigate();
  const toolId = new URLSearchParams(location.search).get('tool') || '';
  const meta = (location.pathname.startsWith('/generate/image') ? (imageToolMeta[toolId] ?? imageToolMeta.single_photo_gen) : undefined)
    ?? (location.pathname.startsWith('/generate/video') ? (videoToolMeta[toolId] ?? videoToolMeta.video_ai_gen) : undefined)
    ?? exactRouteMeta[location.pathname]
    ?? routeMeta.find(([pattern]) => pattern.test(location.pathname))?.[1]
    ?? {
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
