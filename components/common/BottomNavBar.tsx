import React from 'react';

type CreatorView = 'tool' | 'gallery' | 'leaderboard' | 'buy' | 'settings';

interface BottomNavBarProps {
  activeView: CreatorView;
  onViewChange: (view: CreatorView) => void;
}

const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeView, onViewChange }) => {
  const navItems: { id: CreatorView; label: string; icon: string }[] = [
    { id: 'tool', label: 'Studio', icon: 'ph-magic-wand' },
    { id: 'gallery', label: 'Thư viện', icon: 'ph-images' },
    { id: 'leaderboard', label: 'Xếp hạng', icon: 'ph-trophy' },
    { id: 'buy', label: 'Nạp KC', icon: 'ph-diamonds-four' },
    { id: 'settings', label: 'Cài đặt', icon: 'ph-user-circle' },
  ];

  const getNavClass = (view: CreatorView) => 
    `flex flex-col items-center justify-center gap-1 w-full transition-colors duration-200 ${
      activeView === view ? 'text-pink-400' : 'text-gray-500 hover:text-white'
    }`;

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-[#12121A]/80 backdrop-blur-lg border-t border-pink-500/10 p-2 md:hidden z-50">
      <div className="flex justify-around items-center">
        {navItems.map(item => (
          <button key={item.id} onClick={() => onViewChange(item.id)} className={getNavClass(item.id)}>
            <i className={`ph-fill ${item.icon} text-2xl`}></i>
            <span className="text-xs font-semibold">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default BottomNavBar;
