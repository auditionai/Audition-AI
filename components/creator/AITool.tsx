
import React, { useState } from 'react';
// import AiGeneratorTool from './ai-tool/AiGeneratorTool'; // REMOVED
import GroupGeneratorTool from './ai-tool/GroupGeneratorTool';
import BgRemoverTool from './ai-tool/BgRemoverTool';
import ImageEnhancerTool from './ai-tool/ImageEnhancerTool';
import InstructionModal from '../common/InstructionModal';
import SignatureTool from './tools/SignatureTool';
// import ComicStudio from './comic/ComicStudio'; // REMOVED: Moved to GroupGeneratorTool
import { useAuth } from '../../contexts/AuthContext';
import UtilInstructionModal from '../ai-tool/InstructionModal'; 
import { useTranslation } from '../../hooks/useTranslation';

type AIToolTab = 'studio' | 'utilities'; // Removed 'comic-studio'
type UtilityTab = 'bg-remover' | 'signature' | 'enhancer';

const AITool: React.FC = () => {
    const { showToast } = useAuth();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<AIToolTab>('studio'); // Default to Studio
    const [activeUtility, setActiveUtility] = useState<UtilityTab>('bg-remover');
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    
    const [isUtilHelpOpen, setUtilHelpOpen] = useState(false);
    const [utilHelpKey, setUtilHelpKey] = useState<'bg-remover' | 'signature' | 'group-studio' | 'comic-studio' | null>(null);

    // State to pass images between tools
    const [imageForUtility, setImageForUtility] = useState<string | null>(null);
    const [imageForBgRemover, setImageForBgRemover] = useState<{ url: string; file: File } | null>(null);

    const openUtilHelp = (key: 'bg-remover' | 'signature' | 'group-studio' | 'comic-studio') => {
        setUtilHelpKey(key);
        setUtilHelpOpen(true);
    };
    
    const handleSwitchToUtility = (utility: UtilityTab) => {
        setActiveTab('utilities');
        setActiveUtility(utility);
    };

    // Updated handler for new unified studio
    const handleSwitchToolWithImage = (image: { url: string; file: File }, targetTool: 'bg-remover' | 'enhancer') => {
        setActiveTab('utilities');
        if (targetTool === 'bg-remover') {
            setActiveUtility('bg-remover');
            setImageForBgRemover(image);
        } else if (targetTool === 'enhancer') {
            setActiveUtility('enhancer');
        }
        showToast(`Đã chuyển sang công cụ ${targetTool === 'bg-remover' ? 'Tách Nền' : 'Làm Nét'}`, 'success');
    };

    const handleSendToBgRemover = (image: { url: string; file: File }) => {
        setImageForBgRemover(image);
        setActiveTab('utilities');
        setActiveUtility('bg-remover');
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
                        className="themed-main-title text-2xl md:text-3xl font-black leading-tight tracking-tight uppercase"
                        data-text={t('creator.aiTool.title')}
                    >
                        {t('creator.aiTool.title')}
                    </h1>
                    <p className="text-xs md:text-sm text-gray-400 mt-1 max-w-lg">
                        {t('creator.aiTool.description')}
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                     <div className="bg-[#1a1a1a] p-1 rounded-lg flex border border-white/10 shadow-inner">
                        <button
                            onClick={() => setActiveTab('studio')}
                            className={`
                                px-4 py-1.5 rounded-md font-bold text-xs transition-all flex items-center gap-2
                                ${activeTab === 'studio' 
                                    ? 'bg-red-600 text-white shadow-md' 
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }
                            `}
                        >
                            <i className="ph-fill ph-magic-wand"></i> STUDIO
                        </button>
                        <button
                            onClick={() => setActiveTab('utilities')}
                            className={`
                                px-4 py-1.5 rounded-md font-bold text-xs transition-all flex items-center gap-2
                                ${activeTab === 'utilities' 
                                    ? 'bg-red-600 text-white shadow-md' 
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }
                            `}
                        >
                            <i className="ph-fill ph-wrench"></i> TIỆN ÍCH
                        </button>
                    </div>

                    <button
                        onClick={() => setInstructionModalOpen(true)}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors border border-white/10"
                        title={t('creator.aiTool.quickGuide')}
                    >
                        <i className="ph-fill ph-question text-lg"></i>
                    </button>
                </div>
            </div>
            
            <div className="max-w-7xl mx-auto">
                {/* Content */}
                <div className="p-1">
                    {activeTab === 'studio' && (
                        <GroupGeneratorTool 
                            onSwitchToUtility={() => handleSwitchToUtility('bg-remover')} 
                            onInstructionClick={(key) => openUtilHelp(key || 'group-studio')} 
                            onSwitchToolWithImage={handleSwitchToolWithImage}
                        />
                    )}
                    {activeTab === 'utilities' && (
                        <div className="bg-skin-fill-secondary rounded-2xl border border-skin-border shadow-lg p-4">
                            {/* Utility Sub-tabs */}
                            <div className="flex justify-center border-b border-white/10 mb-6">
                                <button onClick={() => setActiveUtility('bg-remover')} className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${activeUtility === 'bg-remover' ? 'text-red-400 border-red-400' : 'text-gray-400 border-transparent hover:text-white'}`}>
                                    <i className="ph-fill ph-scissors mr-2"></i>{t('creator.aiTool.utils.bgRemover')}
                                </button>
                                <button onClick={() => setActiveUtility('enhancer')} className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${activeUtility === 'enhancer' ? 'text-red-400 border-red-400' : 'text-gray-400 border-transparent hover:text-white'}`}>
                                    <i className="ph-fill ph-sparkle mr-2"></i>{t('creator.aiTool.utils.enhancer')}
                                </button>
                                <button onClick={() => setActiveUtility('signature')} className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${activeUtility === 'signature' ? 'text-red-400 border-red-400' : 'text-gray-400 border-transparent hover:text-white'}`}>
                                    <i className="ph-fill ph-pencil-simple-line mr-2"></i>{t('creator.aiTool.utils.signature')}
                                </button>
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
                            {activeUtility === 'signature' && (
                                <SignatureTool 
                                    initialImage={imageForUtility}
                                    onClearInitialImage={() => setImageForUtility(null)}
                                    onInstructionClick={() => openUtilHelp('signature')}
                                    />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AITool;
