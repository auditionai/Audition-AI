
import React from 'react';
import { getCosmeticById } from '../../constants/cosmetics';

interface UserAvatarProps {
    url: string;
    alt: string;
    frameId?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ url, alt, frameId, size = 'md', className = '' }) => {
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

    return (
        <div 
            className={`avatar-frame-container ${frame?.cssClass} ${className}`}
            style={getSizeStyle()}
        >
            <img src={url} alt={alt} />
        </div>
    );
};

export default UserAvatar;
