// FIX: Create the content for the common InstructionModal component.
import React from 'react';
import Modal from './Modal';

interface InstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InstructionModal: React.FC<InstructionModalProps> = ({ isOpen, onClose }) => {
  const steps = [
    {
      title: 'Tải Ảnh Nhân Vật',
      description: 'Tải lên ảnh nhân vật Audition của bạn để AI có thể giữ lại trang phục và tư thế.',
      icon: 'ph-user-focus',
    },
    {
      title: 'Khóa Gương Mặt (Tùy chọn)',
      description: 'Sử dụng ảnh chân dung của bạn và tính năng "Siêu Khóa Gương Mặt" để AI giữ lại 95%+ đường nét của bạn.',
      icon: 'ph-face-mask',
    },
    {
      title: 'Nhập Mô Tả (Prompt)',
      description: 'Mô tả chi tiết bối cảnh, hành động bạn muốn AI tạo ra. Càng chi tiết, ảnh càng đẹp và đúng ý.',
      icon: 'ph-pencil-line',
    },
    {
      title: 'Tùy Chỉnh Nâng Cao',
      description: 'Chọn mô hình AI, tỷ lệ khung hình, và các tùy chọn khác để tinh chỉnh kết quả cuối cùng.',
      icon: 'ph-sliders-horizontal',
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Hướng Dẫn Nhanh">
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-4 p-3 bg-skin-fill-secondary rounded-lg">
            <div className="flex-shrink-0 bg-skin-accent/10 text-skin-accent w-10 h-10 flex items-center justify-center rounded-full">
              <i className={`ph-fill ${step.icon} text-xl`}></i>
            </div>
            <div>
              <h4 className="font-bold text-skin-base">{step.title}</h4>
              <p className="text-sm text-skin-muted">{step.description}</p>
            </div>
          </div>
        ))}
        <button
          onClick={onClose}
          className="w-full mt-4 py-3 font-bold themed-button-primary"
        >
          Tôi đã hiểu
        </button>
      </div>
    </Modal>
  );
};

export default InstructionModal;
