
import React from 'react';
import { useAuth } from './contexts/AuthContext';
import { GameConfigProvider } from './contexts/GameConfigContext';

// Import Pages
import HomePage from './pages/HomePage';
import CreatorPage from './pages/CreatorPage';
import GalleryPage from './pages/GalleryPage';
import BuyCreditsPage from './pages/BuyCreditsPage';

// Import Common Components
import RewardNotification from './components/common/RewardNotification';
import MarqueeBanner from './components/common/MarqueeBanner';

const AppContent: React.FC = () => {
    const { user, loading, route, toast, reward, clearReward } = useAuth();

    if (loading) {
        return (
            <div className="fixed inset-0 bg-[#0B0B0F] flex items-center justify-center z-[9999]">
                <div className="w-16 h-16 border-4 border-gray-800 border-t-pink-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    const renderPage = () => {
        let pageComponent;

        switch (route) {
            case 'tool':
            case 'my-creations':
            case 'settings':
                pageComponent = user ? <CreatorPage activeTab={route} /> : <HomePage />;
                break;
            case 'buy-credits':
                pageComponent = <BuyCreditsPage />;
                break;
            case 'gallery':
                pageComponent = <GalleryPage />;
                break;
            case 'home':
            default:
                pageComponent = <HomePage />;
        }
        
        return pageComponent;
    };

    return (
        <>
            {/* GLOBAL PROMOTION BANNER - VISIBLE TO ALL */}
            <MarqueeBanner />

            {renderPage()}
            
            {toast && (
                <div 
                    className={`fixed top-5 right-5 z-[9999] p-4 rounded-lg shadow-lg animate-fade-in-down
                        ${toast.type === 'success' ? 'bg-green-500/80 backdrop-blur-sm' : 'bg-red-500/80 backdrop-blur-sm'} text-white`}
                >
                    <p className="font-semibold">{toast.message}</p>
                </div>
            )}
            
            {reward && (reward.diamonds > 0 || reward.xp > 0) && (
                 <RewardNotification reward={reward} onDismiss={clearReward} />
            )}
        </>
    );
};

const App: React.FC = () => {
    return (
        <GameConfigProvider>
            <AppContent />
        </GameConfigProvider>
    );
}

export default App;