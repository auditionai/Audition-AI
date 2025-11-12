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
                // These routes are for logged-in users.
                // If the user is not logged in, AuthContext handles redirection,
                // but we render HomePage as a safe fallback.
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
        
        // Apply the theme wrapper universally to all pages.
        return (
            <div data-theme={theme}>
                {pageComponent}
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