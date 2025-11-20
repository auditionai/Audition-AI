
import React from 'react';
import { useGameConfig } from '../../contexts/GameConfigContext';
import { useTranslation } from '../../hooks/useTranslation';

interface UserBadgeProps {
    titleId?: string;
    className?: string;
}

const UserBadge: React.FC<UserBadgeProps> = ({ titleId, className = '' }) => {
    const { t } = useTranslation();
    const { getCosmeticById } = useGameConfig();
    const title = getCosmeticById(titleId, 'title');

    if (!title) return null;

    const displayName = title.nameKey ? t(title.nameKey) : title.name;

    // Legacy: Full image replacement for title (if imageUrl is present)
    if (title.imageUrl) {
        return <img src={title.imageUrl} alt={displayName} className={`h-5 w-auto ${className}`} />;
    }

    // New Style: Icon is rendered OUTSIDE the badge frame
    if (title.iconUrl) {
        return (
            <span className={`inline-flex items-center gap-1.5 ${className}`}>
                {/* Icon outside */}
                <img src={title.iconUrl} alt="" className="w-5 h-5 object-contain" />
                {/* Title Badge Frame */}
                <span className={`title-badge ${title.cssClass || ''}`} title={displayName}>
                    {displayName}
                </span>
            </span>
        );
    }

    // Default: Just the badge frame with text
    return (
        <span className={`title-badge ${title.cssClass || ''} ${className}`} title={displayName}>
            {displayName}
        </span>
    );
};

export default UserBadge;
