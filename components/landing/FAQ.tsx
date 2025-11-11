import React, { useState } from 'react';
import { FAQ_DATA } from '../../constants/landingPageData';

const FAQItem: React.FC<{ item: typeof FAQ_DATA[0]; isOpen: boolean; onClick: () => void }> = ({ item, isOpen, onClick }) => {
  return (
    <div className="border-b border-pink-500/20 py-6">
      <button
        onClick={onClick}
        className="w-full flex justify-between items-center text-left text-lg font-semibold text-white"
      >
        <span>{item.question}</span>
        <i className={`ph-fill ph-caret-down transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <p className="text-gray-400">
            {item.answer}
          </p>
        </div>
      </div>
    </div>
  );
};

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-16 sm:py-24 text-white w-full">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Câu Hỏi Thường Gặp</span>
          </h2>
          <p className="text-lg text-gray-400">
            Tất cả những gì bạn cần biết để bắt đầu với Audition AI.
          </p>
        </div>
        <div className="max-w-3xl mx-auto">
          {FAQ_DATA.map((item, index) => (
            <FAQItem
              key={index}
              item={item}
              isOpen={openIndex === index}
              onClick={() => handleToggle(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;