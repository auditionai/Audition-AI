
import React from 'react';
import { useAuth } from './contexts/AuthContext';
import { GameConfigProvider } from './contexts/GameConfigContext';
import { ChatProvider } from './contexts/ChatContext';

// Import Pages
import HomePage from './pages/HomePage';
import CreatorPage from './pages/CreatorPage';
import GalleryPage from './pages/GalleryPage';
import BuyCreditsPage from './pages/BuyCreditsPage';
import ProfilePage from './pages/ProfilePage';
import UserProfilePage from './pages/UserProfilePage';
import MessagesPage from './pages/MessagesPage';
import ShopPage from './pages/ShopPage'; // NEW

// Import Common Components
import RewardNotification from './components/common/RewardNotification';
import GlobalChat from './components/chat/GlobalChat';

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
            case 'leaderboard':
            case 'my-creations':
            case 'settings':
            case 'admin-gallery':
                pageComponent = user ? <CreatorPage activeTab={route} /> : <HomePage />;
                break;
            case 'profile':
                pageComponent = user ? <ProfilePage /> : <HomePage />;
                break;
            case 'user':
                // user/:id logic is handled inside UserProfilePage by parsing window.location
                pageComponent = user ? <UserProfilePage /> : <HomePage />;
                break;
            case 'messages':
                pageComponent = user ? <MessagesPage /> : <HomePage />;
                break;
            case 'shop':
                pageComponent = user ? <ShopPage /> : <HomePage />;
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
        
        return pageComponent;
    };

    return (
        <>
            {renderPage()}
            
            {/* Global Chat is always available if logged in */}
            {user && <GlobalChat />}
            
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
            <ChatProvider>
                <AppContent />
            </ChatProvider>
        </GameConfigProvider>
    );
}

export default App;
