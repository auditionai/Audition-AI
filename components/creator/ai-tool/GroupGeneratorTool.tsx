// NEW: Create the content for the GroupGeneratorTool component.
// FIX: Import 'useState' from 'react' to resolve 'Cannot find name' errors.
import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmationModal from '../../ConfirmationModal';
import ImageUploader from '../../ai-tool/ImageUploader';
import { resizeImage } from '../../../utils/imageUtils';

// Mock data for presets - in a real app, this would come from a database
const MOCK_LAYOUTS = [
    { id: 'cool-squad', name: 'Đội hình Cool Ngầu' },
    { id: 'birthday-party', name: 'Tiệc Sinh nhật' },
    { id: 'selfie-group', name: 'Tự sướng Nhóm' },
    { id: 'dance-battle', name: 'So tài vũ đạo' },
];

const MOCK_BACKGROUNDS = [
    { id: 'audition-stage', name: 'Sàn nhảy Audition' },
    { id: 'tokyo-street', name: 'Phố Tokyo Neon' },
    { id: 'beach-sunset', name: 'Biển Hoàng hôn' },
    { id: 'fantasy-castle', name: 'Lâu đài Kỳ ảo' },
];

const MOCK_STYLES = [
    { id: 'cinematic', name: 'Điện ảnh' },
    { id: 'anime', name: 'Hoạt hình Anime' },
    { id: '3d-render', name: 'Kết xuất 3D' },
    { id: 'oil-painting', name: 'Tranh sơn dầu' },
];

type ImageState = { url: string; file: File } | null;

interface CharacterState {
    poseImage: ImageState;
    faceImage: ImageState;
    processedFace: string | null;
}

// Sub-component for Preset Selection
const PresetSelector: React.FC<{
    title: string,
    presets: {id: string, name: string}[],
    selected: string,
    onSelect: (id: string) => void,
    prompt: string,
    onPromptChange: (value: string) => void,
    promptPlaceholder: string
}> = ({ title, presets, selected, onSelect, prompt, onPromptChange, promptPlaceholder }) => (
    <div className="themed-settings-block p-4">
        <h3 className="themed-heading text-base font-bold themed-title-glow mb-3">{title}</h3>
        <div className="grid grid-cols-2 gap-2">
            {presets.map(p => (
                <button 
                    key={p.id} 
                    onClick={() => onSelect(p.id)} 
                    className={`p-2 text-xs font-semibold rounded-md border-2 transition text-center ${selected === p.id ? 'selected-glow' : 'border-skin-border bg-skin-fill-secondary hover:border-pink-500/50 text-skin-base'}`}
                >
                    {p.name}
                </button>
            ))}
        </div>
        <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={promptPlaceholder}
            className="w-full mt-3 p-2 bg-skin-input-bg rounded-md border border-skin-border focus:border-skin-border-accent transition text-xs text-skin-base resize-none"
            rows={2}
        />
    </div>
);

// Main Component
const GroupGeneratorTool: React.FC = () => {
    const { user, showToast } = useAuth();
    const [numCharacters, setNumCharacters] = useState<number>(0);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    
    const [characters, setCharacters] = useState<CharacterState[]>([]);

    // Selections state
    const [selectedLayout, setSelectedLayout] = useState(MOCK_LAYOUTS[0].id);
    const [layoutPrompt, setLayoutPrompt] = useState('');
    const [selectedBg, setSelectedBg] = useState(MOCK_BACKGROUNDS[0].id);
    const [backgroundPrompt, setBackgroundPrompt] = useState('');
    const [selectedStyle, setSelectedStyle] = useState(MOCK_STYLES[0].id);
    const [stylePrompt, setStylePrompt] = useState('');

    const handleNumCharactersSelect = (num: number) => {
        setNumCharacters(num);
        setCharacters(Array(num).fill({
            poseImage: null,
            faceImage: null,
            processedFace: null
        }));
    }

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number, type: 'pose' | 'face') => {
        const file = e.target.files?.[0];
        if (!file) return;

        resizeImage(file, 1024).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
            const newImage = { url: resizedDataUrl, file: resizedFile };
            setCharacters(prev => prev.map((char, i) => {
                if (i === index) {
                    if (type === 'pose') return { ...char, poseImage: newImage };
                    return { ...char, faceImage: newImage, processedFace: null }; // Reset processed on new face upload
                }
                return char;
            }));
        }).catch(() => showToast("Lỗi khi xử lý ảnh.", "error"));
    };

    const handleRemoveImage = (index: number, type: 'pose' | 'face') => {
        setCharacters(prev => prev.map((char, i) => {
            if (i === index) {
                if (type === 'pose') return { ...char, poseImage: null };
                return { ...char, faceImage: null, processedFace: null };
            }
            return char;
        }));
    };
    
    const totalCost = numCharacters + characters.filter(c => c.faceImage && !c.processedFace).length;

    const handleGenerateClick = () => {
        if (user && user.diamonds < totalCost) {
            showToast(`Bạn cần ${totalCost} kim cương, nhưng chỉ có ${user.diamonds}. Vui lòng nạp thêm.`, 'error');
            return;
        }
        setConfirmOpen(true);
    };

    const getAspectRatio = () => {
        if (numCharacters <= 2) return '3:4';
        if (numCharacters === 3) return '1:1';
        return '16:9';
    };

    if (numCharacters === 0) {
        return (
            <div className="text-center p-8 min-h-[50vh] flex flex-col items-center justify-center animate-fade-in">
                <h2 className="themed-heading text-2xl font-bold themed-title-glow mb-4">Bạn muốn tạo ảnh cho bao nhiêu người?</h2>
                <p className="text-skin-muted mb-6">Chọn số lượng nhân vật để bắt đầu Studio.</p>
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                    {[2, 3, 4, 5].map(num => (
                        <button 
                            key={num} 
                            onClick={() => handleNumCharactersSelect(num)} 
                            className="w-28 h-28 bg-skin-fill-secondary border-2 border-skin-border rounded-lg text-5xl font-black text-skin-base transition-all duration-300 hover:scale-110 hover:border-skin-border-accent hover:text-skin-accent hover:shadow-accent"
                        >
                            {num}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
             <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => { showToast('Tính năng đang được phát triển!', 'success'); setConfirmOpen(false); }} cost={totalCost} />
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Left Column - Character Inputs */}
                <div className="w-full lg:w-1/2">
                     <div className="flex justify-between items-center mb-3">
                         <h3 className="themed-heading text-lg font-bold themed-title-glow">1. Cung cấp thông tin nhân vật</h3>
                         <button onClick={() => setNumCharacters(0)} className="text-xs text-skin-muted hover:text-skin-base">(Thay đổi)</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {characters.map((char, index) => (
                             <div key={index} className="bg-skin-fill p-3 rounded-xl border border-skin-border space-y-3">
                                <h4 className="text-sm font-bold text-center text-skin-base">Nhân vật {index + 1}</h4>
                                <ImageUploader onUpload={(e) => handleImageUpload(e, index, 'pose')} image={char.poseImage} onRemove={() => handleRemoveImage(index, 'pose')} text="Ảnh Nhân vật" onPickFromProcessed={() => showToast('Tính năng đang phát triển!', 'success')} />
                                <ImageUploader onUpload={(e) => handleImageUpload(e, index, 'face')} image={char.faceImage} onRemove={() => handleRemoveImage(index, 'face')} text="Ảnh Gương mặt (Face ID)" onPickFromProcessed={() => showToast('Tính năng đang phát triển!', 'success')} />
                                <button className="w-full text-xs font-bold py-1.5 px-2 bg-yellow-500/20 text-yellow-300 rounded-md hover:bg-yellow-500/30">Xử lý Face ID (-1💎)</button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Column - Settings & Generation */}
                <div className="w-full lg:w-1/2 flex flex-col gap-4">
                    <PresetSelector title="2. Chọn Bố cục & Tư thế" presets={MOCK_LAYOUTS} selected={selectedLayout} onSelect={setSelectedLayout} prompt={layoutPrompt} onPromptChange={setLayoutPrompt} promptPlaceholder="Thêm chi tiết về bố cục..." />
                    <PresetSelector title="3. Chọn Bối cảnh" presets={MOCK_BACKGROUNDS} selected={selectedBg} onSelect={setSelectedBg} prompt={backgroundPrompt} onPromptChange={setBackgroundPrompt} promptPlaceholder="Thêm chi tiết về bối cảnh..." />
                    <PresetSelector title="4. Chọn Phong cách nghệ thuật" presets={MOCK_STYLES} selected={selectedStyle} onSelect={setSelectedStyle} prompt={stylePrompt} onPromptChange={setStylePrompt} promptPlaceholder="Thêm chi tiết về phong cách..." />

                     <div className="mt-auto pt-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-center text-sm p-3 bg-black/20 rounded-lg">
                            <div>
                                <p className="text-skin-muted">Tỷ lệ khung hình</p>
                                <p className="font-bold text-white">{getAspectRatio()}</p>
                            </div>
                            <div>
                                <p className="text-skin-muted">Chi phí dự kiến</p>
                                <p className="font-bold text-pink-400 flex items-center justify-center gap-1">{totalCost} <i className="ph-fill ph-diamonds-four"></i></p>
                            </div>
                        </div>
                        <button onClick={handleGenerateClick} className="themed-button-primary w-full px-8 py-4 font-bold text-lg flex items-center justify-center gap-2">
                            <i className="ph-fill ph-magic-wand"></i>
                            Tạo Ảnh Nhóm
                        </button>
                        <p className="text-xs text-center text-skin-muted">Lưu ý: Thời gian tạo ảnh nhóm sẽ lâu hơn đáng kể so với ảnh đơn.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GroupGeneratorTool;