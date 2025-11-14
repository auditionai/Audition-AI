import React from 'react';
import Modal from './Modal';

interface InstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InstructionModal: React.FC<InstructionModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Hướng dẫn sử dụng">
      <div className="space-y-4 text-gray-300">
        <p>Chào mừng bạn đến với Audition AI Studio! Để có được những bức ảnh 3D đẹp nhất, hãy làm theo các bước sau:</p>
        
        <div>
          <h4 className="font-bold text-pink-400">1. Tải ảnh gốc chất lượng cao:</h4>
          <ul className="list-disc list-inside pl-4 text-sm">
            <li>Chọn ảnh chân dung, chụp thẳng mặt, rõ nét.</li>
            <li>Tránh ảnh bị mờ, ánh sáng yếu, hoặc mặt bị che khuất.</li>
            <li>AI sẽ giữ lại các đường nét trên khuôn mặt của bạn.</li>
          </ul>
        </div>
        
        <div>
          <h4 className="font-bold text-pink-400">2. Viết mô tả (Prompt) chi tiết:</h4>
          <ul className="list-disc list-inside pl-4 text-sm">
            <li>Đây là bước quan trọng nhất! Càng chi tiết, ảnh càng đúng ý.</li>
            <li>Mô tả về: trang phục, màu sắc, kiểu tóc, hành động, bối cảnh, cảm xúc...</li>
            <li><strong>Ví dụ tốt:</strong> "Một cô gái xinh đẹp với mái tóc bạch kim dài, mặc váy dạ hội màu xanh lấp lánh, đang khiêu vũ dưới bầu trời đầy sao."</li>
            <li><strong>Ví dụ chưa tốt:</strong> "cô gái nhảy"</li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-pink-400">3. Chọn Phong cách và Mô hình:</h4>
          <ul className="list-disc list-inside pl-4 text-sm">
            <li>Các phong cách có sẵn sẽ giúp định hình ảnh của bạn theo chủ đề Audition.</li>
            <li>Mô hình Imagen 4.0 cho chất lượng cao nhất, trong khi Gemini Flash nhanh hơn.</li>
          </ul>
        </div>

        <div className="pt-4 border-t border-gray-700">
            <button
                onClick={onClose}
                className="w-full py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition"
            >
                Tôi đã hiểu, bắt đầu thôi!
            </button>
        </div>
      </div>
    </Modal>
  );
};

export default InstructionModal;
