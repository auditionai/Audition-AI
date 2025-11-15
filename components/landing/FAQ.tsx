import React, { useState } from 'react';
import { FAQ_DATA } from '../../constants/landingPageData';
import { useTranslation } from '../../hooks/useTranslation';

const FAQItem: React.FC<{ isOpen: boolean; onClick: () => void; index: number }> = ({ isOpen, onClick, index }) => {
  const { t } = useTranslation();
  return (
    <div className="border-b border-pink-500/20 py-6">
      <button
        onClick={onClick}
        className="w-full flex justify-between items-center text-left text-lg font-semibold text-white"
      >
        <span>{t(`landing.faq.items.${index}.question`)}</span>
        <i className={`ph-fill ph-caret-down transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <p className="text-gray-400">
            {t(`landing.faq.items.${index}.answer`)}
          </p>
        </div>
      </div>
    </div>
  );
};

const FAQ: React.FC = () => {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-16 sm:py-24 text-white w-full">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">{t('landing.faq.title')}</span>
          </h2>
          <p className="text-lg text-gray-400">
            {t('landing.faq.description')}
          </p>
        </div>
        <div className="max-w-3xl mx-auto">
          {FAQ_DATA.map((_, index) => (
            <FAQItem
              key={index}
              isOpen={openIndex === index}
              onClick={() => handleToggle(index)}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;