import React from 'react';
import { AVATAR_FRAMES } from '../../constants/cosmetics';

interface UserAvatarProps {
    src: string;
    alt: string;
    frameId?: string | null;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ src, alt, frameId, size = 'md', className = '' }) => {
    const frame = AVATAR_FRAMES.find(f => f.id === frameId) || AVATAR_FRAMES[0];
    
    const sizeClasses = {
        sm: 'w-8 h-8',
        md: 'w-12 h-12',
        lg: 'w-20 h-20',
        xl: 'w-32 h-32'
    };

    const imgClasses = `rounded-full object-cover w-full h-full`;

    return (
        <div className={`avatar-frame-container ${frame.cssClass} ${sizeClasses[size]} ${className}`}>
            <img src={src} alt={alt} className={imgClasses} />
        </div>
    );
};

export default UserAvatar;
