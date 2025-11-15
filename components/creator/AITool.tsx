import React, { useState } from 'react';
import AiGeneratorTool from './ai-tool/AiGeneratorTool';
import GroupGeneratorTool from './ai-tool/GroupGeneratorTool'; // NEW: Import the new group tool
import BgRemoverTool from '../ai-tool/BgRemoverTool';
import InstructionModal from '../common/InstructionModal';
import SignatureTool from './tools/SignatureTool';
import { useAuth } from '../../contexts/AuthContext';
import UtilInstructionModal from '../ai-tool/InstructionModal'; // Renamed to avoid confusion
import { useTranslation } from '../../hooks/useTranslation';

type AIToolTab = 'generator' | 'group-studio' | 'utilities'; // NEW: Add 'group-studio'
type UtilityTab = 'bg-remover' | 'signature';

const AITool: React.FC = () => {
    const { showToast } = useAuth();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<AIToolTab>('generator');
    const [activeUtility, setActiveUtility] = useState<UtilityTab>('bg-remover');
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    
    // NEW: State for utility-specific instruction modal
    const [isUtilHelpOpen, setUtilHelpOpen] = useState(false);
    const [utilHelpKey, setUtilHelpKey] = useState<'bg-remover' | 'signature' | 'group-studio' | null>(null);

    // State to pass images between tools
    const [poseImage, setPoseImage] = useState<{ url: string; file: File } | null>(null);
    const [rawFaceImage, setRawFaceImage] = useState<{ url: string; file: File } | null>(null);
    const [imageForUtility, setImageForUtility] = useState<string | null>(null);

    const openUtilHelp = (key: 'bg-remover' | 'signature' | 'group-studio') => {
        setUtilHelpKey(key);
        setUtilHelpOpen(true);
    };
    
    const handleSwitchToUtility = (utility: UtilityTab) => {
        setActiveTab('utilities');
        setActiveUtility(utility);
    };

    const handleMoveToGenerator = (image: { url: string; file: File }) => {
        setPoseImage(image);
        setActiveTab('generator');
    };
    
    const handleMoveFaceToGenerator = (image: { url: string; file: File }) => {
        setRawFaceImage(image);
        setActiveTab('generator');
    };

    const handleSendToSignatureTool = async (imageUrl: string) => {
        try {
            const response = await fetch(`/.netlify/functions/download-image?url=${encodeURIComponent(imageUrl)}`);
            if (!response.ok) throw new Error('Không thể tải ảnh đã tạo.');
            
            const blob = await response.blob();
            const reader = new FileReader();
            
            reader.onloadend = () => {
                const base64data = reader.result as string;
                setImageForUtility(base64data);
                setActiveTab('utilities');
                setActiveUtility('signature');
                showToast('Đã chuyển ảnh sang công cụ Chèn Chữ Ký!', 'success');
            };
            
            reader.readAsDataURL(blob);
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <InstructionModal 
                isOpen={isInstructionModalOpen} 
                onClose={() => setInstructionModalOpen(false)} 
            />
            <UtilInstructionModal
                isOpen={isUtilHelpOpen}
                onClose={() => setUtilHelpOpen(false)}
                instructionKey={utilHelpKey}
            />
            <div className="themed-main-title-container text-center max-w-4xl mx-auto mb-12">
                <h1 
                    className="themed-main-title text-4xl md:text-5xl lg:text-6xl font-black mb-4 leading-tight"
                    data-text={t('creator.aiTool.title')}
                >
                    {t('creator.aiTool.title')}
                </h1>
                <p className="themed-main-subtitle text-lg md:text-xl max-w-2xl mx-auto">
                    {t('creator.aiTool.description')}
                </p>
                <button
                    onClick={() => setInstructionModalOpen(true)}
                    className="themed-guide-button"
                >
                    <i className="ph-fill ph-book-open"></i>
                    <span>{t('creator.aiTool.quickGuide')}</span>
                </button>
            </div>
            
            <div className="max-w-7xl mx-auto">
                {/* Main Tabs */}
                <div className="flex justify-center border-b border-white/10 mb-6">
                    <button
                        onClick={() => setActiveTab('generator')}
                        className={`px-6 py-3 font-semibold transition-colors ${activeTab === 'generator' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400 hover:text-white'}`}
                    >
                       <i className="ph-fill ph-magic-wand mr-2"></i>
                        {t('creator.aiTool.tabs.single')}
                    </button>
                     <button
                        onClick={() => setActiveTab('group-studio')}
                        className={`px-6 py-3 font-semibold transition-colors ${activeTab === 'group-studio' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400 hover:text-white'}`}
                    >
                        <i className="ph-fill ph-users-three mr-2"></i>
                        {t('creator.aiTool.tabs.group')}
                    </button>
                    <button
                        onClick={() => setActiveTab('utilities')}
                        className={`px-6 py-3 font-semibold transition-colors ${activeTab === 'utilities' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400 hover:text-white'}`}
                    >
                        <i className="ph-fill ph-wrench mr-2"></i>
                        {t('creator.aiTool.tabs.utilities')}
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 bg-skin-fill-secondary rounded-2xl border border-skin-border shadow-lg">
                    {activeTab === 'generator' && (
                        <AiGeneratorTool 
                           initialCharacterImage={poseImage}
                           initialFaceImage={rawFaceImage}
                           onSendToSignatureTool={handleSendToSignatureTool}
                           onSwitchToUtility={() => handleSwitchToUtility('bg-remover')}
                        />
                    )}
                    {activeTab === 'group-studio' && (
                        <GroupGeneratorTool 
                            onSwitchToUtility={() => handleSwitchToUtility('bg-remover')} 
                            onInstructionClick={() => openUtilHelp('group-studio')}
                        />
                    )}
                    {activeTab === 'utilities' && (
                        <div>
                            {/* Utility Sub-tabs */}
                            <div className="flex justify-center border-b border-white/10 mb-6">
                                <button onClick={() => setActiveUtility('bg-remover')} className={`px-4 py-2 text-sm font-semibold transition-colors ${activeUtility === 'bg-remover' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'}`}>
                                    <i className="ph-fill ph-scissors mr-2"></i>{t('creator.aiTool.utils.bgRemover')}
                                </button>
                                <button onClick={() => setActiveUtility('signature')} className={`px-4 py-2 text-sm font-semibold transition-colors ${activeUtility === 'signature' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'}`}>
                                    <i className="ph-fill ph-pencil-simple-line mr-2"></i>{t('creator.aiTool.utils.signature')}
                                </button>
                            </div>
                            
                            {activeUtility === 'bg-remover' && (
                                <BgRemoverTool 
                                    onMoveToGenerator={handleMoveToGenerator}
                                    onMoveFaceToGenerator={handleMoveFaceToGenerator}
                                    onInstructionClick={() => openUtilHelp('bg-remover')}
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
