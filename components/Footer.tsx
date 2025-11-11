import React from 'react';
import { Stats } from '../types';
import Logo from './common/Logo';

interface FooterProps {
  stats: Stats;
  onInfoLinkClick: (key: 'terms' | 'policy' | 'contact') => void;
}

const Footer: React.FC<FooterProps> = ({ stats, onInfoLinkClick }) => {
  return (
    <footer className="bg-skin-fill-secondary border-t border-skin-border text-skin-base relative z-10">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
          <div className="flex flex-col items-center md:items-start">
            <Logo onClick={() => window.scrollTo(0, 0)} />
            <p className="text-skin-muted mt-4 text-sm max-w-xs">
              Nền tảng sáng tạo ảnh 3D AI theo phong cách Audition độc đáo.
            </p>
          </div>
          
          <div>
            <h3 className="font-bold text-lg mb-4 text-skin-accent">Thông tin</h3>
            <nav className="flex flex-col space-y-2 text-skin-muted">
              <a onClick={() => onInfoLinkClick('terms')} className="hover:text-skin-base cursor-pointer transition">Chính sách Kim Cương</a>
              <a onClick={() => onInfoLinkClick('policy')} className="hover:text-skin-base cursor-pointer transition">Chính sách Bảo mật</a>
              <a onClick={() => onInfoLinkClick('contact')} className="hover:text-skin-base cursor-pointer transition">Liên hệ & Hỗ trợ</a>
            </nav>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-4 text-skin-accent">Thống kê</h3>
            <div className="space-y-2 text-skin-muted">
              <p><strong>{stats.users.toLocaleString('vi-VN')}</strong> Người dùng</p>
              <p><strong>{stats.visits.toLocaleString('vi-VN')}</strong> Lượt truy cập</p>
              <p><strong>{stats.images.toLocaleString('vi-VN')}</strong> Tác phẩm được tạo</p>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-skin-border text-center text-skin-muted text-sm">
          <p>&copy; {new Date().getFullYear()} AUDITION AI Studio. Sáng tạo bởi Nguyễn Quốc Cường.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;