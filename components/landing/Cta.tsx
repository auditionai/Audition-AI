import React from 'react';

interface CtaProps {
  onCtaClick: () => void;
}

const Cta: React.FC<CtaProps> = ({ onCtaClick }) => {
  return (
    <div className="py-12 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="bg-gradient-to-br from-pink-500/20 to-fuchsia-500/20 p-8 sm:p-12 rounded-3xl text-center border border-pink-500/30">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">Sẵn Sàng Tỏa Sáng?</h2>
          <p className="max-w-2xl mx-auto text-lg text-gray-300 mb-8">
            Tham gia cộng đồng Audition AI ngay hôm nay và bắt đầu biến những ý tưởng của bạn thành hiện thực.
          </p>
          <button onClick={onCtaClick} className="px-8 py-4 font-bold text-lg text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-full transition-all duration-300 hover:shadow-lg hover:shadow-fuchsia-500/30 hover:-translate-y-1">
            Bắt đầu Sáng tạo Miễn phí
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cta;
