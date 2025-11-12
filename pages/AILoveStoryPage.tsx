import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { resizeImage } from '../utils/imageUtils';
import ConfirmationModal from '../components/ConfirmationModal';
import ImageUploader from '../components/ai-tool/ImageUploader'; // Re-use the uploader

type StoryStep = 'setup' | 'scripting' | 'review' | 'generating' | 'results';

interface ScriptMoment {
    description: string;
    prompt: string;
}

interface ScriptScene {
    title: string;
    moments: ScriptMoment[];
}

interface GeneratedImage {
    sceneTitle: string;
    momentDescription: string;
    imageUrl: string;
}

const AILoveStoryPage: React.FC = () => {
    const { user, session, showToast, updateUserProfile } = useAuth();

    // --- State Management ---
    const [step, setStep] = useState<StoryStep>('setup');
    
    // Setup State
    const [femaleChar, setFemaleChar] = useState<{ url: string; file: File } | null>(null);
    const [maleChar, setMaleChar] = useState<{ url: string; file: File } | null>(null);
    const [faceLockFemale, setFaceLockFemale] = useState<{ url: string; file: File } | null>(null);
    const [faceLockMale, setFaceLockMale] = useState<{ url: string; file: File } | null>(null);
    const [userStory, setUserStory] = useState('');

    // Scripting & Review State
    const [script, setScript] = useState<ScriptScene[] | null>(null);

    // Generating State
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
    
    // Results State
    const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
    const [albumImage, setAlbumImage] = useState<string | null>(null);
    const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);

    // --- Handlers ---
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'female' | 'male' | 'faceFemale' | 'faceMale') => {
        const file = e.target.files?.[0];
        if (file) {
            resizeImage(file, 1024).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
                const newImage = { url: resizedDataUrl, file: resizedFile };
                if (type === 'female') setFemaleChar(newImage);
                else if (type === 'male') setMaleChar(newImage);
                else if (type === 'faceFemale') setFaceLockFemale(newImage);
                else if (type === 'faceMale') setFaceLockMale(newImage);
            }).catch(() => showToast('Lỗi xử lý ảnh.', 'error'));
        }
    };
    
    const handleGenerateScript = async () => {
        if (!femaleChar || !maleChar || !userStory.trim()) {
            showToast('Vui lòng tải đủ 2 ảnh nhân vật và nhập vào câu chuyện của bạn.', 'error');
            return;
        }
        setStep('scripting');
        try {
            const response = await fetch('/.netlify/functions/generate-love-story-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
                body: JSON.stringify({ story: userStory }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            setScript(result.scenes);
            setStep('review');
        } catch (err: any) {
            showToast(err.message, 'error');
            setStep('setup');
        }
    };
    
    const handleGenerateImages = async () => {
        if (!script || !session) return;
        
        const totalImages = script.reduce((acc, scene) => acc + scene.moments.length, 0);
        const totalCost = totalImages * 2; // Assuming 2 diamonds per image
        if (user && user.diamonds < totalCost) {
            showToast(`Bạn cần ${totalCost} kim cương để tạo ${totalImages} ảnh, nhưng chỉ có ${user.diamonds}.`, 'error');
            return;
        }

        setIsGenerating(true);
        setStep('generating');
        setGenerationProgress({ current: 0, total: totalImages });

        const newImages: GeneratedImage[] = [];

        try {
            const [femaleB64, maleB64, femaleFaceB64, maleFaceB64] = await Promise.all([
                fileToBase64(femaleChar!.file),
                fileToBase64(maleChar!.file),
                faceLockFemale ? fileToBase64(faceLockFemale.file) : Promise.resolve(null),
                faceLockMale ? fileToBase64(faceLockMale.file) : Promise.resolve(null),
            ]);

            let imagesGeneratedCount = 0;
            for (const scene of script) {
                for (const moment of scene.moments) {
                    imagesGeneratedCount++;
                    setGenerationProgress({ current: imagesGeneratedCount, total: totalImages });

                    const response = await fetch('/.netlify/functions/generate-love-story-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                        body: JSON.stringify({
                            prompt: moment.prompt,
                            femaleImage: femaleB64,
                            maleImage: maleB64,
                            femaleFaceImage: femaleFaceB64,
                            maleFaceImage: maleFaceB64,
                        }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);
                    
                    newImages.push({
                        sceneTitle: scene.title,
                        momentDescription: moment.description,
                        imageUrl: result.imageUrl
                    });
                    updateUserProfile({ diamonds: result.newDiamondCount });
                }
            }
            setGeneratedImages(newImages);
            setStep('results');

        } catch (err: any) {
            showToast(err.message, 'error');
            setStep('review'); // Go back to review on error
        } finally {
            setIsGenerating(false);
        }
    };
    
     const handleCreateAlbum = async () => {
        if (generatedImages.length === 0 || !session) return;
        setIsCreatingAlbum(true);
        try {
            const panels = generatedImages.map(img => ({
                imageUrl: img.imageUrl,
                caption: img.momentDescription,
            }));

            const response = await fetch('/.netlify/functions/create-story-album', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ 
                    panels,
                    title: "Our Love Story",
                    endText: "Created with Audition AI"
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            const finalAlbum = `data:image/png;base64,${result.albumImageBase64}`;
            setAlbumImage(finalAlbum);
            
            // Trigger download
            const link = document.createElement('a');
            link.download = `audition-ai-story-album.png`;
            link.href = finalAlbum;
            link.click();
            showToast('Album đã được tải xuống!', 'success');

        } catch (err: any) {
            showToast(err.message || 'Không thể tạo album kỷ niệm.', 'error');
        } finally {
            setIsCreatingAlbum(false);
        }
    };
    
    const restartStory = () => {
        setFemaleChar(null); setMaleChar(null);
        setFaceLockFemale(null); setFaceLockMale(null);
        setUserStory(''); setScript(null);
        setGeneratedImages([]); setAlbumImage(null);
        setStep('setup');
    };

    const renderContent = () => {
        switch (step) {
            case 'setup':
                return (
                    <div className="max-w-6xl mx-auto p-8 bg-skin-fill-secondary rounded-2xl border border-skin-border shadow-lg animate-fade-in-up">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold text-pink-400">Kể Câu Chuyện Của Bạn</h2>
                            <p className="text-skin-muted mt-2">Tải ảnh, viết nên câu chuyện tình yêu, và để AI biến nó thành một cuốn truyện tranh độc đáo.</p>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
                             {/* Character Uploads */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h3 className="font-semibold text-center mb-2">Nhân vật Nữ</h3>
                                    <ImageUploader onUpload={(e) => handleImageUpload(e, 'female')} image={femaleChar} onRemove={() => setFemaleChar(null)} text="Ảnh Nhân vật" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-center mb-2">Nhân vật Nam</h3>
                                    <ImageUploader onUpload={(e) => handleImageUpload(e, 'male')} image={maleChar} onRemove={() => setMaleChar(null)} text="Ảnh Nhân vật" />
                                </div>
                                 <div className="md:col-span-2 text-xs text-skin-muted text-center -mt-4">
                                    Ảnh này sẽ được dùng để xác định trang phục và tư thế.
                                </div>
                                <div>
                                    <h3 className="font-semibold text-center mb-2">Face ID Nữ (Tùy chọn)</h3>
                                    <ImageUploader onUpload={(e) => handleImageUpload(e, 'faceFemale')} image={faceLockFemale} onRemove={() => setFaceLockFemale(null)} text="Khóa Gương Mặt" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-center mb-2">Face ID Nam (Tùy chọn)</h3>
                                    <ImageUploader onUpload={(e) => handleImageUpload(e, 'faceMale')} image={faceLockMale} onRemove={() => setFaceLockMale(null)} text="Khóa Gương Mặt" />
                                </div>
                                <div className="md:col-span-2 text-xs text-skin-muted text-center -mt-4">
                                    Tải ảnh chân dung rõ nét để AI giữ lại 95% gương mặt.
                                </div>
                            </div>
                            {/* Story Input */}
                            <div>
                                <h3 className="font-semibold mb-2">Câu chuyện tình yêu của bạn</h3>
                                <textarea 
                                    value={userStory}
                                    onChange={(e) => setUserStory(e.target.value)}
                                    placeholder="Viết hoặc dán câu chuyện tình yêu của bạn vào đây. Càng chi tiết, kịch bản AI tạo ra càng hấp dẫn. Ví dụ: 'Hôm ấy trời mưa, An vội vã chạy vào quán cafe thì va phải Bình. Ly cafe đổ hết lên áo cô...' "
                                    className="w-full h-full min-h-[300px] p-4 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 transition text-base text-white auth-input"
                                />
                            </div>
                        </div>
                        <div className="text-center mt-8">
                             <button onClick={handleGenerateScript} disabled={!femaleChar || !maleChar || !userStory} className="themed-button-primary px-12 py-4 text-lg">
                                Nhờ AI Viết Kịch Bản
                            </button>
                        </div>
                    </div>
                );
             case 'scripting':
                return (
                     <div className="text-center p-12">
                         <div className="relative w-24 h-24 mx-auto mb-6">
                            <div className="absolute inset-0 border-4 border-pink-500/30 rounded-full animate-pulse"></div>
                            <div className="absolute inset-0 border-4 border-t-pink-500 rounded-full animate-spin"></div>
                             <div className="absolute inset-0 flex items-center justify-center text-4xl text-pink-400"><i className="ph-fill ph-scroll"></i></div>
                        </div>
                        <p className="text-lg text-gray-300 font-semibold animate-pulse">AI đang phân tích và viết kịch bản...</p>
                    </div>
                );
            case 'review':
                const totalImageCount = script ? script.reduce((sum, scene) => sum + scene.moments.length, 0) : 0;
                const totalCost = totalImageCount * 2;
                return (
                     <div className="max-w-4xl mx-auto p-8 bg-skin-fill-secondary rounded-2xl border border-skin-border shadow-lg animate-fade-in-up">
                         <h2 className="text-3xl font-bold text-pink-400 text-center mb-6">Kịch Bản Phân Cảnh</h2>
                         <div className="space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar pr-4">
                             {script?.map((scene, sceneIndex) => (
                                 <div key={sceneIndex} className="p-4 bg-black/20 rounded-lg border border-white/10">
                                     <h3 className="font-bold text-xl text-cyan-400 mb-3">🎬 Khung cảnh {sceneIndex + 1}: {scene.title}</h3>
                                     <div className="space-y-2 pl-4 border-l-2 border-cyan-500/30">
                                         {scene.moments.map((moment, momentIndex) => (
                                            <div key={momentIndex} className="pb-2">
                                                <p className="font-semibold text-white">✨ Khoảnh khắc {momentIndex + 1}:</p>
                                                <p className="text-sm text-skin-muted italic">"{moment.description}"</p>
                                            </div>
                                         ))}
                                     </div>
                                 </div>
                             ))}
                         </div>
                         <div className="text-center mt-8 p-4 bg-black/30 rounded-lg">
                            <p className="font-semibold text-lg">Tổng cộng: <span className="text-white">{totalImageCount} ảnh</span></p>
                            <p className="text-skin-muted">Chi phí: <span className="font-bold text-pink-400">{totalCost} Kim cương</span></p>
                         </div>
                         <div className="flex gap-4 justify-center mt-6">
                            <button onClick={() => setStep('setup')} className="themed-button-secondary">Chỉnh sửa kịch bản</button>
                            <button onClick={handleGenerateImages} className="themed-button-primary px-8 py-3 text-lg">Tạo Toàn Bộ Ảnh</button>
                         </div>
                     </div>
                );
             case 'generating':
                return (
                     <div className="text-center p-12">
                         <div className="relative w-24 h-24 mx-auto mb-6">
                            <div className="absolute inset-0 border-4 border-pink-500/30 rounded-full"></div>
                             <div className="absolute inset-0 border-8 border-t-pink-500 rounded-full animate-spin"></div>
                             <div className="absolute inset-0 flex items-center justify-center text-4xl text-pink-400"><i className="ph-fill ph-paint-brush-broad"></i></div>
                        </div>
                        <p className="text-xl text-gray-300 font-semibold animate-pulse mb-4">AI đang vẽ nên câu chuyện của bạn...</p>
                        <p className="text-lg font-bold">{generationProgress.current} / {generationProgress.total}</p>
                    </div>
                );
            case 'results':
                const scenes = [...new Set(generatedImages.map(img => img.sceneTitle))];
                return (
                    <div className="max-w-7xl mx-auto p-8 bg-skin-fill-secondary rounded-2xl border border-skin-border shadow-lg animate-fade-in-up">
                         <div className="flex justify-between items-center mb-6">
                             <h2 className="text-3xl font-bold text-pink-400">Thành Quả</h2>
                             <div className="flex gap-4">
                                 <button onClick={restartStory} className="themed-button-secondary">Tạo truyện mới</button>
                                 <button onClick={handleCreateAlbum} disabled={isCreatingAlbum} className="themed-button-primary">
                                     {isCreatingAlbum ? 'Đang xử lý...' : 'Tạo & Tải Album'}
                                </button>
                             </div>
                         </div>
                         <div className="space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar pr-4">
                            {scenes.map((sceneTitle, index) => (
                                <div key={index}>
                                    <h3 className="font-bold text-2xl text-cyan-400 mb-4">🎬 Khung cảnh {index + 1}: {sceneTitle}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {generatedImages.filter(img => img.sceneTitle === sceneTitle).map((image, imgIdx) => (
                                            <div key={imgIdx} className="group relative rounded-lg overflow-hidden border border-white/10">
                                                <img src={image.imageUrl} alt={image.momentDescription} className="w-full h-full object-cover"/>
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                                                <p className="absolute bottom-0 left-0 p-4 text-sm text-white italic">{image.momentDescription}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                         </div>
                    </div>
                );
            default:
                return null;
        }
    };
    
    return <div className="w-full">{renderContent()}</div>;
};

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

export default AILoveStoryPage;
