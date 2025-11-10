import { useEffect } from 'react';
import HomePage from './pages/HomePage';
import CreatorPage, { CreatorTab } from './pages/CreatorPage';
import GalleryPage from './pages/GalleryPage';
import { useAuth } from './contexts/AuthContext';
import BuyCreditsPage from './pages/BuyCreditsPage';
import RewardNotification from './components/common/RewardNotification';

// Khai báo type cho hàm gtag của Google Analytics trên window object
declare global {
  interface Window {
    gtag?: (command: string, targetId: string, config: { page_path: string }) => void;
  }
}

const AppLoadingScreen = () => (
  <div className="fixed inset-0 bg-[#0B0B0F] flex items-center justify-center z-[9999]">
    <div className="text-center">
        <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 border-4 border-pink-500/30 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-t-pink-500 rounded-full animate-spin"></div>
        </div>
        <p className="mt-4 text-lg font-semibold text-gray-300 animate-pulse">Đang khởi tạo Audition AI...</p>
    </div>
  </div>
);

function App() {
  const { user, toast, loading, route, reward, clearReward } = useAuth();

  // Gửi page_view đến Google Analytics mỗi khi route thay đổi
  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('config', 'G-32R3PLY2JT', {
        page_path: window.location.pathname,
      });
    }
  }, [route]);


  if (loading) {
    return <AppLoadingScreen />;
  }

  const renderPage = () => {
    const creatorTabs: CreatorTab[] = ['tool', 'leaderboard', 'my-creations', 'settings'];
    const adminTabs: string[] = ['admin-gallery'];

    if (user) {
        if (creatorTabs.includes(route as CreatorTab)) {
            return <CreatorPage activeTab={route as CreatorTab} />;
        }
        if (adminTabs.includes(route) && user.is_admin) {
            return <CreatorPage activeTab={route as 'admin-gallery'} />;
        }
        if (route === 'gallery') {
            return <GalleryPage />;
        }
        if (route === 'buy-credits') {
            return <BuyCreditsPage />;
        }
        // If logged in and route is 'home' or invalid, default to 'tool'
        return <CreatorPage activeTab="tool" />;
    } else {
        // Logged out users
        if (route === 'gallery') {
            return <GalleryPage />;
        }
        // For any other route (including 'home' or protected routes like 'settings'), show HomePage
        return <HomePage />;
    }
  }

  return (
    <div className="bg-[#0B0B0F] text-white selection:bg-pink-500 selection:text-white">
      {renderPage()}

      {/* Reward Notification */}
      {reward && <RewardNotification reward={reward} onDismiss={clearReward} />}

      {/* Toast Notification */}
      {toast && (
          <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 w-auto max-w-[90%] p-4 rounded-xl shadow-2xl text-white flex items-center gap-4 animate-fade-in-up z-[9999] ${toast.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-rose-600'}`}>
              <i className={`ph-fill ${toast.type === 'success' ? 'ph-gift' : 'ph-warning-circle'} text-3xl flex-shrink-0`}></i>
              <span className="font-semibold text-base">{toast.message}</span>
          </div>
      )}
    </div>
  );
}

export default App;