
export interface ChangelogItem {
  id: number;
  version: string;
  date: string;
  title: string;
  description: string;
}

export const CHANGELOG_DATA: ChangelogItem[] = [
  {
    id: 13,
    version: 'v2.3.0',
    date: '20-11-2025',
    title: 'Siêu Phẩm: Comic Studio (Truyện Tranh AI)',
    description: 'Ra mắt công cụ sáng tạo Truyện Tranh chuyên nghiệp! Tự động viết kịch bản, phân tích nhân vật, vẽ tranh theo panel và xuất file PDF/ZIP sắc nét.',
  },
  {
    id: 12,
    version: 'v2.2.0',
    date: '19-11-2025',
    title: 'Cửa Hàng Premium & Hiệu Ứng Tên',
    description: 'Làm mới hoàn toàn Cửa Hàng. Ra mắt vật phẩm "Hiệu Ứng Tên" (Name Effects) giúp tên bạn nổi bật lấp lánh trong Chat và Bảng Xếp Hạng.',
  },
  {
    id: 11,
    version: 'v2.1.0',
    date: '18-11-2025',
    title: 'Hệ Thống Chat & Vòng Quay Mới',
    description: 'Nâng cấp Vòng Quay May Mắn (Floating), thêm nhiệm vụ kiếm vé miễn phí. Ra mắt Chat Global và Hệ thống tin nhắn riêng (Inbox).',
  },
  {
    id: 10,
    version: 'v2.0.0',
    date: '17-11-2025',
    title: 'Ra mắt Studio Nhóm & Nâng cấp UI',
    description: 'Thêm tính năng Studio Nhóm cho phép tạo ảnh nhiều nhân vật. Sửa lỗi hiển thị và vị trí nút "Sử dụng PROMPT". Thêm kênh Thông báo Hệ thống.',
  },
  {
    id: 9,
    version: 'v1.9.0',
    date: '16-11-2025',
    title: 'Ra mắt Thư viện Prompt & Hỗ trợ tốt hơn',
    description: 'Tích hợp thư viện prompt từ caulenhau.io.vn, giúp người dùng tham khảo và sử dụng các prompt chất lượng. Thêm kênh hỗ trợ Facebook trực tiếp.',
  },
  {
    id: 8,
    version: 'v1.8.0',
    date: '15-11-2025',
    title: 'Quốc tế hóa & Sửa lỗi nghiêm trọng',
    description: 'Dịch toàn bộ giao diện ứng dụng sang tiếng Anh, hỗ trợ chuyển đổi ngôn ngữ linh hoạt. Sửa các lỗi nghiêm trọng gây crash ứng dụng.',
  },
  {
    id: 7,
    version: 'v1.7.0',
    date: '14-11-2025',
    title: 'Nâng cấp toàn diện Công cụ Chữ Ký',
    description: 'Sửa lỗi định vị chữ ký AI, thêm tùy chọn Font, cỡ chữ, in đậm/nghiêng. Mở rộng thư viện hiệu ứng và thêm bộ chọn màu chuyên nghiệp.',
  },
  {
    id: 6,
    version: 'v1.6.0',
    date: '13-11-2025',
    title: 'Cách mạng hệ thống Giao diện (Theme)',
    description: 'Làm lại toàn bộ hệ thống Theme! Mỗi theme giờ đây đều có bản sắc riêng. Giao diện mặc định được đổi thành "Vũ Điệu Neon".',
  },
  {
    id: 5,
    version: 'v1.5.0',
    date: '12-11-2025',
    title: 'Siêu Khóa Mặt & Cải tiến UI',
    description: 'Nâng cấp tính năng Siêu Khóa Mặt (Face ID+) cho độ chính xác cao hơn. Tích hợp công cụ Tách Nền vào tab chính để dễ thao tác.',
  },
  {
    id: 4,
    version: 'v1.4.0',
    date: '11-11-2025',
    title: 'Ra mắt hệ thống Giftcode & Thông báo',
    description: 'Ra mắt hệ thống Giftcode cho phép người dùng nhận quà tặng. Thêm tính năng thông báo cập nhật trên thanh điều hướng.',
  },
  {
    id: 3,
    version: 'v1.3.0',
    date: '10-11-2025',
    title: 'Bảng Điều Khiển Admin',
    description: 'Trang thống kê dữ liệu thời gian thực cho Admin đã được thêm vào mục Cài đặt. Sửa lỗi hiển thị và múi giờ.',
  },
  {
    id: 2,
    version: 'v1.2.1',
    date: '09-11-2025',
    title: 'Sửa lỗi và Cải thiện hiệu suất',
    description: 'Tối ưu hóa quy trình làm việc trên các nhánh và sửa lỗi trang Preview không hiển thị trên Netlify.',
  },
  {
    id: 1,
    version: 'v1.1.0',
    date: '08-11-2025',
    title: 'Ra mắt Tách Nền và Khóa Gương Mặt',
    description: 'Thêm công cụ Tách Nền và tính năng "Siêu Khóa Mặt" giúp giữ lại danh tính nhân vật chính xác hơn.',
  },
];
