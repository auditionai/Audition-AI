import React from 'react';
import Modal from '../common/Modal';

type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced' | 'face' | 'bg-remover' | 'signature' | 'group-studio' | null;

interface InstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructionKey: InstructionKey;
}

const instructionContent = {
  character: {
    title: 'Hướng Dẫn: Ảnh Nhân Vật',
    content: (
      <>
        <p>Đây là ảnh đầu vào quan trọng nhất. AI sẽ sử dụng ảnh này để:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>Giữ lại tư thế (pose)</strong> của nhân vật.</li>
          <li><strong>Giữ lại trang phục và phụ kiện</strong> đang mặc.</li>
          <li><strong>Face Lock (Cơ bản):</strong> Nếu bật, AI sẽ cố gắng vẽ lại gương mặt giống với ảnh này. Độ chính xác khoảng 70-80%.</li>
        </ul>
        <p className="font-bold mt-4">Mẹo:</p>
        <p>Sử dụng ảnh chụp toàn thân hoặc nửa người với chất lượng rõ nét để có kết quả tốt nhất.</p>
      </>
    ),
  },
  face: {
    title: 'Hướng Dẫn: Siêu Khóa Gương Mặt',
    content: (
      <>
        <p>Đây là tính năng cao cấp để giữ lại gương mặt của bạn với độ chính xác trên 95%.</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>Bước 1:</strong> Tải lên một ảnh chân dung rõ mặt, nhìn thẳng, không bị tóc che hoặc đeo kính râm.</li>
          <li><strong>Bước 2 (BẮT BUỘC):</strong> Nhấn nút <strong>"Xử lý & Khóa Gương Mặt"</strong>. Thao tác này sẽ tốn 1 kim cương.</li>
          <li><strong>Bước 3:</strong> Một khi có thông báo "Gương mặt đã được khóa", AI sẽ sử dụng gương mặt đã xử lý này cho tác phẩm của bạn.</li>
        </ul>
        <p className="font-bold mt-4">Lưu ý:</p>
        <p>Bạn phải nhấn nút xử lý sau khi tải ảnh lên, nếu không AI sẽ không sử dụng ảnh này.</p>
      </>
    ),
  },
  style: {
    title: 'Hướng Dẫn: Ảnh Phong Cách',
    content: (
      <>
        <p>AI sẽ "học" phong cách nghệ thuật từ ảnh này để áp dụng vào tác phẩm của bạn. Các yếu tố được học bao gồm:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>Dải màu (Color Palette):</strong> Tông màu chủ đạo của bức ảnh.</li>
          <li><strong>Ánh sáng & Bóng tối:</strong> Cách ánh sáng tương tác với môi trường và nhân vật.</li>
          <li><strong>Bố cục & Góc nhìn:</strong> Cách sắp xếp các yếu tố trong ảnh.</li>
          <li><strong>Phong cách nghệ thuật:</strong> Nét vẽ, độ chi tiết, hiệu ứng (vẽ tay, 3D, anime...).</li>
        </ul>
        <p className="font-bold mt-4">Mẹo:</p>
        <p>Sử dụng ảnh có phong cách bạn thích, ví dụ một bức tranh của họa sĩ nổi tiếng, một cảnh trong phim hoạt hình, hoặc một bức ảnh nghệ thuật.</p>
      </>
    ),
  },
  prompt: {
    title: 'Hướng Dẫn: Câu Lệnh Mô Tả (Prompt)',
    content: (
      <>
        <p>Đây là nơi bạn ra lệnh cho AI về nội dung của bức ảnh. Hãy mô tả càng chi tiết càng tốt.</p>
        <p className="font-bold mt-4">Công thức gợi ý:</p>
        <p className="italic bg-skin-fill-secondary p-2 rounded-md mt-2 text-sm">[Chủ thể], [Hành động], [Bối cảnh], [Chi tiết bổ sung]</p>
        <p className="font-bold mt-4">Ví dụ:</p>
        <p className="italic bg-skin-fill-secondary p-2 rounded-md mt-2 text-sm">"một cô gái tóc hồng dài, mặc váy công chúa lấp lánh, đang khiêu vũ một mình, trong một cung điện tráng lệ bằng pha lê, ánh trăng chiếu rọi, hiệu ứng phép thuật bay xung quanh"</p>
        <p className="mt-2">Sử dụng tiếng Việt, không dấu hoặc có dấu đều được.</p>
      </>
    ),
  },
  advanced: {
    title: 'Hướng Dẫn: Cài đặt Nâng cao',
    content: (
      <>
        <ul className="space-y-3">
          <li><strong>Mô hình AI:</strong> Chọn các phiên bản AI khác nhau. Các mô hình "PRO" hoặc "ULTRA" cho chất lượng cao hơn nhưng có thể chậm hơn và không hỗ trợ ảnh đầu vào.</li>
          <li><strong>Phong cách:</strong> Các bộ lọc có sẵn để nhanh chóng áp dụng một phong cách chung (Điện ảnh, Anime,...) cho ảnh của bạn.</li>
          <li><strong>Prompt Phủ định:</strong> Liệt kê những thứ bạn KHÔNG muốn xuất hiện trong ảnh (VD: xấu, mờ, nhiều tay, chữ ký...).</li>
          <li><strong>Seed:</strong> Một con số để tái tạo lại kết quả tương tự. Để trống để AI tạo ngẫu nhiên mỗi lần.</li>
          <li><strong>Làm Nét & Nâng Cấp:</strong> Tốn thêm 1 kim cương để tăng độ phân giải và độ sắc nét của ảnh cuối cùng.</li>
        </ul>
      </>
    ),
  },
  'bg-remover': {
    title: 'Hướng Dẫn: Tách Nền',
    content: (
      <>
        <p>Công cụ này giúp bạn tự động xóa phông nền khỏi ảnh, chỉ giữ lại nhân vật chính.</p>
        <p className="font-bold mt-2">Chi phí: <span className="text-pink-400">1 Kim cương</span> cho mỗi ảnh xử lý.</p>
        <p className="font-bold mt-4">Các bước thực hiện:</p>
        <ol className="list-decimal list-inside space-y-2 mt-2">
            <li><strong>Tải ảnh:</strong> Nhấn hoặc kéo thả ảnh bạn muốn tách nền vào ô bên trái.</li>
            <li><strong>Xử lý:</strong> Nhấn nút 'Tách nền'. Ảnh sẽ được xử lý và kết quả sẽ xuất hiện ở ô 'Kết quả' bên phải.</li>
            <li><strong>Lưu ý:</strong> Ảnh kết quả chỉ được lưu tạm thời. Tải lại trang sẽ làm mất ảnh.</li>
            <li><strong>Sử dụng:</strong> Nhấn vào ảnh kết quả để mở các tùy chọn:</li>
        </ol>
        <ul className="list-disc list-inside pl-8 space-y-1 mt-1">
            <li><strong>Sử dụng ảnh này:</strong> Chuyển ảnh đã tách nền sang công cụ 'Tạo Ảnh AI' để làm 'Ảnh Nhân Vật'.</li>
            <li><strong>Crop Gương Mặt:</strong> Cắt lấy phần gương mặt và chuyển sang mục 'Siêu Khóa Gương Mặt'.</li>
            <li><strong>Tải xuống:</strong> Lưu ảnh đã tách nền về máy.</li>
        </ul>
      </>
    )
  },
  'signature': {
    title: 'Hướng Dẫn: Chèn Chữ Ký',
    content: (
       <>
        <p>Công cụ này cho phép bạn thêm chữ ký hoặc văn bản vào ảnh của mình.</p>
        <p className="font-bold mt-4">Hai chế độ sử dụng:</p>
         <ul className="list-disc list-inside space-y-2 mt-2">
            <li><strong>Thủ công (Miễn phí):</strong> Cung cấp các tùy chọn cơ bản như font chữ, kích thước, màu sắc. Thay đổi sẽ được xem trước ngay lập tức.</li>
            <li><strong>AI Style (1 Kim cương):</strong> Sử dụng AI để tạo ra các kiểu chữ nghệ thuật độc đáo (Neon, 3D, Graffiti...) với hiệu ứng màu sắc ấn tượng.</li>
        </ul>
        <p className="font-bold mt-4">Các bước thực hiện:</p>
        <ol className="list-decimal list-inside space-y-2 mt-2">
            <li><strong>Tải ảnh:</strong> Tải lên ảnh của bạn, hoặc ảnh sẽ được tự động chuyển sang từ công cụ 'Tạo Ảnh AI'.</li>
            <li><strong>Chọn vị trí:</strong> Kéo thả ô 'Vị trí' trên ảnh để xác định nơi bạn muốn đặt chữ ký.</li>
            <li><strong>Tùy chỉnh:</strong> Nhập nội dung chữ ký và chọn các tùy chọn kiểu dáng, màu sắc mong muốn.</li>
            <li><strong>Áp dụng:</strong> Nhấn nút 'Áp dụng'. Nếu dùng chế độ AI, hệ thống sẽ mất vài giây để xử lý.</li>
            <li><strong>Tải về:</strong> Sau khi có kết quả, nhấn nút 'Tải ảnh' để lưu tác phẩm về máy.</li>
        </ol>
      </>
    )
  },
  'group-studio': {
    title: 'Hướng Dẫn: Studio Nhóm',
    content: (
      <>
        <p>Công cụ này cho phép bạn tạo ảnh nhóm bằng cách ghép nhiều nhân vật vào một bối cảnh chung.</p>
        <p className="font-bold mt-4">Các bước thực hiện:</p>
        <ol className="list-decimal list-inside space-y-2 mt-2">
          <li><strong>Chọn số lượng:</strong> Chọn số nhân vật bạn muốn có trong ảnh.</li>
          <li><strong>Cung cấp nhân vật:</strong> Với mỗi nhân vật, tải lên "Ảnh nhân vật" để lấy trang phục và "Ảnh gương mặt" (tùy chọn) để khóa mặt. Đừng quên chọn giới tính.</li>
          <li><strong>Ảnh Mẫu Tham Chiếu:</strong> Đây là ảnh quan trọng nhất. AI sẽ học theo bố cục, bối cảnh, và phong cách từ ảnh này để tạo ra ảnh cuối cùng.</li>
          <li><strong>Prompt & Cài đặt:</strong> Thêm mô tả chi tiết và chọn phong cách, tỷ lệ ảnh mong muốn.</li>
          <li><strong>Tạo ảnh:</strong> Nhấn nút "Tạo Ảnh Nhóm". Quá trình này có thể mất vài phút vì độ phức tạp cao hơn.</li>
        </ol>
        <p className="font-bold mt-4">Lưu ý:</p>
        <p>Chất lượng của "Ảnh Mẫu Tham Chiếu" sẽ ảnh hưởng lớn đến kết quả cuối cùng. Hãy chọn một ảnh có bố cục rõ ràng và đẹp mắt.</p>
      </>
    ),
  }
};

const InstructionModal: React.FC<InstructionModalProps> = ({ isOpen, onClose, instructionKey }) => {
  const currentContent = instructionKey ? instructionContent[instructionKey] : null;
  if (!isOpen || !currentContent) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={currentContent.title}>
      <div className="text-sm text-skin-muted space-y-3 custom-scrollbar pr-2 max-h-[60vh] overflow-y-auto">
        {currentContent.content}
      </div>
      <button
          onClick={onClose}
          className="w-full mt-6 py-2.5 font-bold themed-button-primary"
      >
          Tôi đã hiểu
      </button>
    </Modal>
  );
};

export default InstructionModal;