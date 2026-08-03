import {
  ArrowRight,
  ChevronDown,
  Crop,
  Film,
  Image,
  Images,
  ScanFace,
  Scissors,
  Sparkles,
  Users,
  UsersRound,
  Video,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

type ToolCategoryId = 'image' | 'video' | 'edit';

type ToolItem = {
  title: string;
  description: string;
  path: string;
  Icon: LucideIcon;
  tag?: string;
};

const categories: Record<ToolCategoryId, {
  title: string;
  shortTitle: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
  tools: ToolItem[];
}> = {
  image: {
    title: 'Tạo ảnh AI',
    shortTitle: 'Image Studio',
    description: 'Chọn số nhân vật trước khi bước vào studio.',
    Icon: Image,
    accent: 'pink',
    tools: [
      { title: 'Tạo ảnh đơn', description: 'Một nhân vật, tập trung tối đa vào khuôn mặt và trang phục.', path: '/generate/image?tool=single_photo_gen', Icon: ScanFace, tag: 'Phổ biến' },
      { title: 'Couple Mode', description: 'Hai nhân vật trong cùng một câu chuyện và bố cục.', path: '/generate/image?tool=couple_photo_gen', Icon: UsersRound, tag: 'HOT' },
      { title: 'Nhóm 3 người', description: 'Bố cục cân bằng cho bộ ba nhân vật.', path: '/generate/image?tool=group_3_gen', Icon: Users },
      { title: 'Nhóm 4 người', description: 'Tạo đội hình squad với bốn nhân vật.', path: '/generate/image?tool=group_4_gen', Icon: Images },
      { title: 'Nhóm 5 người', description: 'Tạo đội hình gồm năm nhân vật riêng biệt.', path: '/generate/image?tool=group_5_gen', Icon: Sparkles },
      { title: 'Nhóm 6 người', description: 'Tạo ảnh nhóm sáu nhân vật bằng luồng Gommo.', path: '/generate/image?tool=group_6_gen', Icon: Users },
      { title: 'Nhóm 7 người', description: 'Tạo ảnh nhóm bảy nhân vật với đầy đủ ảnh tham chiếu.', path: '/generate/image?tool=group_7_gen', Icon: Images },
      { title: 'Nhóm 8 người', description: 'Tạo đội hình tám nhân vật, không sử dụng ảnh mẫu bố cục.', path: '/generate/image?tool=group_8_gen', Icon: Sparkles, tag: 'MAX' },
    ],
  },
  video: {
    title: 'Tạo Video AI',
    shortTitle: 'Motion Galaxy',
    description: 'Chọn cách bạn muốn tạo chuyển động.',
    Icon: Video,
    accent: 'violet',
    tools: [
      { title: 'Ảnh thành Video', description: 'Biến một khung hình thành đoạn phim điện ảnh.', path: '/generate/video?tool=video_ai_gen', Icon: Film, tag: 'AI' },
      { title: 'Motion Control', description: 'Điều khiển chuyển động nhân vật theo video mẫu.', path: '/generate/video?tool=motion_control_gen', Icon: WandSparkles, tag: 'PRO' },
    ],
  },
  edit: {
    title: 'Chỉnh sửa ảnh',
    shortTitle: 'Magic Toolbox',
    description: 'Các công cụ hậu kỳ chuyên dụng cho hình ảnh.',
    Icon: Crop,
    accent: 'cyan',
    tools: [
      { title: 'Tách nền Pro', description: 'Xóa nền và giữ chi tiết tóc, trang phục.', path: '/tools/remove-bg', Icon: Scissors, tag: 'PRO' },
      { title: 'Làm nét & Upscale', description: 'Phục hồi chi tiết và tăng chất lượng ảnh.', path: '/tools/enhance', Icon: Sparkles },
      { title: 'Chỉnh sửa ảnh', description: 'Chỉnh sửa vùng ảnh bằng mô tả tự nhiên.', path: '/tools/edit', Icon: WandSparkles, tag: 'AI' },
      { title: 'Tạo ảnh AI', description: 'Kết hợp nhiều ảnh tham chiếu thành tác phẩm mới.', path: '/tools/ai-image', Icon: Images },
    ],
  },
};

export function ToolsHubV2() {
  const navigate = useNavigate();
  const { category } = useParams<{ category?: string }>();
  const routeCategory = category && category in categories ? category as ToolCategoryId : null;
  const [openCategory, setOpenCategory] = useState<ToolCategoryId | null>(routeCategory);

  useEffect(() => {
    setOpenCategory(routeCategory);
  }, [routeCategory]);

  const toggleCategory = (id: ToolCategoryId) => {
    const nextCategory = openCategory === id ? null : id;
    setOpenCategory(nextCategory);
    navigate(nextCategory ? `/tools-hub/${nextCategory}` : '/tools-hub', { replace: true });
  };

  return (
    <div className="v2-tools-hub">
      <section className="v2-tools-hub__hero">
        <span><Sparkles size={14} /> Creative directory</span>
        <h1>Tất cả công cụ</h1>
        <p>Chạm vào từng nhóm để mở danh sách công cụ. Mỗi lần chỉ một nhóm được hiển thị.</p>
        <div className="v2-tools-hub__orb" aria-hidden="true">
          <WandSparkles size={40} />
        </div>
      </section>

      <section className="v2-tools-hub__categories" aria-label="Nhóm công cụ">
        {(Object.entries(categories) as Array<[ToolCategoryId, typeof categories.image]>).map(([id, item], index) => {
          const Icon = item.Icon;
          const isOpen = openCategory === id;
          return (
            <article key={id} className={`v2-tools-accordion${isOpen ? ' is-open' : ''}`} data-accent={item.accent}>
              <button
                type="button"
                className="v2-tools-category v2-tap"
                data-accent={item.accent}
                aria-expanded={isOpen}
                aria-controls={`v2-tools-panel-${id}`}
                onClick={() => toggleCategory(id)}
              >
                <span className="v2-tools-category__index">0{index + 1}</span>
                <span className="v2-tools-category__icon"><Icon size={28} /></span>
                <span className="v2-tools-category__copy">
                  <small>{item.shortTitle}</small>
                  <strong>{item.title}</strong>
                  <em>{item.tools.length} công cụ</em>
                </span>
                <span className="v2-tools-category__toggle">
                  <ChevronDown size={20} />
                </span>
              </button>

              {isOpen && (
                <section id={`v2-tools-panel-${id}`} className="v2-tool-list" aria-label={`Công cụ ${item.title}`}>
                  {item.tools.map(({ title, description, path, Icon: ToolIcon, tag }, toolIndex) => (
                    <button type="button" key={title} className="v2-tool-card v2-tap" onClick={() => navigate(path)}>
                      <span className="v2-tool-card__number">{String(toolIndex + 1).padStart(2, '0')}</span>
                      <span className="v2-tool-card__icon"><ToolIcon size={25} /></span>
                      <span className="v2-tool-card__copy">
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      {tag && <b>{tag}</b>}
                      <ArrowRight className="v2-tool-card__arrow" size={18} />
                    </button>
                  ))}
                </section>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
