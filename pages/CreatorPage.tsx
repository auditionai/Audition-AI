import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

// Import Creator-specific components
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import AITool from '../components/creator/AITool';
import Leaderboard from '../components/Leaderboard';
import MyCreationsPage from './MyCreationsPage';
import Settings from '../components/Settings';
import AdminGalleryPage from './AdminGalleryPage';
import BottomNavBar from '../components/common/BottomNavBar';
import InfoModal from '../components/creator/InfoModal';
import TopUpModal from '../components/creator/TopUpModal';
import CheckInModal from '../components/CheckInModal';
import AnnouncementModal from '../components/AnnouncementModal';
import ThemeEffects from '../components/themes/ThemeEffects';

// Define the possible tabs for type safety
export type CreatorTab = 'tool' | 'leaderboard' | 'my-creations' | 'settings';

interface CreatorPageProps {
  activeTab: CreatorTab | 'admin-gallery'; // Include admin tab here
}

const CreatorPage: React.FC<CreatorPageProps> = ({ activeTab }) => {
    const { user, navigate, showToast, updateUserDiamonds, announcement, showAnnouncementModal, markAnnouncementAsRead } = useAuth();
    const { theme } = useTheme();

    // State for modals
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [isCheckInModalOpen, setCheckInModalOpen] = useState(false);

    if (!user) {
        // This should ideally not happen if routing is correct, but as a safeguard:
        navigate('home');
        return null; 
    }
    
    const handleTopUpClick = () => {
        // This is now handled by the BuyCreditsPage, but the modal can be a quick-access point.
        navigate('buy-credits');
    };

    const handleCheckIn = async () => {
        setCheckInModalOpen(true);
    };

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'leaderboard':
                return <Leaderboard />;
            case 'my-creations':
                return <MyCreationsPage />;
            case 'settings':
                return <Settings />;
            case 'admin-gallery':
                return user.is_admin ? <AdminGalleryPage /> : <AITool />; // Fallback for non-admins
            case 'tool':
            default:
                return <AITool />;
        }
    };

    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
             <ThemeEffects />
             <CreatorHeader
                onTopUpClick={handleTopUpClick}
                activeTab={activeTab}
                onNavigate={navigate}
                onCheckInClick={handleCheckIn}
            />
            
            <main className="flex-grow pt-24 md:pt-28">
                {renderActiveTab()}
            </main>

            <CreatorFooter onInfoLinkClick={setInfoModalKey} />

            <BottomNavBar
                activeTab={activeTab === 'admin-gallery' ? 'tool' : activeTab} // Highlight 'tool' for admin gallery for now
                onTabChange={navigate}
                onCheckInClick={handleCheckIn}
            />

            {/* Global Modals for Creator Page */}
            <TopUpModal
                isOpen={isTopUpModalOpen}
                onClose={() => setIsTopUpModalOpen(false)}
                 onTopUpSuccess={(amount) => {
                    if (user) {
                      updateUserDiamonds(user.diamonds + amount);
                    }
                    setIsTopUpModalOpen(false);
                    showToast(`Nạp thành công ${amount} kim cương!`, 'success');
                }}
            />
             <InfoModal
                isOpen={!!infoModalKey}
                onClose={() => setInfoModalKey(null)}
                contentKey={infoModalKey}
            />
             <CheckInModal
                isOpen={isCheckInModalOpen}
                onClose={() => setCheckInModalOpen(false)}
            />
            <AnnouncementModal
                isOpen={showAnnouncementModal}
                onClose={markAnnouncementAsRead}
                announcement={announcement}
            />
        </div>
    );
};

export default CreatorPage;