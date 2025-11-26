
import React, { useState } from 'react';
import AiGeneratorTool from './ai-tool/AiGeneratorTool';
import GroupGeneratorTool from './ai-tool/GroupGeneratorTool';
import BgRemoverTool from './ai-tool/BgRemoverTool';
import ImageEnhancerTool from './ai-tool/ImageEnhancerTool';
import InstructionModal from '../common/InstructionModal';
import SignatureTool from './tools/SignatureTool';
import ComicStudio from './comic/ComicStudio';
import { useAuth } from '../../contexts/AuthContext';
import UtilInstructionModal from '../ai-tool/InstructionModal'; 
import { useTranslation } from '../../hooks/useTranslation';

type AIToolTab = 'generator' | 'group-studio' | 'comic-studio' | 'utilities'; 
type UtilityTab = 'bg-remover' | 'signature' | 'enhancer';

const AITool: React.FC = () => {
    const { showToast } = useAuth();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<AIToolTab>('generator');
    const [activeUtility, setActiveUtility] = useState<UtilityTab>('bg-remover');
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    
    const [isUtilHelpOpen, setUtilHelpOpen] = useState(false);
    const [utilHelpKey, setUtilHelpKey] = useState<'bg-remover' | 'signature' | 'group-studio' | 'comic-studio' | null>(null);

    // State to pass images between tools
    const [poseImage, setPoseImage] = useState<{ url: string; file: File } | null>(null);
    const [rawFaceImage, setRawFaceImage] = useState<{ url: string; file: File } | null>(null);
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

    const handleSendToBgRemover = (image: { url: string; file: File }) => {
        setImageForBgRemover(image);
        setActiveTab('utilities');
        setActiveUtility('bg-remover');
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
            <div className="themed-main-title-container text-center max-w-4xl mx-auto mb-8 md:mb-12">
                <h1 
                    className="themed-main-title text-3xl md:text-5xl lg:text-6xl font-black mb-2 md:mb-4 leading-tight"
                    data-text={t('creator.aiTool.title')}
                >
                    {t('creator.aiTool.title')}
                </h1>
                <p className="themed-main-subtitle text-sm md:text-xl max-w-2xl mx-auto">
                    {t('creator.aiTool.description')}
                </p>
                <button
                    onClick={() => setInstructionModalOpen(true)}
                    className="themed-guide-button mt-4"
                >
                    <i className="ph-fill ph-book-open"></i>
                    <span>{t('creator.aiTool.quickGuide')}</span>
                </button>
            </div>
            
            <div className="max-w-7xl mx-auto">
                {/* Main Tabs */}
                <div className="grid grid-cols-2 gap-2 mb-6 md:flex md:justify-center md:gap-0 md:border-b md:border-white/10 md:mb-8">
                    <button
                        onClick={() => setActiveTab('generator')}
                        className={`
                            px-4 py-3 font-bold text-sm md:text-base rounded-xl md:rounded-none md:rounded-t-lg transition-all
                            flex flex-col md:flex-row items-center justify-center gap-2 border-2 md:border-0 md:border-b-2
                            ${activeTab === 'generator' 
                                ? 'bg-skin-accent text-white border-transparent md:bg-transparent md:text-skin-accent md:border-skin-accent shadow-lg md:shadow-none' 
                                : 'bg-skin-fill-secondary text-skin-muted border-skin-border hover:text-skin-base hover:bg-white/5'
                            }
                        `}
                    >
                       <i className="ph-fill ph-magic-wand text-xl md:text-lg"></i>
                        {t('creator.aiTool.tabs.single')}
                    </button>
                     <button
                        onClick={() => setActiveTab('group-studio')}
                        className={`
                            px-4 py-3 font-bold text-sm md:text-base rounded-xl md:rounded-none md:rounded-t-lg transition-all
                            flex flex-col md:flex-row items-center justify-center gap-2 border-2 md:border-0 md:border-b-2
                            ${activeTab === 'group-studio' 
                                ? 'bg-skin-accent text-white border-transparent md:bg-transparent md:text-skin-accent md:border-skin-accent shadow-lg md:shadow-none' 
                                : 'bg-skin-fill-secondary text-skin-muted border-skin-border hover:text-skin-base hover:bg-white/5'
                            }
                        `}
                    >
                        <i className="ph-fill ph-users-three text-xl md:text-lg"></i>
                        {t('creator.aiTool.tabs.group')}
                    </button>
                    <button
                        onClick={() => setActiveTab('comic-studio')}
                        className={`
                            px-4 py-3 font-bold text-sm md:text-base rounded-xl md:rounded-none md:rounded-t-lg transition-all
                            flex flex-col md:flex-row items-center justify-center gap-2 border-2 md:border-0 md:border-b-2 relative
                            ${activeTab === 'comic-studio' 
                                ? 'bg-skin-accent text-white border-transparent md:bg-transparent md:text-skin-accent md:border-skin-accent shadow-lg md:shadow-none' 
                                : 'bg-skin-fill-secondary text-skin-muted border-skin-border hover:text-skin-base hover:bg-white/5'
                            }
                        `}
                    >
                        <i className="ph-fill ph-book-open-text text-xl md:text-lg"></i>
                        Truyện Tranh
                        <span className="absolute -top-2 -right-2 md:-top-3 md:-right-3 bg-gradient-to-r from-red-500 to-orange-600 text-white text-[9px] px-2 py-0.5 rounded-full font-black shadow-sm border border-white/20 animate-pulse z-10">HOT</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('utilities')}
                        className={`
                            px-4 py-3 font-bold text-sm md:text-base rounded-xl md:rounded-none md:rounded-t-lg transition-all
                            flex flex-col md:flex-row items-center justify-center gap-2 border-2 md:border-0 md:border-b-2
                            ${activeTab === 'utilities' 
                                ? 'bg-skin-accent text-white border-transparent md:bg-transparent md:text-skin-accent md:border-skin-accent shadow-lg md:shadow-none' 
                                : 'bg-skin-fill-secondary text-skin-muted border-skin-border hover:text-skin-base hover:bg-white/5'
                            }
                        `}
                    >
                        <i className="ph-fill ph-wrench text-xl md:text-lg"></i>
                        {t('creator.aiTool.tabs.utilities')}
                    </button>
                </div>

                {/* Content */}
                {activeTab === 'comic-studio' ? (
                    <ComicStudio 
                        onInstructionClick={() => openUtilHelp('comic-studio')}
                    />
                ) : (
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
                                    <button onClick={() => setActiveUtility('enhancer')} className={`px-4 py-2 text-sm font-semibold transition-colors ${activeUtility === 'enhancer' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'}`}>
                                        <i className="ph-fill ph-sparkle mr-2"></i>{t('creator.aiTool.utils.enhancer')}
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
                )}
            </div>
        </div>
    );
};

export default AITool;
