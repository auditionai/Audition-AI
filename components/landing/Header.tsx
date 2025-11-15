import React from 'react';
import { User } from '../../types';
import Logo from '../common/Logo';
import { useTranslation } from '../../hooks/useTranslation';
import LanguageSwitcher from '../common/LanguageSwitcher';

interface LandingHeaderProps {
  user: User | null;
  onTopUpClick: () => void;
  onScrollTo: (id: 'hero' | 'features' | 'how-it-works' | 'pricing' | 'faq' | 'gallery') => void;
}

const LandingHeader: React.FC<LandingHeaderProps> = ({ user, onTopUpClick, onScrollTo }) => {
  const { t } = useTranslation();
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 w-full z-40 transition-all duration-300 ${isScrolled ? 'bg-skin-fill/80 backdrop-blur-lg border-b border-skin-border' : 'bg-transparent'}`}>
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-20">
          <div>
            <Logo onClick={() => onScrollTo('hero')} />
          </div>
          
          <nav className="hidden md:flex items-center gap-2">
            <a onClick={() => onScrollTo('features')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-skin-accent/10 text-skin-muted hover:text-skin-base border border-transparent hover:border-skin-border-accent transition-all duration-300 cursor-pointer text-sm">{t('landing.header.features')}</a>
            <a onClick={() => onScrollTo('how-it-works')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-skin-accent/10 text-skin-muted hover:text-skin-base border border-transparent hover:border-skin-border-accent transition-all duration-300 cursor-pointer text-sm">{t('landing.header.howItWorks')}</a>
            <a onClick={() => onScrollTo('pricing')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-skin-accent/10 text-skin-muted hover:text-skin-base border border-transparent hover:border-skin-border-accent transition-all duration-300 cursor-pointer text-sm">{t('landing.header.pricing')}</a>
            <a onClick={() => onScrollTo('faq')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-skin-accent/10 text-skin-muted hover:text-skin-base border border-transparent hover:border-skin-border-accent transition-all duration-300 cursor-pointer text-sm">{t('landing.header.faq')}</a>
          </nav>
          
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            {user ? (
              <div className="flex items-center gap-4">
                <div 
                    onClick={onTopUpClick}
                    className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full cursor-pointer hover:bg-white/20 transition">
                  <i className="ph-fill ph-diamonds-four text-skin-accent"></i>
                  <span className="font-bold">{user.diamonds}</span>
                </div>
                 {/* Fix: Use snake_case properties `photo_url` and `display_name` to match the User type. */}
                 <img src={user.photo_url || undefined} alt={user.display_name || 'User'} className="w-10 h-10 rounded-full" />
              </div>
            ) : (
              null
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default LandingHeader;