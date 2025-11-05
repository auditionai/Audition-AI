import React, { useState } from 'react';
import CreatorHeader from '../components/CreatorHeader.tsx';
import CreatorFooter from '../components/CreatorFooter.tsx';
import AITool from '../components/AITool.tsx';
import GalleryPage from './GalleryPage.tsx';
import Leaderboard from '../components/Leaderboard.tsx';
import Settings from '../components/Settings.tsx';
import BuyCreditsPage from './BuyCreditsPage.tsx';
import BottomNavBar from '../components/common/BottomNavBar.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { InfoKey } from '../App.tsx';

type CreatorView = 'tool' | 'gallery' | 'leaderboard' | 'buy' | 'settings';

interface CreatorPageProps {
  onNavigateHome: () => void;
  onInfoLinkClick: (key: InfoKey) => void;
}

const CreatorPage: React.FC<CreatorPageProps> = ({ onNavigateHome, onInfoLinkClick }) => {
    const { user } = useAuth();
    const [activeView, setActiveView] = useState<CreatorView>('tool');

    const renderContent = () => {
        switch (activeView) {
            case 'tool':
                return <AITool />;
            case 'gallery':
                return <GalleryPage />;
            case 'leaderboard':
                return <Leaderboard />;
            case 'buy':
                return <BuyCreditsPage onPackageSelect={() => {}} />;
            case 'settings':
                return <Settings />;
            default:
                return <AITool />;
        }
    }

    return (
        <div className="bg-[#0B0B0F] min-h-screen flex flex-col">
            <CreatorHeader 
                user={user}
                onLogoClick={onNavigateHome}
                onTopUpClick={() => setActiveView('buy')}
                activeView={activeView}
                onViewChange={setActiveView}
            />
            <main className="flex-grow">
                {renderContent()}
            </main>
            <CreatorFooter onInfoLinkClick={onInfoLinkClick} />
             <BottomNavBar activeView={activeView} onViewChange={setActiveView} />
        </div>
    );
};

export default CreatorPage;