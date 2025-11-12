import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { resizeImage } from '../utils/imageUtils';
import { SCENARIOS, StoryNode } from '../constants/loveStoryData';
import ConfirmationModal from '../components/ConfirmationModal';

type StoryStep = 'casting' | 'story' | 'generating' | 'choice' | 'end';

const AILoveStoryPage: React.FC = () => {
    const { user, session, showToast, updateUserProfile } = useAuth();

    const [currentStep, setCurrentStep] = useState<StoryStep>('casting');

    const [femaleChar, setFemaleChar] = useState<{ url: string; file: File } | null>(null);
    const [maleChar, setMaleChar] = useState<{ url: string; file: File } | null>(null);

    const [scenarioId, setScenarioId] = useState<keyof typeof SCENARIOS>('school');
    const [currentNodeId, setCurrentNodeId] = useState<string>('start');
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    
    const scenario = SCENARIOS[scenarioId];
    const currentNode: StoryNode = scenario.nodes[currentNodeId];
    const COST_PER_IMAGE = 2;

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, gender: 'female' | 'male') => {
        const file = e.target.files?.[0];
        if (file) {
            resizeImage(file, 1024).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
                const newImage = { url: resizedDataUrl, file: resizedFile };
                if (gender === 'female') setFemaleChar(newImage);
                else setMaleChar(newImage);
            }).catch(err => showToast('Lỗi xử lý ảnh.', 'error'));
        }
    };
    
    const startStory = () => {
        if (!femaleChar || !maleChar) {
            showToast('Vui lòng tải lên ảnh cho cả hai nhân vật.', 'error');
            return;
        }
        setCurrentStep('story');
        setCurrentNodeId(scenario.startNode);
    };

    const handleChoice = (nextNodeId: string) => {
        setCurrentNodeId(nextNodeId);
        setCurrentStep('story');
    };
    
    const restartStory = () => {
        setFemaleChar(null);
        setMaleChar(null);
        setGeneratedImages([]);
        setCurrentNodeId('start');
        setCurrentStep('casting');
    }

    const generateStoryImage = async () => {
        if (!currentNode.prompt || !session || !femaleChar || !maleChar) return;
        setIsGenerating(true);
        setCurrentStep('generating');
        try {
             const [femaleB64, maleB64] = await Promise.all([
                fileToBase64(femaleChar.file),
                fileToBase64(maleChar.file),
            ]);

            const response = await fetch('/.netlify/functions/generate-love-story-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    prompt: currentNode.prompt("Nữ chính", "Nam chính"),
                    femaleImage: femaleB64,
                    maleImage: maleB64,
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            
            setGeneratedImages(prev => [...prev, result.imageUrl]);
            updateUserProfile({ diamonds: result.newDiamondCount });
            
            if (currentNode.next) {
                setCurrentNodeId(currentNode.next);
                setCurrentStep('story');
            } else if (currentNode.choices) {
                 setCurrentStep('choice');
            } else {
                setCurrentStep('end');
            }

        } catch (err: any) {
            showToast(err.message, 'error');
            setCurrentStep('story'); // Go back to story on error
        } finally {
            setIsGenerating(false);
        }
    }
    
     useEffect(() => {
        if (currentStep === 'story' && currentNode.action === 'generate') {
            if (user && user.diamonds < COST_PER_IMAGE) {
                showToast(`Bạn cần ${COST_PER_IMAGE} kim cương để tiếp tục.`, 'error');
                setCurrentStep('end'); // End story if not enough diamonds
                return;
            }
            setConfirmOpen(true);
        }
    }, [currentStep, currentNode, user, showToast]);


    const renderContent = () => {
        switch (currentStep) {
            case 'casting':
                return (
                    <div className="max-w-4xl mx-auto p-8 bg-skin-fill-secondary rounded-2xl border border-skin-border shadow-lg animate-fade-in-up">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold text-pink-400">Tuyển chọn Diễn viên</h2>
                            <p className="text-skin-muted mt-2">Tải lên ảnh nhân vật nam và nữ để bắt đầu câu chuyện của bạn.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             {['female', 'male'].map(gender => (
                                <div key={gender}>
                                    <h3 className="font-semibold text-center mb-2">{gender === 'female' ? 'Nhân vật Nữ' : 'Nhân vật Nam'}</h3>
                                    <label className="relative group w-full aspect-[3/4] rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center bg-black/20 hover:border-pink-500 transition-colors p-1 cursor-pointer">
                                        {(gender === 'female' ? femaleChar : maleChar) ? (
                                            <img src={(gender === 'female' ? femaleChar : maleChar)?.url} className="w-full h-full object-contain rounded-md"/>
                                        ) : (
                                            <div className="text-center text-gray-400 p-4">
                                                <i className="ph-fill ph-upload-simple text-4xl mb-2"></i>
                                                <p className="font-semibold">Tải ảnh lên</p>
                                            </div>
                                        )}
                                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, gender as 'female' | 'male')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                    </label>
                                </div>
                            ))}
                        </div>
                        <div className="text-center mt-8">
                             <button onClick={startStory} disabled={!femaleChar || !maleChar} className="themed-button-primary px-12 py-4 text-lg">
                                Bắt đầu Kịch bản
                            </button>
                        </div>
                    </div>
                );
            case 'generating':
                 return (
                    <div className="text-center p-12">
                         <div className="relative w-24 h-24 mx-auto mb-6">
                            <div className="absolute inset-0 border-4 border-pink-500/30 rounded-full animate-pulse"></div>
                            <div className="absolute inset-0 border-4 border-t-pink-500 rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center text-4xl text-pink-400"><i className="ph-fill ph-heartbeat"></i></div>
                        </div>
                        <p className="text-lg text-gray-300 font-semibold animate-pulse">AI đang vẽ lại khoảnh khắc định mệnh...</p>
                    </div>
                );
            case 'story':
            case 'choice':
            case 'end':
                const lastImage = generatedImages.length > 0 ? generatedImages[generatedImages.length - 1] : null;
                return (
                    <div className="max-w-4xl mx-auto animate-fade-in relative aspect-[16/9] bg-black/50 rounded-lg overflow-hidden border border-skin-border">
                        {lastImage && <img src={lastImage} className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent"></div>
                        <div className="relative z-10 p-8 flex flex-col justify-end h-full text-white">
                             <p className="text-lg leading-relaxed mb-6 p-4 bg-black/60 rounded-lg backdrop-blur-sm">{currentNode.text}</p>
                            {currentStep === 'choice' && currentNode.choices && (
                                <div className="space-y-3">
                                    {currentNode.choices.map((choice, index) => (
                                        <button key={index} onClick={() => handleChoice(choice.next)} className="w-full text-left p-4 bg-white/10 hover:bg-white/20 rounded-lg transition">
                                            {choice.text}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {currentStep === 'end' && (
                                <div className="text-center p-8 bg-black/70 rounded-lg">
                                    <h3 className="text-2xl font-bold mb-4 text-pink-400">Hết truyện</h3>
                                    <h4 className="font-semibold mb-4">Album Kỷ Niệm</h4>
                                    <div className="flex justify-center gap-4 mb-6">
                                        {generatedImages.map((img, i) => <img key={i} src={img} className="w-24 h-24 object-cover rounded-md border-2 border-white/50"/>)}
                                    </div>
                                    <button onClick={restartStory} className="themed-button-secondary">Chơi lại từ đầu</button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };
    
    return (
        <div className="w-full">
            <ConfirmationModal
                isOpen={isConfirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={() => { setConfirmOpen(false); generateStoryImage(); }}
                cost={COST_PER_IMAGE}
                isLoading={isGenerating}
            />
            {renderContent()}
        </div>
    );
};

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});


export default AILoveStoryPage;