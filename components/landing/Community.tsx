import React from 'react';
import { GalleryImage } from '../../types';
import Gallery from './Gallery';

interface CommunityProps {
  images: GalleryImage[];
  onLoginClick: () => void;
  onImageClick: (image: GalleryImage) => void;
  onSeeMoreClick: () => void;
}

const Community: React.FC<CommunityProps> = ({ images, onImageClick, onSeeMoreClick }) => {
  return (
    <div className="py-12 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
             <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Cộng Đồng Sáng Tạo</span>
          </h2>
          <p className="text-lg text-gray-400">
            Khám phá những tác phẩm độc đáo được tạo ra bởi những người dùng khác và tìm cảm hứng cho riêng bạn.
          </p>
        </div>
         <Gallery 
            images={images}
            onImageClick={onImageClick}
            displayMode="slider"
            showSeeMore={true}
            onSeeMoreClick={onSeeMoreClick}
          />
      </div>
    </div>
  );
};

export default Community;
