import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface FooterProps {
  onInfoLinkClick: (key: 'terms' | 'policy' | 'contact') => void;
}

const Footer: React.FC<FooterProps> = ({ onInfoLinkClick }) => {
  const { t } = useTranslation();
  return (
    <footer className="bg-transparent border-t border-skin-border text-skin-base relative z-10">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-center text-center text-skin-muted text-sm gap-4">
            <p>{t('landing.footer.copyright')}</p>
             <nav className="flex items-center space-x-4 text-skin-muted">
              <a onClick={() => onInfoLinkClick('terms')} className="hover:text-skin-base cursor-pointer transition">{t('landing.footer.terms')}</a>
              <a onClick={() => onInfoLinkClick('policy')} className="hover:text-skin-base cursor-pointer transition">{t('landing.footer.policy')}</a>
              <a onClick={() => onInfoLinkClick('contact')} className="hover:text-skin-base cursor-pointer transition">{t('landing.footer.contact')}</a>
            </nav>
        </div>
        <div className="text-center text-xs text-gray-600 mt-6 border-t border-skin-border pt-6">
            <p><i className="ph-fill ph-warning-circle text-yellow-500"></i> {t('landing.footer.legalNotice')}</p>
            <p className="mt-2 max-w-2xl mx-auto">{t('landing.footer.legalDesc')}</p>
        </div>
        <div className="mt-8 flex flex-wrap justify-center items-center gap-4">
            <a href="https://caulenhau.io.vn/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 font-bold text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-skin-base rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1">
                <i className="ph-fill ph-scroll text-lg text-yellow-300"></i>
                {t('landing.footer.linkCLA')}
            </a>
            <a href="https://byvn.net/codycn-prompt" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 font-bold text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-skin-base rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1">
                <i className="ph-fill ph-robot text-lg text-cyan-300"></i>
                {t('landing.footer.linkPG')}
            </a>
            <a href="https://m.me/cm/AbZT2-fW9wJlrX7M/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 font-bold text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-skin-base rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1">
                <i className="ph-fill ph-users-three text-lg text-pink-300"></i>
                {t('landing.footer.linkCommunity')}
            </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
