import HomePage from './pages/HomePage';
import CreatorPage from './pages/CreatorPage';
import GalleryPage from './pages/GalleryPage';
import { useAuth } from './contexts/AuthContext';
import BuyCreditsPage from './pages/BuyCreditsPage';

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
  const { user, toast, loading, route } = useAuth();

  if (loading) {
    return <AppLoadingScreen />;
  }

  const renderPage = () => {
    if (route === 'gallery') {
      return <GalleryPage />;
    }
    if (route === 'buy-credits') {
      return <BuyCreditsPage />;
    }
    // For 'home' and any other route, use the default logic based on auth state
    return user ? <CreatorPage /> : <HomePage />;
  }

  return (
    <div className="bg-[#0B0B0F] text-white selection:bg-pink-500 selection:text-white">
      {renderPage()}

      {/* Toast Notification */}
      {toast && (
          <div className={`fixed bottom-5 right-5 p-4 rounded-lg shadow-lg text-white animate-fade-in-up z-50 ${toast.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-rose-600'}`}>
              {toast.message}
          </div>
      )}
    </div>
  );
}

export default App;