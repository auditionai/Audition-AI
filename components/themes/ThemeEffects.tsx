// FIX: Create the content for the ThemeEffects component to provide theme-specific background visuals.
import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * A component that renders different animated background effects based on the currently active theme.
 * The actual animations and styles for classes like 'galaxy-stars' or 'snowflake' are assumed
 * to be defined in a global CSS file (e.g., index.css).
 */
const ThemeEffects: React.FC = () => {
    const { theme } = useTheme();

    const renderEffects = () => {
        switch (theme) {
            case 'dreamy-galaxy':
                // Multiple layers of stars for a parallax effect
                return (
                    <>
                        <div className="galaxy-stars"></div>
                        <div className="galaxy-stars2"></div>
                        <div className="galaxy-stars3"></div>
                    </>
                );
            case 'classic-dark': // Christmas theme
                return (
                    <div className="snowflakes" aria-hidden="true">
                        {/* Generate multiple snowflakes for a blizzard effect */}
                        {[...Array(25)].map((_, i) => (
                            <div key={i} className="snowflake" />
                        ))}
                    </div>
                );
            case 'neon-vibe': // Crystal Castle theme
                return (
                    <div className="shards" aria-hidden="true">
                        {[...Array(15)].map((_, i) => (
                            <div key={i} className="shard" />
                        ))}
                    </div>
                );
            case 'solar-flare': // Pastel Candy theme
                 return (
                    <div className="bubbles" aria-hidden="true">
                        {[...Array(20)].map((_, i) => (
                            <div key={i} className="bubble" />
                        ))}
                    </div>
                );
            case 'cyber-punk': // Neon Dance theme
                 return (
                    // A simple scanlines effect for the cyberpunk feel
                    <div className="scanlines"></div>
                );
            default:
                // Return null if no theme matches or for themes without special effects
                return null;
        }
    };

    // This container ensures the effects are fixed in the background and don't interfere with content.
    return (
        <div className="fixed inset-0 w-full h-full -z-10 pointer-events-none overflow-hidden">
            {renderEffects()}
        </div>
    );
};

export default ThemeEffects;
