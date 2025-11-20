
import React from 'react';
import { useGameConfig } from '../../contexts/GameConfigContext';

interface UserAvatarProps {
    url: string;
    alt: string;
    frameId?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ url, alt, frameId, size = 'md', className = '' }) => {
    const { getCosmeticById } = useGameConfig();
    const frame = getCosmeticById(frameId, 'frame');
    
    // Map size prop to specific pixel width/height style
    const getSizeStyle = () => {
        switch(size) {
            case 'sm': return { width: '32px', height: '32px' };
            case 'md': return { width: '48px', height: '48px' };
            case 'lg': return { width: '96px', height: '96px' };
            case 'xl': return { width: '128px', height: '128px' };
            default: return { width: '48px', height: '48px' };
        }
    };

    const containerStyle = getSizeStyle();

    return (
        <div 
            className={`avatar-frame-container ${frame?.cssClass || 'frame-none'} ${className}`}
            style={containerStyle}
        >
            <img src={url} alt={alt} />
            {/* Render image overlay if frame has an image_url instead of just CSS */}
            {frame?.imageUrl && (
                <img 
                    src={frame.imageUrl} 
                    alt="frame" 
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
                    style={{ transform: 'scale(1.2)' }} // Scale up frame slightly to fit avatar inside
                />
            )}
        </div>
    );
};

export default UserAvatar;
