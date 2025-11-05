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

// Fix: Export the CreatorTab type so it can be imported in other components.
export type CreatorTab = 'tool' | 'leaderboard' | 'settings';

const CreatorPage: React.FC = () => {
    // Fix: `updateUserDiamonds` is now correctly provided by the `useAuth` hook.
    const { navigate } = useAuth();
    const [activeTab, setActiveTab] = useState<CreatorTab>('tool');
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
            case 'settings':
                return <Settings />;
            default:
                return <AITool />;
        }
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#0B0B0F]">
            <CreatorHeader 
                onTopUpClick={() => navigate('buy-credits')}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onCheckInClick={() => setCheckInModalOpen(true)} // Add click handler
            />
            <main className="flex-grow pt-20 relative pb-16 md:pb-0">
                 <div className="absolute inset-0 z-0 aurora-background opacity-70"></div>
                 <div className="relative z-10">
                    {renderContent()}
                </div>
            </main>
            <CreatorFooter onInfoLinkClick={handleOpenInfoModal} />

            <BottomNavBar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onTopUpClick={() => navigate('buy-credits')}
            />

            <CheckInModal 
                isOpen={isCheckInModalOpen}
                onClose={() => setCheckInModalOpen(false)}
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