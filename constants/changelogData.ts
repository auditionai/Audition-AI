export interface ChangelogItem {
  id: number;
  version: string;
  date: string;
  title: string;
  description: string;
}

export const CHANGELOG_DATA: ChangelogItem[] = [
  {
    id: 5,
    version: 'v1.5.0',
    date: '12-11-2025',
    title: 'Cải tiến Siêu Khóa Gương Mặt & Giao diện',
    description: 'Nâng cấp tính năng Siêu Khóa Gương Mặt (Face ID+) cho độ chính xác cao hơn. Tích hợp công cụ Tách Nền vào tab chính để quy trình làm việc liền mạch và thuận tiện hơn.',
  },
  {
    id: 4,
    version: 'v1.4.0',
    date: '11-11-2025',
    title: 'Hệ thống Giftcode & Thông báo ra mắt',
    description: 'Ra mắt hệ thống Giftcode cho phép người dùng nhận thưởng. Thêm tính năng thông báo cập nhật ngay trên thanh điều hướng. Bổ sung trang quản lý Gallery cho Admin.',
  },
  {
    id: 3,
    version: 'v1.3.0',
    date: '10-11-2025',
    title: 'Bảng Điều Khiển Admin',
    description: 'Trang thống kê dữ liệu real-time dành cho Admin đã được thêm vào mục Cài đặt. Sửa lỗi hiển thị và múi giờ.',
  },
  {
    id: 2,
    version: 'v1.2.1',
    date: '09-11-2025',
    title: 'Sửa lỗi và Cải thiện hiệu năng',
    description: 'Tối ưu hóa quy trình làm việc trên các nhánh (branch) và sửa lỗi không hiển thị trang xem trước (Preview) trên Netlify.',
  },
  {
    id: 1,
    version: 'v1.1.0',
    date: '08-11-2025',
    title: 'Ra mắt tính năng Tách nền & Khóa Gương mặt',
    description: 'Bổ sung công cụ Tách nền ảnh và tính năng "Siêu Khóa Gương Mặt" giúp giữ lại danh tính nhân vật chính xác hơn.',
  },
];
