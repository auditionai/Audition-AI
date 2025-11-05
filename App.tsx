import { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext.tsx';
import HomePage from './pages/HomePage.tsx';
import CreatorPage from './pages/CreatorPage.tsx';
import AuthModal from './components/AuthModal.tsx';
import TopUpModal from './components/TopUpModal.tsx';
import InfoModal from './components/InfoModal.tsx';

type ModalType = 'auth' | 'topup' | 'info';
export type InfoKey = 'terms' | 'policy' | 'contact';

function App() {
  const { user, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<'home' | 'creator'>('home');
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [infoContentKey, setInfoContentKey] = useState<InfoKey | null>(null);
  
  useEffect(() => {
    if (user) {
      setActiveModal(prev => (prev === 'auth' ? null : prev)); // Close auth modal on successful login
    }
  }, [user]);

  const handleOpenModal = (modal: ModalType) => setActiveModal(modal);
  const handleCloseModal = () => setActiveModal(null);

  const handleInfoLinkClick = (key: InfoKey) => {
    setInfoContentKey(key);
    setActiveModal('info');
  };

  const handleNavigation = (page: 'home' | 'creator') => {
      window.scrollTo(0, 0);
      setCurrentPage(page);
  }

  if (isLoading) {
    return (
      <div className="w-screen h-screen bg-[#0B0B0F] flex items-center justify-center">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 border-4 border-pink-500/30 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-t-pink-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  const handleCtaClick = () => {
    if (user) {
        handleNavigation('creator');
    } else {
        handleOpenModal('auth');
    }
  };

  const handleTopUpClick = () => {
    if (user) {
        handleNavigation('creator');
        // A small delay to ensure page transition before modal opens
        setTimeout(() => {
            // Here you might want to navigate to a specific tab in the creator page
            // and then open the top-up modal. For now, we'll just open it.
             handleOpenModal('topup');
        }, 100);
    } else {
        handleOpenModal('auth');
    }
  };

  const onTopUpSuccess = (newDiamonds: number) => {
      // In a real app, you would fetch the user profile again.
      // For this demo, we can optimistically update it via context.
      console.log(`Successfully topped up! New balance would be around ${newDiamonds}`);
      handleCloseModal();
  };


  return (
    <>
      {currentPage === 'home' ? (
        <HomePage 
          onCtaClick={handleCtaClick}
          onTopUpClick={handleTopUpClick}
          onInfoLinkClick={handleInfoLinkClick}
          onNavigateToCreator={() => handleNavigation('creator')}
        />
      ) : (
        <CreatorPage 
          onNavigateHome={() => handleNavigation('home')}
          onInfoLinkClick={handleInfoLinkClick}
        />
      )}

      <AuthModal 
        isOpen={activeModal === 'auth'} 
        onClose={handleCloseModal} 
      />
      <TopUpModal 
        isOpen={activeModal === 'topup'} 
        onClose={handleCloseModal}
        onTopUpSuccess={onTopUpSuccess}
      />
      <InfoModal
        isOpen={activeModal === 'info'}
        onClose={handleCloseModal}
        contentKey={infoContentKey}
      />
    </>
  );
}

export default App;