import React from 'react';
import { ACHIEVEMENT_TITLES } from '../../constants/cosmetics';

interface UserBadgeProps {
    titleId?: string | null;
    className?: string;
}

const UserBadge: React.FC<UserBadgeProps> = ({ titleId, className = '' }) => {
    if (!titleId || titleId === 'title_none') return null;

    const title = ACHIEVEMENT_TITLES.find(t => t.id === titleId);
    if (!title) return null;

    return (
        <span className={`title-badge ${title.cssClass} ${className}`}>
            {title.name}
        </span>
    );
};

export default UserBadge;
