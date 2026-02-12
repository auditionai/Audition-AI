
import React, { useState } from 'react';
// import AiGeneratorTool from './ai-tool/AiGeneratorTool'; // REMOVED as requested, but file exists for reference
import GroupGeneratorTool from './ai-tool/GroupGeneratorTool';
import BgRemoverTool from './ai-tool/BgRemoverTool';
import ImageEnhancerTool from './ai-tool/ImageEnhancerTool';
import InstructionModal from '../common/InstructionModal';
// import SignatureTool from './tools/SignatureTool'; // REMOVED
// import ComicStudio from './comic/ComicStudio'; // REMOVED: Moved to GroupGeneratorTool
import { useAuth } from '../../contexts/AuthContext';
import UtilInstructionModal from '../ai-tool/InstructionModal'; 
import { useTranslation } from '../../hooks/useTranslation';

type AIToolTab = 'studio' | 'utilities'; 
type UtilityTab = 'bg-remover' | 'enhancer'; // Removed 'signature'

// Helper Component for Mode Selection Card (Matches Studio Style)
const ModeCard: React.FC<{
    icon: string;
    title: string;
    description: string;
    colorClass: string;
    onClick: () => void;
    hot?: boolean;
}> = ({ icon, title, description, colorClass, onClick, hot }) => (
    <button 
        onClick={onClick}
        className={`group relative flex flex-col items-center justify-center p-6 rounded-[24px] 
            bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20
            transition-all duration-300 w-full hover:-translate-y-2 interactive-3d overflow-hidden ${colorClass}
            shadow-[0_4px_20px_rgba(0,0,0,0.5)]`}
        style={{ minHeight: '200px' }}
    >
        {hot && <div className="absolute top-4 right-4 bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded shadow-lg animate-pulse z-10 border border-red-400">HOT</div>}
        
        {/* Inner Glow / Mirror Reflection */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

        <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-6 
            bg-black/40 shadow-[inset_0_2px_5px_rgba(0,0,0,0.8),0_5px_15px_rgba(0,0,0,0.5)] 
            border border-white/5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6 group-hover:border-white/20`}>
            <i className={`ph-fill ${icon} drop-shadow-[0_0_10px_rgba(0,0,0,1)]`}></i>
        </div>
        <h3 className="text-lg font-black uppercase tracking-wide mb-2 text-white group-hover:text-shadow-glow">{title}</h3>
        <p className="text-xs text-gray-400 font-medium px-4 text-center leading-relaxed group-hover:text-white transition-colors">{description}</p>
    </button>
);

const AITool: React.FC = () => {
    const { showToast } = useAuth();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<AIToolTab>('studio'); // Default to Studio
    const [activeUtility, setActiveUtility] = useState<UtilityTab>('bg-remover');
    
    // New state to toggle between Selection Grid and Tool View
    const [isUtilitySelection, setIsUtilitySelection] = useState(true);

    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    const [isUtilHelpOpen, setUtilHelpOpen] = useState(false);
    const [utilHelpKey, setUtilHelpKey] = useState<'bg-remover' | 'signature' | 'group-studio' | 'comic-studio' | null>(null);

    // State to pass images between tools
    const [imageForBgRemover, setImageForBgRemover] = useState<{ url: string; file: File } | null>(null);

    const openUtilHelp = (key: 'bg-remover' | 'signature' | 'group-studio' | 'comic-studio') => {
        setUtilHelpKey(key);
        setUtilHelpOpen(true);
    };
    
    const handleSwitchToUtility = (utility: UtilityTab) => {
        setActiveTab('utilities');
        setActiveUtility(utility);
        setIsUtilitySelection(false); // Direct entry
    };

    // Updated handler for new unified studio
    const handleSwitchToolWithImage = (image: { url: string; file: File }, targetTool: 'bg-remover' | 'enhancer') => {
        setActiveTab('utilities');
        setIsUtilitySelection(false); // Skip selection screen
        
        if (targetTool === 'bg-remover') {
            setActiveUtility('bg-remover');
            setImageForBgRemover(image);
        } else if (targetTool === 'enhancer') {
            setActiveUtility('enhancer');
            // Assuming ImageEnhancerTool handles initial image internally via props if we extended it, 
            // but currently it uses file input. For now, we just switch context.
            // (If needed, pass image prop to EnhancerTool similar to BgRemover)
        }
        showToast(`Đã chuyển sang công cụ ${targetTool === 'bg-remover' ? 'Tách Nền' : 'Làm Nét'}`, 'success');
    };

    const handleSendToBgRemover = (image: { url: string; file: File }) => {
        setImageForBgRemover(image);
        setActiveTab('utilities');
        setActiveUtility('bg-remover');
        setIsUtilitySelection(false); // Skip selection
    };

    const getUtilityTitle = () => {
        switch (activeUtility) {
            case 'bg-remover': return t('creator.aiTool.utils.bgRemover');
            case 'enhancer': return t('creator.aiTool.utils.enhancer');
            // case 'signature': return t('creator.aiTool.utils.signature'); // REMOVED
            default: return 'Tiện ích';
        }
    };

    return (
        <div className="container mx-auto px-4 py-4">
            <InstructionModal 
                isOpen={isInstructionModalOpen} 
                onClose={() => setInstructionModalOpen(false)} 
            />
            <UtilInstructionModal
                isOpen={isUtilHelpOpen}
                onClose={() => setUtilHelpOpen(false)}
                instructionKey={utilHelpKey}
            />
            
            {/* Compact Header */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
                <div className="text-center md:text-left">
                    <h1 
                        className="themed-main-title text-2xl md:text-3xl font-black leading-tight tracking-tight uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                        data-text={t('creator.aiTool.title')}
                    >
                        {t('creator.aiTool.title')}
                    </h1>
                    <p className="text-xs md:text-sm text-gray-300 mt-1 max-w-lg font-medium shadow-black drop-shadow-sm">
                        {t('creator.aiTool.description')}
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                     <div className="bg-black/40 p-1 rounded-lg flex border border-white/10 shadow-inner backdrop-blur-sm">
                        <button
                            onClick={() => { setActiveTab('studio'); setIsUtilitySelection(true); }}
                            className={`
                                px-4 py-1.5 rounded-md font-bold text-xs transition-all flex items-center gap-2
                                ${activeTab === 'studio' 
                                    ? 'bg-red-600 text-white shadow-lg shadow-red-500/20' 
                                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                                }
                            `}
                        >
                            <i className="ph-fill ph-magic-wand"></i> STUDIO
                        </button>
                        <button
                            onClick={() => { setActiveTab('utilities'); setIsUtilitySelection(true); }}
                            className={`
                                px-4 py-1.5 rounded-md font-bold text-xs transition-all flex items-center gap-2
                                ${activeTab === 'utilities' 
                                    ? 'bg-red-600 text-white shadow-lg shadow-red-500/20' 
                                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                                }
                            `}
                        >
                            <i className="ph-fill ph-wrench"></i> TIỆN ÍCH
                        </button>
                    </div>

                    <button
                        onClick={() => setInstructionModalOpen(true)}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-colors border border-white/10 shadow-sm"
                        title={t('creator.aiTool.quickGuide')}
                    >
                        <i className="ph-fill ph-question text-lg"></i>
                    </button>
                </div>
            </div>
            
            <div className="max-w-7xl mx-auto">
                {/* Content */}
                <div className="p-1">
                    {/* --- STUDIO TAB --- */}
                    {activeTab === 'studio' && (
                        <GroupGeneratorTool 
                            onSwitchToUtility={() => handleSwitchToUtility('bg-remover')} 
                            onInstructionClick={(key) => openUtilHelp(key || 'group-studio')} 
                        />
                    )}

                    {/* --- UTILITIES TAB --- */}
                    {activeTab === 'utilities' && (
                        <>
                            {/* UTILITY SELECTION SCREEN */}
                            {isUtilitySelection ? (
                                <div className="flex flex-col items-center animate-fade-in py-8">
                                    <h2 className="themed-heading text-2xl font-bold themed-title-glow mb-4 text-center text-white drop-shadow-md">Công Cụ Tiện Ích</h2>
                                    <p className="text-gray-300 mb-10 text-center text-sm max-w-lg shadow-black">Chọn công cụ AI để xử lý hình ảnh của bạn.</p>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full px-4 justify-center">
                                        <ModeCard 
                                            icon="ph-scissors"
                                            title={t('creator.aiTool.utils.bgRemover')}
                                            description="Tách nền ảnh nhân vật trong 3 giây. Hỗ trợ Flash & Pro."
                                            colorClass="text-blue-400"
                                            onClick={() => { setActiveUtility('bg-remover'); setIsUtilitySelection(false); }}
                                        />
                                        <ModeCard 
                                            icon="ph-sparkle"
                                            title={t('creator.aiTool.utils.enhancer')}
                                            description="Làm nét ảnh mờ, tăng độ phân giải 2K/4K."
                                            colorClass="text-yellow-400"
                                            onClick={() => { setActiveUtility('enhancer'); setIsUtilitySelection(false); }}
                                        />
                                        {/* Signature Tool Removed */}
                                    </div>
                                </div>
                            ) : (
                                /* SPECIFIC TOOL INTERFACE */
                                <div className="bg-skin-fill-secondary rounded-2xl border border-skin-border shadow-lg p-4 animate-fade-in">
                                    
                                    {/* Tool Header with Back Button */}
                                    <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => setIsUtilitySelection(true)}
                                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition"
                                            >
                                                <i className="ph-bold ph-arrow-left"></i>
                                            </button>
                                            <h3 className="text-xl font-bold text-white drop-shadow-md">{getUtilityTitle()}</h3>
                                        </div>
                                        
                                        {/* Quick Switcher */}
                                        <div className="hidden md:flex gap-2">
                                             <button onClick={() => setActiveUtility('bg-remover')} className={`px-3 py-1 text-xs rounded-full border transition-all ${activeUtility === 'bg-remover' ? 'bg-blue-500/20 text-blue-300 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>Tách Nền</button>
                                             <button onClick={() => setActiveUtility('enhancer')} className={`px-3 py-1 text-xs rounded-full border transition-all ${activeUtility === 'enhancer' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.3)]' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>Làm Nét</button>
                                        </div>
                                    </div>
                                    
                                    {activeUtility === 'bg-remover' && (
                                        <BgRemoverTool 
                                            onMoveToGenerator={() => {}} // Legacy
                                            onMoveFaceToGenerator={() => {}} // Legacy
                                            onInstructionClick={() => openUtilHelp('bg-remover')}
                                            initialImage={imageForBgRemover}
                                        />
                                    )}
                                    {activeUtility === 'enhancer' && (
                                        <ImageEnhancerTool 
                                            onSendToBgRemover={handleSendToBgRemover}
                                        />
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AITool;
