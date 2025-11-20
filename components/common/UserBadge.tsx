
import React from 'react';
import { useGameConfig } from '../../contexts/GameConfigContext';
import { useTranslation } from '../../hooks/useTranslation';

interface UserBadgeProps {
    titleId?: string;
    className?: string;
    level?: number; // Added level for auto-equip logic
}

const UserBadge: React.FC<UserBadgeProps> = ({ titleId, className = '', level }) => {
    const { t } = useTranslation();
    const { getCosmeticById, getBestCosmeticForLevel } = useGameConfig();
    
    let title = getCosmeticById(titleId, 'title');

    // Auto-equip logic: If no specific title is equipped (or it's the legacy 'newbie'), 
    // and we know the user's level, find the best title for that level.
    if ((!titleId || titleId === 'newbie') && level !== undefined) {
        title = getBestCosmeticForLevel('title', level);
    }

    // Fallback
    if (!title) {
         title = getCosmeticById('newbie', 'title');
    }

    if (!title) return null;

    // Determine display name: Use translation key if available (default items), otherwise use raw name (custom items)
    const displayName = title.nameKey ? t(title.nameKey) : (title.name || 'Title');

    return (
        <div className={`inline-flex items-center gap-1.5 ${className}`} style={{ verticalAlign: 'middle' }}>
            {/* Render Icon OUTSIDE the badge frame if it exists */}
            {title.iconUrl && (
                <img 
                    src={title.iconUrl} 
                    alt="" 
                    className="w-5 h-5 object-contain flex-shrink-0 drop-shadow-md" 
                    loading="lazy"
                />
            )}
            
            {/* Render the Title Text Badge */}
            {title.imageUrl ? (
                // Legacy support: If the title itself is an image
                <img src={title.imageUrl} alt={displayName} className="h-5 w-auto" />
            ) : (
                // Standard CSS Badge
                <span className={`title-badge ${title.cssClass || ''}`} title={displayName}>
                    {displayName}
                </span>
            )}
        </div>
    );
};

export default UserBadge;
