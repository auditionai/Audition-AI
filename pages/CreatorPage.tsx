
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
// import TopUpModal from '../components/creator/TopUpModal'; // REMOVED: Using BuyCreditsPage
import CheckInModal from '../components/CheckInModal';
import AnnouncementModal from '../components/AnnouncementModal';
import ThemeEffects from '../components/themes/ThemeEffects';

// Import New Liquid Shell
import LiquidShell from '../components/creator/LiquidShell';
import Leaderboard from '../components/Leaderboard';
import ShopPage from './ShopPage';
import MessagesPage from './MessagesPage'; 
import UserProfilePage from './UserProfilePage';
import AdminGalleryPage from './AdminGalleryPage';

// Define the possible tabs for type safety
export type CreatorTab = 'tool' | 'my-creations' | 'settings' | 'shop' | 'leaderboard' | 'profile' | 'messages' | 'admin-gallery';

interface CreatorPageProps {
  activeTab: CreatorTab; 
}

const CreatorPage: React.FC<CreatorPageProps> = ({ activeTab }) => {
    const { user, navigate, announcement, showAnnouncementModal, markAnnouncementAsRead } = useAuth();
    const { theme } = useTheme();

    // State for modals
    // const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false); // REMOVED
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [isCheckInModalOpen, setCheckInModalOpen] = useState(false);

    if (!user) {
        navigate('home');
        return null; 
    }
    
    // REMOVED: handleTopUpClick because we navigate directly to 'buy-credits'

    const handleCheckIn = async () => {
        setCheckInModalOpen(true);
    };

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'my-creations': return <MyCreationsPage />;
            case 'settings': return <Settings />;
            case 'tool': return <AITool />;
            case 'shop': return <ShopPage />;
            case 'leaderboard': return <Leaderboard />;
            case 'profile': return <UserProfilePage />;
            case 'messages': return <MessagesPage />;
            case 'admin-gallery': return <AdminGalleryPage />;
            default: return <AITool />;
        }
    };

    // --- LIQUID GLASS LAYOUT (IOS 26) ---
    if (theme === 'liquid-glass') {
        return (
            <div data-theme={theme} className="bg-black min-h-screen relative font-barlow selection:bg-cyan-500 selection:text-white">
                <ThemeEffects />
                
                {/* 
                   LiquidShell now wraps the content directly.
                */}
                <LiquidShell 
                    activeTab={activeTab as any} 
                    onNavigate={navigate}
                    onCheckInClick={handleCheckIn}
                >
                    {renderActiveTab()}
                </LiquidShell>

                {/* Global Modals */}
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
    }

    // --- CLASSIC LAYOUT (Legacy) ---
    return (
        <div data-theme={theme} className="flex flex-col min-h-screen bg-skin-fill text-skin-base pb-16 md:pb-0">
             <ThemeEffects />
             <CreatorHeader
                onTopUpClick={() => navigate('buy-credits')} // Redirect to full page
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
