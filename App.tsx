
import React from 'react';
import { useAuth } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
import CreatorPage from './pages/CreatorPage';
import BuyCreditsPage from './pages/BuyCreditsPage';
import GalleryPage from './pages/GalleryPage';
import RewardNotification from './components/common/RewardNotification';
import ThemeEffects from './components/themes/ThemeEffects';

const Toast: React.FC<{ message: string, type: 'success' | 'error', onDismiss: () => void }> = ({ message, type, onDismiss }) => {
    React.useEffect(() => {
        const timer = setTimeout(onDismiss, 4000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    const icon = type === 'success' ? 'ph-check-circle' : 'ph-warning-circle';
    const colors = type === 'success' ? 'bg-green-500/80 border-green-400/50' : 'bg-red-500/80 border-red-400/50';

    return (
        <div className={`fixed top-5 right-5 z-[9999] flex items-center gap-3 p-4 rounded-lg shadow-lg text-white backdrop-blur-md border animate-fade-in-down ${colors}`}>
            <i className={`ph-fill ${icon} text-2xl`}></i>
            <span className="font-semibold">{message}</span>
        </div>
    );
};

const LoadingSpinner: React.FC = () => (
    <div className="fixed inset-0 bg-skin-fill flex flex-col justify-center items-center z-[10000]">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-4 border-skin-accent/30 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-t-skin-accent rounded-full animate-spin"></div>
      </div>
      <p className="mt-6 text-lg text-skin-muted font-semibold animate-pulse">Đang tải...</p>
    </div>
);


const App: React.FC = () => {
    const { loading, route, toast, showToast, user, reward, clearReward } = useAuth();
    
    const renderPage = () => {
        if (loading) {
            return <LoadingSpinner />;
        }
        
        // Always show CreatorPage if user is logged in, unless they're explicitly on a public page
        if (user) {
             switch (route) {
                case 'home':
                case 'tool':
                case 'leaderboard':
                case 'my-creations':
                case 'settings':
                case 'admin-gallery':
                    return <CreatorPage activeTab={route === 'home' ? 'tool' : route} />;
                case 'buy-credits':
                    return <BuyCreditsPage />;
                case 'gallery':
                    return <GalleryPage />;
                default:
                    return <CreatorPage activeTab="tool" />;
            }
        }
        
        // Public pages for logged-out users
        switch(route) {
            case 'gallery':
                return <GalleryPage />;
            case 'home':
            default:
                return <HomePage />;
        }
    };

    return (
        <>
            <ThemeEffects />
            {renderPage()}
            {toast && toast.message && <Toast message={toast.message} type={toast.type} onDismiss={() => showToast('', 'success')} />}
            {reward && (reward.diamonds > 0 || reward.xp > 0) && (
                <RewardNotification reward={reward} onDismiss={clearReward} />
            )}
        </>
    );
};

export default App;
