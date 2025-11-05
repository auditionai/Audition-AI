import React, { useState, useCallback } from 'react';
import CreatorHeader from '../components/CreatorHeader';
import CreatorFooter from '../components/CreatorFooter';
import AITool from '../components/AITool';
import Leaderboard from '../components/Leaderboard';
import Settings from '../components/Settings';
import TopUpModal from '../components/TopUpModal';
import { useAuth } from '../contexts/AuthContext';
import InfoModal from '../components/InfoModal';
import CheckInModal from '../components/CheckInModal';
import BottomNavBar from '../components/common/BottomNavBar';

export type CreatorTab = 'tool' | 'leaderboard' | 'settings';

const CreatorPage: React.FC = () => {
    const { navigate, user, updateUserProfile, showToast, session } = useAuth();
    const [activeTab, setActiveTab] = useState<CreatorTab>('tool');
    const [isTopUpModalOpen, setTopUpModalOpen] = useState(false);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [isCheckInModalOpen, setCheckInModalOpen] = useState(false);
    
    // Function to handle the check-in API call
    const handleCheckIn = useCallback(async () => {
        if (!session) {
            showToast('Vui lòng đăng nhập để điểm danh.', 'error');
            return;
        }
        try {
            const response = await fetch('/.netlify/functions/daily-check-in', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await response.json();
            if (!response.ok) {
                // If already checked in, just show the modal without an error toast
                if (data.checkedIn) {
                   setCheckInModalOpen(true);
                } else {
                   throw new Error(data.error || 'Điểm danh thất bại.');
                }
            } else {
                showToast(data.message, 'success');
                updateUserProfile({
                    diamonds: data.newTotalDiamonds,
                    consecutive_check_in_days: data.consecutiveDays,
                    last_check_in_at: new Date().toISOString(),
                });
                setCheckInModalOpen(true); // Open modal on successful check-in
            }
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    }, [session, showToast, updateUserProfile]);


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
    };
    
    const handleTopUpClick = () => {
        navigate('buy-credits');
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#0B0B0F]">
            <CreatorHeader 
                onTopUpClick={handleTopUpClick}
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                onCheckInClick={handleCheckIn}
            />
            <main className="flex-grow pt-24 pb-28 md:pb-12">
                {renderContent()}
            </main>
            <CreatorFooter onInfoLinkClick={setInfoModalKey} />
            
            <BottomNavBar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onTopUpClick={handleTopUpClick}
                onCheckInClick={handleCheckIn}
            />

            {/* Modals */}
            <TopUpModal 
                isOpen={isTopUpModalOpen} 
                onClose={() => setTopUpModalOpen(false)}
                onTopUpSuccess={(amount) => {
                    if (user) {
                        updateUserProfile({ diamonds: user.diamonds + amount });
                    }
                    setTopUpModalOpen(false);
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
        </div>
    );
};

export default CreatorPage;
