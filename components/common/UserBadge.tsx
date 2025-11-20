
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

    return (
        <span className={`title-badge ${title.cssClass || ''} ${className}`} title={displayName}>
            {title.imageUrl ? (
                // Full image replacement (legacy/graphic titles)
                <img src={title.imageUrl} alt={displayName} className="h-5 w-auto" />
            ) : (
                // CSS Style + Optional Icon + Text
                <span className="flex items-center gap-1">
                    {title.iconUrl && (
                         <img src={title.iconUrl} alt="" className="w-3.5 h-3.5 object-contain" />
                    )}
                    <span>{displayName}</span>
                </span>
            )}
        </span>
    );
};

export default UserBadge;
