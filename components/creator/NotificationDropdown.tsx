import React from 'react';
import { CHANGELOG_DATA } from '../../constants/changelogData';
import { useTranslation } from '../../hooks/useTranslation';

interface NotificationDropdownProps {
  onClose: () => void;
}

const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ onClose }) => {
  const { t } = useTranslation();
  return (
    <div className="absolute right-0 mt-3 top-full w-80 sm:w-96 origin-top-right bg-[#1e1b25] border border-white/10 rounded-md shadow-lg z-50 animate-fade-in-down">
      <div className="p-4 border-b border-white/10">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-white">{t('creator.header.notifications.title')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <i className="ph-fill ph-x"></i>
          </button>
        </div>
      </div>
      <div className="p-2 max-h-96 overflow-y-auto custom-scrollbar">
        {CHANGELOG_DATA.map(item => (
          <div key={item.id} className="p-3 hover:bg-white/5 rounded-lg">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="font-bold bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">{item.version}</span>
              <span className="text-gray-500">{item.date}</span>
            </div>
            <p className="font-semibold text-white text-sm">{t(item.title)}</p>
            <p className="text-xs text-gray-400">{t(item.description)}</p>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-white/10 text-center">
        <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }} className="text-sm font-semibold text-pink-400 hover:text-pink-300">
          {t('creator.header.notifications.close')}
        </a>
      </div>
    </div>
  );
};

export default NotificationDropdown;