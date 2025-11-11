import React, { useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';

// Import Pages
import HomePage from './pages/HomePage';
import CreatorPage from './pages/CreatorPage';
import GalleryPage from './pages/GalleryPage';
import BuyCreditsPage from './pages/BuyCreditsPage';

// Import Common Components
import RewardNotification from './components/common/RewardNotification';
import ThemeEffects from './components/themes/ThemeEffects';

const App: React.FC = () => {
    const { user, loading, route, toast, reward, clearReward } = useAuth();
    const { theme } = useTheme();

    // CRITICAL FIX V2: Make theming explicit for all states.
    // Instead of adding/removing the attribute, we now explicitly switch between
    // a 'landing' theme and the user-selected creator 'theme'. This is more robust
    // and avoids race conditions or CSS conflicts where :root styles might interfere.
    useEffect(() => {
        const isCreatorInterface = ['tool', 'leaderboard', 'my-creations', 'settings', 'admin-gallery', 'buy-credits'].includes(route);
        if (isCreatorInterface && user) {
             document.body.setAttribute('data-theme', theme);
        } else {
            // Apply a specific, explicit theme for the landing page.
            document.body.setAttribute('data-theme', 'landing');
        }
    }, [theme, route, user]);


    if (loading) {
        return (
            <div className="fixed inset-0 bg-[#0B0B0F] flex items-center justify-center z-[9999]">
                <div className="w-16 h-16 border-4 border-gray-800 border-t-pink-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    const renderPage = () => {
        // Determine which page component to render based on the route and user status
        switch (route) {
            case 'tool':
            case 'leaderboard':
            case 'my-creations':
            case 'settings':
            case 'admin-gallery':
                return user ? <CreatorPage activeTab={route} /> : <HomePage />;
            case 'buy-credits':
                return user ? <BuyCreditsPage /> : <HomePage />;
            case 'gallery':
                return <GalleryPage />;
            case 'home':
            default:
                return <HomePage />;
        }
    };
    
    const isCreatorInterface = ['tool', 'leaderboard', 'my-creations', 'settings', 'admin-gallery', 'buy-credits'].includes(route);

    return (
        <>
            {/* Conditionally render theme effects for creator pages */}
            {isCreatorInterface && user && <ThemeEffects />}

            {renderPage()}
            
            {/* Global Toast Notification */}
            {toast && (
                <div 
                    className={`fixed top-5 right-5 z-[9999] p-4 rounded-lg shadow-lg animate-fade-in-down
                        ${toast.type === 'success' ? 'bg-green-500/80 backdrop-blur-sm' : 'bg-red-500/80 backdrop-blur-sm'} text-white`}
                >
                    <p className="font-semibold">{toast.message}</p>
                </div>
            )}
            
            {/* Global Reward Notification */}
            {reward && (reward.diamonds > 0 || reward.xp > 0) && (
                 <RewardNotification reward={reward} onDismiss={clearReward} />
            )}
        </>
    );
};

export default App;