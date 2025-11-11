import React from 'react';
import Modal from '../common/Modal';

// FIX: Added 'face' to the InstructionKey type to support the Face ID instruction feature.
type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced' | 'face';


interface InstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructionKey: InstructionKey | null;
}

const InstructionContent: React.FC<{ instructionKey: InstructionKey }> = ({ instructionKey }) => {
    switch (instructionKey) {
        case 'character':
            return (
                <div className="space-y-3 text-sm text-gray-300">
                    <h4 className="font-bold text-pink-400">Ảnh Nhân Vật (Face ID)</h4>
                    <p>Đây là ảnh gốc của bạn. AI sẽ cố gắng giữ lại các đường nét và đặc điểm trên khuôn mặt của bạn từ ảnh này.</p>
                    <ul className="list-disc list-inside pl-4">
                        <li><strong>Nên:</strong> Dùng ảnh chân dung, chụp thẳng, rõ nét, không bị che khuất.</li>
                        <li><strong>Nên:</strong> Ảnh có chất lượng cao, ánh sáng tốt.</li>
                        <li><strong>Tránh:</strong> Ảnh mờ, tối, chụp nghiêng hoặc có nhiều người.</li>
                        <li><strong>Tránh:</strong> Đeo kính râm, khẩu trang hoặc các vật che mặt khác.</li>
                    </ul>
                </div>
            );
        case 'face':
             return (
                <div className="space-y-3 text-sm text-gray-300">
                    <h4 className="font-bold text-pink-400">Ảnh Gương Mặt (Face ID+)</h4>
                    <p>Đây là ảnh AI dùng để "khóa" gương mặt. Cung cấp ảnh này sẽ giúp AI giữ lại danh tính nhân vật tốt hơn nữa.</p>
                    <ul className="list-disc list-inside pl-4">
                        <li>Chức năng này giúp AI tập trung vào việc tái tạo lại các đặc điểm khuôn mặt một cách chính xác nhất.</li>
                        <li>Nó hoạt động tốt nhất khi kết hợp với ảnh nhân vật chính.</li>
                        <li><strong>Lưu ý:</strong> Việc sử dụng Face ID+ có thể làm giảm một chút sự sáng tạo của AI đối với các chi tiết khác.</li>
                    </ul>
                </div>
            );
        case 'style':
            return (
                <div className="space-y-3 text-sm text-gray-300">
                    <h4 className="font-bold text-pink-400">Ảnh Phong Cách (Style Reference)</h4>
                    <p>Tải lên một bức ảnh mà bạn muốn AI "bắt chước" phong cách.</p>
                    <ul className="list-disc list-inside pl-4">
                        <li>AI sẽ phân tích các yếu tố như: dải màu, ánh sáng, bố cục, và không khí chung của ảnh.</li>
                        <li>Bạn có thể dùng ảnh Audition, ảnh nghệ thuật, hoặc bất kỳ hình ảnh nào có phong cách bạn thích.</li>
                        <li>Chức năng này rất mạnh mẽ để tạo ra các tác phẩm có chủ đề và cảm xúc đồng nhất.</li>
                    </ul>
                </div>
            );
        case 'prompt':
            return (
                <div className="space-y-3 text-sm text-gray-300">
                    <h4 className="font-bold text-pink-400">Câu Lệnh (Prompt)</h4>
                    <p>Đây là phần quan trọng nhất để điều khiển AI. Hãy mô tả thật chi tiết những gì bạn muốn thấy trong ảnh.</p>
                    <ul className="list-disc list-inside pl-4">
                        <li><strong>Công thức gợi ý:</strong> [Chủ thể] + [Hành động] + [Trang phục & Chi tiết] + [Bối cảnh] + [Ánh sáng & Phong cách].</li>
                        <li><strong>Ví dụ tốt:</strong> "Một cô gái xinh đẹp với mái tóc bạch kim dài, mặc váy dạ hội màu xanh lấp lánh, đang khiêu vũ dưới bầu trời đầy sao, phong cách điện ảnh."</li>
                        <li><strong>Ví dụ chưa tốt:</strong> "cô gái nhảy".</li>
                        <li>Sử dụng tiếng Anh có thể cho kết quả tốt hơn với một số mô hình.</li>
                    </ul>
                </div>
            );
        case 'advanced':
            return (
                <div className="space-y-3 text-sm text-gray-300">
                    <h4 className="font-bold text-pink-400">Cài đặt Nâng cao</h4>
                    <ul className="list-disc list-inside pl-4">
                        <li><strong>Mô hình AI:</strong> Chọn mô hình phù hợp. "Imagen" cho chất lượng cao nhất, "Gemini Flash" cho tốc độ nhanh hơn.</li>
                        <li><strong>Phong cách có sẵn:</strong> Các bộ lọc giúp định hình nhanh phong cách cho ảnh của bạn.</li>
                        <li><strong>Prompt Phủ định:</strong> Mô tả những thứ bạn KHÔNG muốn xuất hiện. Ví dụ: "xấu xí, mờ, nhiều tay, chữ ký".</li>
                        <li><strong>Tỷ lệ khung hình:</strong> Chọn kích thước ảnh phù hợp với nhu cầu của bạn (vuông, dọc, ngang).</li>
                    </ul>
                </div>
            );
        default:
            return null;
    }
};

const getTitle = (key: InstructionKey | null): string => {
    switch (key) {
        case 'character': return 'Hướng dẫn: Ảnh Nhân Vật';
        case 'style': return 'Hướng dẫn: Ảnh Phong Cách';
        case 'prompt': return 'Hướng dẫn: Viết Prompt';
        case 'advanced': return 'Hướng dẫn: Cài đặt Nâng cao';
        case 'face': return 'Hướng dẫn: Gương mặt (Face ID+)';
        default: return 'Hướng dẫn';
    }
}


const InstructionModal: React.FC<InstructionModalProps> = ({ isOpen, onClose, instructionKey }) => {
  if (!isOpen || !instructionKey) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getTitle(instructionKey)}>
        <div className="space-y-4 text-gray-300">
            <InstructionContent instructionKey={instructionKey} />
            <div className="pt-4 border-t border-gray-700">
                <button
                    onClick={onClose}
                    className="w-full py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition"
                >
                    Tôi đã hiểu
                </button>
            </div>
      </div>
    </Modal>
  );
};

export default InstructionModal;
