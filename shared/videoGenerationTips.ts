export const VIDEO_GENERATION_TIPS = {
  videoAi: {
    upload: {
      title: 'Mẹo chuẩn bị ảnh tạo video',
      text: 'Tải lên ảnh AI bạn muốn tạo chuyển động cho bức ảnh, hãy tải lên ảnh AI rõ nét, có bối cảnh cụ thể, tư thế nhân vật rõ ràng, kết hợp với tạo kịch bản PROMPT để tạo chuyển động và cảnh quay video cho bức ảnh của bạn.',
    },
    settings: {
      title: 'Mẹo chọn mô hình AI tạo video',
      text: 'Hãy chọn mô hình AI tạo video phù hợp, mỗi mô hình AI tạo video có ưu và nhược điểm riêng, khi bạn chọn chất lượng video và thời lượng video cũng sẽ ảnh hưởng trực tiếp đến giá tạo video, nên hãy cân nhắc khi sử dụng chức năng 1 cách hợp lý.',
    },
    render: {
      title: 'Mẹo xử lý khi render video thất bại',
      text: 'Ứng dụng hoạt động dựa trên Sever Tạo Video riêng biệt nên nếu video bạn tạo ra thất bại, hãy thử quay lại và chọn Sever khác hoặc Mô hình AI khác và thử lại. Vì nhiều khi sever bị quá tải, hoặc đang bảo trì, nếu thấy tạo video thất bại nhiều lần, hãy báo ngay cho ADMIN để xử lý phía sever tạo video.',
    },
  },
  motionControl: {
    upload: {
      title: 'Mẹo chuẩn bị ảnh và video Motion',
      text: 'Tải lên ảnh AI bạn muốn tạo chuyển động cho bức ảnh, hãy tải lên ảnh AI rõ nét, có bối cảnh cụ thể, tư thế nhân vật rõ ràng, ảnh tải lên phải có kích thước bằng kích thước video motion mẫu, khuyến nghị sử dụng ảnh kích thước 9:16 và Video Motion dưới 30s.',
    },
    settings: {
      title: 'Mẹo chọn mô hình AI tạo Motion Control',
      text: 'Hãy chọn mô hình AI tạo Motion Controlphù hợp, mỗi mô hình AI tạo Motion Control có ưu và nhược điểm riêng, khi bạn tải lên video và chọn chất lượng video sẽ ảnh hưởng trực tiếp đến giá tạo video, nên hãy cân nhắc khi sử dụng chức năng 1 cách hợp lý.',
    },
    render: {
      title: 'Mẹo xử lý khi Motion Control thất bại',
      text: 'Ứng dụng hoạt động dựa trên Sever Tạo Motion Control riêng biệt nên nếu Motion Control bạn tạo ra thất bại, hãy thử quay lại và chọn Sever khác hoặc Mô hình AI khác và thử lại. Hoặc đổi ảnh khác và video khác xong thử lại, vì nhiều khi sever bị quá tải, hoặc đang bảo trì, nếu thấy tạo video Motion Control thất bại nhiều lần, hãy báo ngay cho ADMIN để xử lý phía sever Motion Control.',
    },
  },
} as const;
