
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
    
    // Logic: Use user's equipped ID if user obj exists (even if null/undefined to support unequip). 
    // Fallback to effectId prop if user obj is not provided.
    // Important: If user exists but equipped_name_effect_id is missing/null, it means "no effect".
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
