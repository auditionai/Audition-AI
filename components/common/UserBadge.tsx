
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
                <img src={title.imageUrl} alt={displayName} className="h-5 w-auto" />
            ) : (
                displayName
            )}
        </span>
    );
};

export default UserBadge;
