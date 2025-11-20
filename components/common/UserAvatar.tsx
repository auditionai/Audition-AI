
import React from 'react';
import { getCosmeticById } from '../../constants/cosmetics';

interface UserAvatarProps {
    url: string;
    alt: string;
    frameId?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-24 h-24',
    xl: 'w-32 h-32',
};

const UserAvatar: React.FC<UserAvatarProps> = ({ url, alt, frameId, size = 'md', className = '' }) => {
    const frame = getCosmeticById(frameId, 'frame');
    const sizeClass = sizeClasses[size];

    return (
        <div className={`avatar-frame-container ${frame?.cssClass} ${className}`}>
            <img src={url} alt={alt} className={`${sizeClass} rounded-full object-cover`} />
        </div>
    );
};

export default UserAvatar;
