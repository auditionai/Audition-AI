
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

// Import Creator-specific components
import CreatorHeader from '../components/creator/CreatorHeader';
import CreatorFooter from '../components/creator/CreatorFooter';
import AITool from '../components/creator/AITool';
import MyCreationsPage from './MyCreationsPage';
import Settings from '../components/Settings';
import BottomNavBar from '../components/common/BottomNavBar';
import InfoModal from '../components/creator/InfoModal';
import TopUpModal from '../components/creator/TopUpModal';
import CheckInModal from '../components/CheckInModal';
import AnnouncementModal from '../components/AnnouncementModal';
import ThemeEffects from '../components/themes/ThemeEffects';

// Define the possible tabs for type safety
export type CreatorTab = 'tool' | 'my-creations' | 'settings';

interface CreatorPageProps {
  activeTab: CreatorTab; 
}

const CreatorPage: React.FC<CreatorPageProps> = ({ activeTab }) => {
    const { user, navigate, showToast, updateUserDiamonds, announcement, showAnnouncementModal, markAnnouncementAsRead } = useAuth();
    const { theme } = useTheme();

    // State for modals
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [isCheckInModalOpen, setCheckInModalOpen] = useState(false);

    if (!user) {
        navigate('home');
        return null; 
    }
    
    const handleTopUpClick = () => {
        navigate('buy-credits');
    };

    const handleCheckIn = async () => {
        setCheckInModalOpen(true);
    };

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'my-creations':
                return <MyCreationsPage />;
            case 'settings':
                return <Settings />;
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
                activeTab={activeTab}
                onTabChange={navigate}
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