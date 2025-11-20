
import React from 'react';
import { getCosmeticById } from '../../constants/cosmetics';
import { useTranslation } from '../../hooks/useTranslation';

interface UserBadgeProps {
    titleId?: string;
    className?: string;
}

const UserBadge: React.FC<UserBadgeProps> = ({ titleId, className = '' }) => {
    const { t } = useTranslation();
    const title = getCosmeticById(titleId, 'title');

    if (!title) return null;

    return (
        <span className={`title-badge ${title.cssClass} ${className}`}>
            {t(title.nameKey)}
        </span>
    );
};

export default UserBadge;
