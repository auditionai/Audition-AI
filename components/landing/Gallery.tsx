
import React from 'react';
import { GalleryImage } from '../../types';
import { getRankForLevel } from '../../utils/rankUtils';
import UserBadge from '../common/UserBadge';
import UserAvatar from '../common/UserAvatar';
import UserName from '../common/UserName'; // Import UserName

interface GalleryProps {
  images: GalleryImage[];
  onImageClick: (image: GalleryImage) => void;
  limit?: number;
  showSeeMore?: boolean;
  onSeeMoreClick?: () => void;
  displayMode?: 'grid' | 'slider';
}

const Gallery: React.FC<GalleryProps> = ({ images, onImageClick, limit, showSeeMore = false, onSeeMoreClick, displayMode = 'grid' }) => {
  const imagesToShow = limit ? images.slice(0, limit) : images;
  
  const seeMoreButton = showSeeMore && (
    <div className="mt-12 text-center">
        <button
            onClick={onSeeMoreClick}
            className="px-8 py-4 font-bold text-lg text-white bg-white/10 backdrop-blur-sm border border-white/20 rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1"
        >
            Xem thêm trong thư viện
            <i className="ph-fill ph-arrow-right ml-2"></i>
        </button>
    </div>
  );

  if (displayMode === 'slider') {
    const duplicatedImages = [...images, ...images];
    return (
      <>
        <div className="image-slider-container">
          <div className="image-slider-track">
            {duplicatedImages.map((image, index) => {
              const rank = getRankForLevel(image.creator.level);
              return (
                <div 
                  key={`${image.id}-${index}`} 
                  className="slider-image-item group relative rounded-xl overflow-hidden cursor-pointer interactive-3d aspect-[3/4]"
                  onClick={() => onImageClick(image)}
                >
                  <img 
                    src={image.image_url} 
                    alt={`Tác phẩm của ${image.creator.display_name}`}
                    className="w-full h-full object-cover transition-transform duration-500 ease-in-out group-hover:scale-110"
                  />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-100 transition-opacity duration-300"></div>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <i className="ph-fill ph-eye text-5xl text-white"></i>
                    </div>
                    <div className="absolute bottom-0 left-0 p-4 w-full opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                      <div className="flex items-center gap-3">
                          {/* Use UserAvatar for consistent frame display */}
                          <UserAvatar 
                            url={image.creator.photo_url} 
                            alt={image.creator.display_name} 
                            frameId={image.creator.equipped_frame_id}
                            level={image.creator.level}
                            size="sm" 
                            className="flex-shrink-0"
                          />
                          <div className="truncate flex flex-col gap-1">
                            {/* Use UserName for Name Effects */}
                            <UserName 
                                user={image.creator} 
                                className={`font-bold text-sm drop-shadow-lg truncate ${rank.color}`}
                            />
                            {/* Use UserBadge for icon and title display */}
                            <div className="flex items-center">
                                <UserBadge titleId={image.creator.equipped_title_id} level={image.creator.level} className="scale-90 origin-left" />
                            </div>
                          </div>
                      </div>
                    </div>
                </div>
              )
            })}
          </div>
        </div>
        {seeMoreButton}
      </>
    );
  }

  // Default Grid Layout
  return (
    <div className="container mx-auto px-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {imagesToShow.map((image) => {
          const rank = getRankForLevel(image.creator.level);
          return (
            <div 
              key={image.id} 
              className="group relative rounded-xl overflow-hidden cursor-pointer interactive-3d aspect-[3/4]"
              onClick={() => onImageClick(image)}
            >
              <img 
                src={image.image_url} 
                alt={`Tác phẩm của ${image.creator.display_name}`}
                className="w-full h-full object-cover transition-transform duration-500 ease-in-out group-hover:scale-110"
              />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-100 transition-opacity duration-300"></div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <i className="ph-fill ph-eye text-5xl text-white"></i>
                </div>
                <div className="absolute bottom-0 left-0 p-4 w-full opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                  <div className="flex items-center gap-3">
                      <UserAvatar 
                        url={image.creator.photo_url} 
                        alt={image.creator.display_name} 
                        frameId={image.creator.equipped_frame_id}
                        level={image.creator.level}
                        size="sm" 
                        className="flex-shrink-0"
                      />
                      <div className="truncate flex flex-col gap-1">
                        {/* Use UserName for Name Effects */}
                        <UserName 
                            user={image.creator} 
                            className={`font-bold text-sm drop-shadow-lg truncate ${rank.color}`} 
                        />
                         <div className="flex items-center">
                            <UserBadge titleId={image.creator.equipped_title_id} level={image.creator.level} className="scale-90 origin-left" />
                         </div>
                      </div>
                  </div>
                </div>
            </div>
          )
        })}
      </div>
      {seeMoreButton}
    </div>
  );
};

export default Gallery;
