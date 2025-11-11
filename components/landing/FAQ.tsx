import React, { useState } from 'react';
import { FAQ_DATA } from '../../constants/landingPageData';

const FaqItem: React.FC<{ item: typeof FAQ_DATA[0]; isOpen: boolean; onClick: () => void }> = ({ item, isOpen, onClick }) => (
  <div className="border-b border-white/10">
    <button onClick={onClick} className="w-full text-left py-5 px-6 flex justify-between items-center">
      <h3 className="text-lg font-semibold text-white">{item.question}</h3>
      <i className={`ph-fill ph-caret-down text-2xl text-pink-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}></i>
    </button>
    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
      <p className="px-6 pb-5 text-gray-400">{item.answer}</p>
    </div>
  </div>
);

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="py-12 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Câu Hỏi Thường Gặp</h2>
        </div>
        <div className="max-w-3xl mx-auto bg-white/5 border border-white/10 rounded-2xl">
          {FAQ_DATA.map((item, index) => (
            <FaqItem key={index} item={item} isOpen={openIndex === index} onClick={() => setOpenIndex(openIndex === index ? null : index)} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default FAQ;
