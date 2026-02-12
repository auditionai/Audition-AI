
import React from 'react';
import { useGameConfig } from '../../contexts/GameConfigContext';

interface UserAvatarProps {
    url: string;
    alt: string;
    frameId?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    level?: number; 
}

const UserAvatar: React.FC<UserAvatarProps> = ({ url, alt, frameId, size = 'md', className = '' }) => {
    const { getCosmeticById } = useGameConfig();
    
    let frame = getCosmeticById(frameId, 'frame');

    const getSizeStyle = () => {
        switch(size) {
            case 'sm': return { width: '36px', height: '36px' }; // Slightly larger for visibility
            case 'md': return { width: '52px', height: '52px' }; // Match dock item height
            case 'lg': return { width: '96px', height: '96px' };
            case 'xl': return { width: '128px', height: '128px' };
            default: return { width: '52px', height: '52px' };
        }
    };

    const containerStyle = getSizeStyle();

    return (
        <div 
            className={`avatar-frame-container relative flex-shrink-0 ${frame?.cssClass || 'frame-none'} ${className}`}
            style={containerStyle}
        >
            {/* FORCE ROUNDED FULL HERE */}
            <img 
                src={url} 
                alt={alt} 
                className="w-full h-full object-cover rounded-full border border-white/10 shadow-md"
            />
            
            {frame?.imageUrl && (
                <img 
                    src={frame.imageUrl} 
                    alt="frame" 
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10 scale-125"
                />
            )}
        </div>
    );
};

export default UserAvatar;
