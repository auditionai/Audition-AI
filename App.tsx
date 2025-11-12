import React from 'react';
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

    if (loading) {
        return (
            <div className="fixed inset-0 bg-[#0B0B0F] flex items-center justify-center z-[9999]">
                <div className="w-16 h-16 border-4 border-gray-800 border-t-pink-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    const renderPage = () => {
        let pageComponent;

        // Determine which page component to render based on the route and user status
        switch (route) {
            case 'tool':
            case 'leaderboard':
            case 'my-creations':
            case 'settings':
            case 'admin-gallery':
                pageComponent = user ? <CreatorPage activeTab={route} /> : <HomePage />;
                break;
            case 'buy-credits':
                pageComponent = user ? <BuyCreditsPage /> : <HomePage />;
                break;
            case 'gallery':
                pageComponent = <GalleryPage />;
                break;
            case 'home':
            default:
                pageComponent = <HomePage />;
        }
        
        // The outer div sets the base background color.
        // ThemeEffects is now a sibling, and the main content has a transparent background
        // and a higher z-index, allowing the effects to be visible underneath.
        return (
            <div data-theme={theme} className="relative bg-skin-fill">
                <ThemeEffects />
                <div className="relative z-[1] bg-transparent">
                    {pageComponent}
                </div>
            </div>
        );
    };

    return (
        <>
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
