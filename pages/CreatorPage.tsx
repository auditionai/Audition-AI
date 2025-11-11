import React, { useState } from 'react';
import CreatorHeader from '../components/CreatorHeader';
import CreatorFooter from '../components/CreatorFooter';
import AITool from '../components/AITool';
import { useAuth } from '../contexts/AuthContext';
import Leaderboard from '../components/Leaderboard';
import Settings from '../components/Settings';
import InfoModal from '../components/InfoModal';
import BottomNavBar from '../components/common/BottomNavBar';
import CheckInModal from '../components/CheckInModal'; // Import the new modal
import MyCreationsPage from './MyCreationsPage'; // Import the new page
import AnnouncementModal from '../components/AnnouncementModal';
import AdminGalleryPage from './AdminGalleryPage'; // Import new admin page

export type CreatorTab = 'tool' | 'leaderboard' | 'settings' | 'my-creations';

interface CreatorPageProps {
    activeTab: CreatorTab | 'admin-gallery';
}

const CreatorPage: React.FC<CreatorPageProps> = ({ activeTab }) => {
    const { navigate, announcement, showAnnouncementModal, markAnnouncementAsRead } = useAuth();
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [isCheckInModalOpen, setCheckInModalOpen] = useState(false); // State for the new modal

    const handleOpenInfoModal = (key: 'terms' | 'policy' | 'contact') => {
        setInfoModalKey(key);
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'tool':
                return <AITool />;
            case 'leaderboard':
                return <Leaderboard />;
            case 'my-creations':
                return <MyCreationsPage />;
            case 'admin-gallery':
                return <AdminGalleryPage />;
            case 'settings':
                return <Settings />;
            default:
                return <AITool />;
        }
    }
    
    return (
        <div className="flex flex-col min-h-screen pb-16 md:pb-0">
            <CreatorHeader 
                onTopUpClick={() => navigate('buy-credits')}
                activeTab={activeTab}
                onNavigate={navigate}
                onCheckInClick={() => setCheckInModalOpen(true)} // Add click handler
            />
            <main className="flex-grow pt-20 relative">
                 <div className="relative z-10">
                    {renderContent()}
                </div>
            </main>
            <CreatorFooter onInfoLinkClick={handleOpenInfoModal} />


            <BottomNavBar
                activeTab={activeTab as CreatorTab}
                onTabChange={(tab) => navigate(tab)}
                onTopUpClick={() => navigate('buy-credits')}
                onCheckInClick={() => setCheckInModalOpen(true)}
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

            <InfoModal
                isOpen={!!infoModalKey}
                onClose={() => setInfoModalKey(null)}
                contentKey={infoModalKey}
            />
        </div>
    );
};

export default CreatorPage;
