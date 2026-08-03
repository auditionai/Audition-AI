export const GENERATION_SECTION_TIPS = {
  character: {
    title: 'Mẹo tạo ảnh AI đẹp',
    text: 'Bạn hãy tải lên ảnh nhân vật chụp trong siêu thị rõ nét (có thể sử dụng Patch chụp hoặc các phần mềm làm nét ảnh), có thể tách nền nhân vật thành nền đen thì càng tốt, cắt bỏ bớt các chi tiết thừa trong ảnh nhân vật chỉ giữ nguyên nhân vật thôi để AI quét nhân vật và tạo ảnh AI chính xác nhất.',
  },
  settings: {
    title: 'Mẹo chọn cấu hình mô hình AI',
    text: 'Sử dụng GPT để tạo ảnh đẹp nhất, không nhất thiết phải tạo ảnh 4K nếu bạn không có nhu cầu in ấn, chỉ cần tạo ảnh 1K hoặc 2K là rất rõ nét rồi. Đừng phí tiền tạo ảnh 4K vì về độ đẹp thì nó không thay đổi gì nhiều  đâu, chỉ làm ảnh zoom phóng to nét hơn thôi. Còn muốn ảnh đẹp hơn bạn có thể cân nhắc chọn Chất lượng GPT lên Medium hoặc High.',
  },
  render: {
    title: 'Mẹo xử lý khi render thất bại',
    text: 'Ứng dụng hoạt động dựa trên Sever Tạo Ảnh riêng biệt nên nếu bạn ảnh tạo ra thất bại, hãy thử quay lại và chọn Sever khác hoặc Mô hình AI khác như Pro hoặc Flash. Vì nhiều khi sever bị quá tải, hoặc đang bảo trì, nếu thấy tạo ảnh thất bại nhiều lần, hãy báo ngay cho ADMIN để xử lý phía sever tạo ảnh.',
  },
} as const;
