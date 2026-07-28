import {
  ArrowRight,
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
      { title: 'Nhóm 5 người', description: 'Đội hình lớn nhất với năm nhân vật riêng biệt.', path: '/generate/image?tool=group_5_gen', Icon: Sparkles, tag: 'MAX' },
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
      { title: 'Magic Editor', description: 'Chỉnh sửa vùng ảnh bằng mô tả tự nhiên.', path: '/tools/edit', Icon: WandSparkles, tag: 'AI' },
      { title: 'AI Art Composer', description: 'Kết hợp nhiều ảnh tham chiếu thành tác phẩm mới.', path: '/tools/ai-image', Icon: Images },
    ],
  },
};

export function ToolsHubV2() {
  const navigate = useNavigate();
  const { category } = useParams<{ category?: string }>();
  const selectedCategory = category && category in categories
    ? categories[category as ToolCategoryId]
    : null;

  return (
    <div className="v2-tools-hub">
      <section className="v2-tools-hub__hero">
        <span><Sparkles size={14} /> Creative directory</span>
        <h1>{selectedCategory ? selectedCategory.title : 'Tất cả công cụ'}</h1>
        <p>{selectedCategory ? selectedCategory.description : 'Chọn đúng trạm sáng tạo, sau đó mở thẳng công cụ bạn cần.'}</p>
        <div className="v2-tools-hub__orb" aria-hidden="true">
          {selectedCategory ? <selectedCategory.Icon size={40} /> : <WandSparkles size={40} />}
        </div>
      </section>

      {!selectedCategory && (
        <section className="v2-tools-hub__categories" aria-label="Nhóm công cụ">
          {(Object.entries(categories) as Array<[ToolCategoryId, typeof categories.image]>).map(([id, item], index) => {
            const Icon = item.Icon;
            return (
              <button
                type="button"
                key={id}
                className="v2-tools-category v2-tap"
                data-accent={item.accent}
                onClick={() => navigate(`/tools-hub/${id}`)}
              >
                <span className="v2-tools-category__index">0{index + 1}</span>
                <span className="v2-tools-category__icon"><Icon size={28} /></span>
                <span className="v2-tools-category__copy">
                  <small>{item.shortTitle}</small>
                  <strong>{item.title}</strong>
                  <em>{item.tools.length} công cụ</em>
                </span>
                <ArrowRight size={20} />
              </button>
            );
          })}
        </section>
      )}

      {selectedCategory && (
        <section className="v2-tool-list" aria-label={`Công cụ ${selectedCategory.title}`}>
          {selectedCategory.tools.map(({ title, description, path, Icon, tag }, index) => (
            <button type="button" key={title} className="v2-tool-card v2-tap" onClick={() => navigate(path)}>
              <span className="v2-tool-card__number">{String(index + 1).padStart(2, '0')}</span>
              <span className="v2-tool-card__icon"><Icon size={27} /></span>
              <span className="v2-tool-card__copy">
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              {tag && <b>{tag}</b>}
              <ArrowRight className="v2-tool-card__arrow" size={19} />
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
