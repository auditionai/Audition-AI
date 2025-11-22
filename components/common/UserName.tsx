
import React from 'react';
import { useGameConfig } from '../../contexts/GameConfigContext';

interface UserNameProps {
    name?: string;
    effectId?: string;
    className?: string;
    // Optional shortcut to pass full user object
    user?: {
        display_name?: string;
        equipped_name_effect_id?: string;
    } | null;
}

const UserName: React.FC<UserNameProps> = ({ name, effectId, className = '', user }) => {
    const { getCosmeticById } = useGameConfig();
    
    const displayName = user?.display_name || name || 'Unknown';
    // FIX: Handle case where user exists but equipped_name_effect_id is missing in DB response
    const activeEffectId = user ? (user.equipped_name_effect_id || undefined) : effectId;
    
    const effect = getCosmeticById(activeEffectId, 'name_effect');
    const cssClass = effect?.cssClass || 'name-effect-base';

    return (
        <span 
            className={`${cssClass} ${className}`} 
            data-text={displayName} /* Used for glitch effect content duplication */
        >
            {displayName}
        </span>
    );
};

export default UserName;