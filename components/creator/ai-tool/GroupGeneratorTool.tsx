// NEW: Create the content for the GroupGeneratorTool component.
import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmationModal from '../../ConfirmationModal';

// Mock data for presets - in a real app, this would come from a database
const MOCK_LAYOUTS = [
    { id: 'cool-squad', name: 'Đội hình Cool Ngầu', img: 'https://picsum.photos/seed/layout1/200/150' },
    { id: 'birthday-party', name: 'Tiệc Sinh nhật', img: 'https://picsum.photos/seed/layout2/200/150' },
    { id: 'selfie-group', name: 'Tự sướng Nhóm', img: 'https://picsum.photos/seed/layout3/200/150' },
    { id: 'dance-battle', name: 'So tài vũ đạo', img: 'https://picsum.photos/seed/layout4/200/150' },
];

const MOCK_BACKGROUNDS = [
    { id: 'audition-stage', name: 'Sàn nhảy Audition', img: 'https://picsum.photos/seed/bg1/200/150' },
    { id: 'tokyo-street', name: 'Phố Tokyo Neon', img: 'https://picsum.photos/seed/bg2/200/150' },
    { id: 'beach-sunset', name: 'Biển Hoàng hôn', img: 'https://picsum.photos/seed/bg3/200/150' },
    { id: 'fantasy-castle', name: 'Lâu đài Kỳ ảo', img: 'https://picsum.photos/seed/bg4/200/150' },
];

const MOCK_STYLES = [
    { id: 'cinematic', name: 'Điện ảnh', img: 'https://picsum.photos/seed/style1/200/150' },
    { id: 'anime', name: 'Hoạt hình Anime', img: 'https://picsum.photos/seed/style2/200/150' },
    { id: '3d-render', name: 'Kết xuất 3D', img: 'https://picsum.photos/seed/style3/200/150' },
    { id: 'oil-painting', name: 'Tranh sơn dầu', img: 'https://picsum.photos/seed/style4/200/150' },
];


const CharacterSlot: React.FC = () => {
    // In a real implementation, this would connect to the parent's state
    // and include ImageUploader components with the new `onPickFromProcessed` prop.
    return (
        <div className="bg-skin-fill p-3 rounded-lg border border-skin-border flex-shrink-0 w-64">
            <h4 className="text-sm font-bold mb-2 text-center text-skin-base">Nhân vật 1</h4>
            <div className="space-y-2">
                 <div className="w-full h-32 bg-skin-input-bg rounded-md flex items-center justify-center text-skin-muted text-xs">Ảnh nhân vật</div>
                 <div className="w-full h-32 bg-skin-input-bg rounded-md flex items-center justify-center text-skin-muted text-xs">Ảnh gương mặt</div>
                 <button className="w-full text-xs font-bold py-1.5 px-2 bg-yellow-500/20 text-yellow-300 rounded-md">Xử lý Gương mặt (-1💎)</button>
            </div>
        </div>
    );
};

const PresetSelector: React.FC<{ title: string, presets: any[], selected: string, onSelect: (id: string) => void }> = ({ title, presets, selected, onSelect }) => (
    <div>
        <h3 className="themed-heading text-lg font-bold themed-title-glow mb-3">{title}</h3>
        <div className="flex gap-3 overflow-x-auto pb-3 custom-scrollbar">
            {presets.map(p => (
                <div key={p.id} onClick={() => onSelect(p.id)} className={`relative rounded-lg overflow-hidden cursor-pointer flex-shrink-0 w-32 h-24 border-2 transition-all ${selected === p.id ? 'border-pink-500 scale-105 shadow-lg' : 'border-transparent hover:border-pink-500/50'}`}>
                    <img src={p.img} alt={p.name} className="w-full h-full object-cover"/>
                    <div className="absolute inset-0 bg-black/50"></div>
                    <p className="absolute bottom-1 left-1 text-xs font-bold text-white p-1">{p.name}</p>
                </div>
            ))}
        </div>
    </div>
);


const GroupGeneratorTool: React.FC = () => {
    const { user } = useAuth();
    const [numCharacters, setNumCharacters] = useState<number>(0);
    const [isConfirmOpen, setConfirmOpen] = useState(false);

    // Selections state
    const [selectedLayout, setSelectedLayout] = useState(MOCK_LAYOUTS[0].id);
    const [selectedBg, setSelectedBg] = useState(MOCK_BACKGROUNDS[0].id);
    const [selectedStyle, setSelectedStyle] = useState(MOCK_STYLES[0].id);
    
    const totalCost = numCharacters * 2; // Example cost: 2 diamonds per character

    const getAspectRatio = () => {
        if (numCharacters <= 2) return '3:4';
        if (numCharacters === 3) return '1:1';
        return '16:9';
    }

    if (numCharacters === 0) {
        return (
            <div className="text-center p-8 min-h-[50vh] flex flex-col items-center justify-center">
                <h2 className="themed-heading text-2xl font-bold themed-title-glow mb-4">Bạn muốn tạo ảnh cho bao nhiêu người?</h2>
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                    {[2, 3, 4, 5].map(num => (
                        <button key={num} onClick={() => setNumCharacters(num)} className="w-24 h-24 bg-skin-fill border-2 border-skin-border-accent rounded-lg text-4xl font-bold text-skin-accent transition-transform hover:scale-110 hover:bg-skin-accent/10">
                            {num}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
             <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => {}} cost={totalCost} />
            <div className="space-y-6">
                <div>
                    <div className="flex justify-between items-center mb-3">
                         <h3 className="themed-heading text-lg font-bold themed-title-glow">1. Cung cấp thông tin nhân vật</h3>
                         <button onClick={() => setNumCharacters(0)} className="text-xs text-skin-muted hover:text-skin-base">(Thay đổi số lượng)</button>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                        {Array.from({ length: numCharacters }).map((_, index) => (
                             <div key={index} className="bg-skin-fill p-3 rounded-lg border border-skin-border flex-shrink-0 w-52">
                                <h4 className="text-sm font-bold mb-2 text-center text-skin-base">Nhân vật {index + 1}</h4>
                                <div className="space-y-2">
                                    <div className="w-full h-24 bg-skin-input-bg rounded-md flex items-center justify-center text-skin-muted text-xs p-2 text-center">
                                        Ảnh nhân vật<br/>(Lấy trang phục)
                                    </div>
                                    <div className="w-full h-24 bg-skin-input-bg rounded-md flex items-center justify-center text-skin-muted text-xs p-2 text-center">
                                        Ảnh gương mặt<br/>(Face ID)
                                    </div>
                                    <button className="w-full text-xs font-bold py-1.5 px-2 bg-yellow-500/20 text-yellow-300 rounded-md">Xử lý Face ID (-1💎)</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <PresetSelector title="2. Chọn Bố cục & Tư thế" presets={MOCK_LAYOUTS} selected={selectedLayout} onSelect={setSelectedLayout} />
                <PresetSelector title="3. Chọn Bối cảnh" presets={MOCK_BACKGROUNDS} selected={selectedBg} onSelect={setSelectedBg} />
                <PresetSelector title="4. Chọn Phong cách nghệ thuật" presets={MOCK_STYLES} selected={selectedStyle} onSelect={setSelectedStyle} />

                <div>
                    <h3 className="themed-heading text-lg font-bold themed-title-glow mb-3">5. Thêm chi tiết (Tùy chọn)</h3>
                    <textarea placeholder="Ví dụ: 'thêm một chiếc bánh sinh nhật', 'mặc trang phục màu đỏ', 'khung cảnh ban đêm'..." className="w-full p-3 bg-skin-input-bg rounded-md border border-skin-border focus:border-skin-border-accent transition text-sm text-skin-base resize-none" rows={2}/>
                </div>
                 
                <div className="mt-auto pt-6 space-y-4 border-t border-skin-border">
                    <div className="grid grid-cols-2 gap-4 text-center text-sm p-3 bg-black/20 rounded-lg">
                        <div>
                             <p className="text-skin-muted">Tỷ lệ khung hình (Tự động)</p>
                             <p className="font-bold text-white">{getAspectRatio()}</p>
                        </div>
                         <div>
                            <p className="text-skin-muted">Chi phí dự kiến</p>
                            <p className="font-bold text-pink-400 flex items-center justify-center gap-1">{totalCost} <i className="ph-fill ph-diamonds-four"></i></p>
                        </div>
                    </div>
                    <button onClick={() => setConfirmOpen(true)} className="themed-button-primary w-full px-8 py-4 font-bold text-lg flex items-center justify-center gap-2">
                        <i className="ph-fill ph-magic-wand"></i>
                        Tạo Ảnh Nhóm
                    </button>
                    <p className="text-xs text-center text-skin-muted">Lưu ý: Thời gian tạo ảnh nhóm sẽ lâu hơn đáng kể so với ảnh đơn.</p>
                </div>
            </div>
        </div>
    );
};

export default GroupGeneratorTool;