import React from 'react';
import { User } from '../types.ts';

type CreatorView = 'tool' | 'gallery' | 'leaderboard' | 'buy' | 'settings';

interface CreatorHeaderProps {
  user: User | null;
  onLogoClick: () => void;
  onTopUpClick: () => void;
  activeView: CreatorView;
  onViewChange: (view: CreatorView) => void;
}

const CreatorHeader: React.FC<CreatorHeaderProps> = ({ user, onLogoClick, onTopUpClick, activeView, onViewChange }) => {
  const navItems: { id: CreatorView; label: string; icon: string }[] = [
    { id: 'tool', label: 'Studio Sáng Tạo', icon: 'ph-magic-wand' },
    { id: 'gallery', label: 'Thư viện', icon: 'ph-images' },
    { id: 'leaderboard', label: 'Xếp hạng', icon: 'ph-trophy' },
  ];

  const getNavClass = (view: CreatorView) => 
    `px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 flex items-center gap-2 ${
      activeView === view 
        ? 'bg-pink-500/10 text-pink-300 border border-pink-500/30 shadow-md shadow-pink-500/10' 
        : 'text-gray-400 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-[#0B0B0F]/80 backdrop-blur-lg border-b border-pink-500/10">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-20">
          <div className="cursor-pointer" onClick={onLogoClick}>
            <h1 className="text-2xl font-bold">
              <span className="bg-gradient-to-r from-[#FF3FA4] to-[#CA27FF] text-transparent bg-clip-text">Audition AI</span>
              <span className="text-white ml-2 text-lg opacity-80">Studio</span>
            </h1>
          </div>

          <nav className="hidden md:flex items-center gap-2 p-1 bg-black/20 rounded-full border border-white/10">
            {navItems.map(item => (
              <button key={item.id} onClick={() => onViewChange(item.id)} className={getNavClass(item.id)}>
                <i className={`ph-fill ${item.icon}`}></i> {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <div
                  onClick={onTopUpClick}
                  className="hidden sm:flex items-center gap-2 bg-white/10 pl-2 pr-4 py-1.5 rounded-full cursor-pointer hover:bg-white/20 transition group"
                >
                  <div className="bg-gradient-to-br from-pink-500 to-fuchsia-600 w-8 h-8 rounded-full flex items-center justify-center group-hover:animate-pulse">
                    <i className="ph-fill ph-plus text-lg"></i>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <i className="ph-fill ph-diamonds-four text-pink-400"></i>
                    <span className="font-bold">{user.diamonds}</span>
                  </div>
                </div>
                <div className="relative group">
                    <img src={user.photo_url} alt={user.display_name} className="w-11 h-11 rounded-full cursor-pointer border-2 border-transparent group-hover:border-pink-500 transition-colors" onClick={() => onViewChange('settings')}/>
                    <div className="absolute bottom-0 right-0 bg-gray-800 rounded-full p-0.5 border-2 border-[#0B0B0F]">
                         <button onClick={() => onViewChange('settings')} className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-gray-300 hover:bg-white/20 hover:text-white">
                            <i className="ph-fill ph-gear-six text-xs"></i>
                         </button>
                    </div>
                </div>

              </div>
            ) : (
                <button onClick={onLogoClick} className="px-4 py-2 text-sm font-semibold bg-white/10 rounded-full hover:bg-white/20 transition">
                    Đăng nhập
                </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default CreatorHeader;
