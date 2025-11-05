import React, { useState, useMemo } from 'react';
import SettingsBlock from './ai-tool/SettingsBlock.tsx';
import ImageUploader from './ai-tool/ImageUploader.tsx';
import ToggleSwitch from './ai-tool/ToggleSwitch.tsx';
import AspectRatioButton from './ai-tool/AspectRatioButton.tsx';
import ModelSelectionModal from './ai-tool/ModelSelectionModal.tsx';
import InstructionModal from './ai-tool/InstructionModal.tsx';
import GenerationProgress from './ai-tool/GenerationProgress.tsx';
import DiamondIcon from './common/DiamondIcon.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useImageGenerator, useBackgroundRemover } from '../hooks/useImageGenerator.ts';
import { DETAILED_AI_MODELS, STYLE_PRESETS_NEW } from '../constants/aiToolData.ts';
import { AIModel, StylePreset } from '../types.ts';

type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced';

const AITool: React.FC = () => {
  const { user, showToast } = useAuth();
  const { isLoading: isGenerating, generatedImage, generateImage, COST_PER_IMAGE } = useImageGenerator();
  const { isProcessing: isRemovingBg, removeBackground, COST_PER_REMOVAL } = useBackgroundRemover();

  // State
  const [prompt, setPrompt] = useState('');
  const [characterImage, setCharacterImage] = useState<{ file: File; url: string } | null>(null);
  const [styleImage, setStyleImage] = useState<{ file: File; url: string } | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(DETAILED_AI_MODELS.find(m => m.recommended)?.id || DETAILED_AI_MODELS[0].id);
  const [selectedStyleId, setSelectedStyleId] = useState<string>('none');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [useRandomSeed, setUseRandomSeed] = useState(true);

  const [isModelModalOpen, setModelModalOpen] = useState(false);
  const [instructionKey, setInstructionKey] = useState<InstructionKey | null>(null);
  const [generationStep, setGenerationStep] = useState(0);

  const selectedModel: AIModel = useMemo(() => DETAILED_AI_MODELS.find(m => m.id === selectedModelId)!, [selectedModelId]);
  const selectedStyle: StylePreset = useMemo(() => STYLE_PRESETS_NEW.find(s => s.id === selectedStyleId)!, [selectedStyleId]);
  
  const isImageInputDisabled = useMemo(() => !selectedModel.supportedModes.includes('image-to-image'), [selectedModel]);

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<{ file: File; url: string } | null>>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setter({ file, url: URL.createObjectURL(file) });
    }
  };

  const handleSelectModel = (id: string) => {
    const newModel = DETAILED_AI_MODELS.find(m => m.id === id)!;
    if (!newModel.supportedModes.includes('image-to-image')) {
      setCharacterImage(null);
      setStyleImage(null);
      showToast('Model này không hỗ trợ ảnh đầu vào, ảnh của bạn đã được xóa.', 'info');
    }
    setSelectedModelId(id);
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      showToast('Vui lòng nhập mô tả (prompt).', 'error');
      return;
    }
    if (!user || user.diamonds < COST_PER_IMAGE) {
        showToast('Bạn không đủ kim cương để tạo ảnh.', 'error');
        return;
    }
    await generateImage(prompt, characterImage?.file || null, styleImage?.file || null, selectedModel, selectedStyle, aspectRatio, setGenerationStep);
  };
  
  const handleRemoveBg = async () => {
      if (!characterImage) {
          showToast('Vui lòng tải ảnh nhân vật trước.', 'error');
          return;
      }
      if (!user || user.diamonds < COST_PER_REMOVAL) {
        showToast('Bạn không đủ kim cương để tách nền.', 'error');
        return;
    }
      const resultDataUrl = await removeBackground(characterImage.file);
      if (resultDataUrl) {
          const res = await fetch(resultDataUrl);
          const blob = await res.blob();
          const file = new File([blob], "bg-removed.png", { type: "image/png" });
          setCharacterImage({ file, url: URL.createObjectURL(file) });
      }
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Side: Settings */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <SettingsBlock title="Ảnh Nhân Vật (Tùy chọn)" instructionKey="character" step={1} onInstructionClick={setInstructionKey}>
            <ImageUploader 
                onUpload={(e) => handleImageUpload(e, setCharacterImage)}
                image={characterImage}
                onRemove={() => setCharacterImage(null)}
                text="Tải ảnh gốc của bạn"
                disabled={isImageInputDisabled}
            />
             <button
                onClick={handleRemoveBg}
                disabled={!characterImage || isImageInputDisabled || isRemovingBg}
                className="w-full mt-2 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
             >
                {isRemovingBg ? "Đang xử lý..." : "Tách nền ảnh"} <DiamondIcon cost={COST_PER_REMOVAL}/>
            </button>
          </SettingsBlock>
          <SettingsBlock title="Ảnh Mẫu Phong Cách (Tùy chọn)" instructionKey="style" step={2} onInstructionClick={setInstructionKey}>
             <ImageUploader 
                onUpload={(e) => handleImageUpload(e, setStyleImage)}
                image={styleImage}
                onRemove={() => setStyleImage(null)}
                text="Tải ảnh tham khảo"
                processType="style"
                disabled={isImageInputDisabled}
            />
          </SettingsBlock>
        </div>

        {/* Middle: Main Controls */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <SettingsBlock title="Mô tả (Prompt)" instructionKey="prompt" step={3} onInstructionClick={setInstructionKey}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='Ví dụ: "Một cô gái xinh đẹp tóc bạch kim, mặc váy dạ hội lấp lánh, đang khiêu vũ dưới bầu trời đầy sao, phong cách điện ảnh..."'
              className="w-full flex-grow bg-black/30 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-pink-500 focus:outline-none custom-scrollbar min-h-[200px]"
            />
          </SettingsBlock>
          <SettingsBlock title="Cài đặt nâng cao" instructionKey="advanced" step={4} onInstructionClick={setInstructionKey}>
            <div className="space-y-2">
                <div className="flex items-center justify-between py-2">
                    <span className="text-gray-300 text-sm">Phong cách</span>
                    <select
                        value={selectedStyleId}
                        onChange={(e) => setSelectedStyleId(e.target.value)}
                        className="bg-white/10 text-white text-sm rounded-md px-3 py-1.5 focus:ring-2 focus:ring-pink-500 focus:outline-none"
                    >
                        {STYLE_PRESETS_NEW.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                    </select>
                </div>
                 <div className="flex items-center justify-between py-2 border-t border-white/10">
                    <span className="text-gray-300 text-sm">Mô hình AI</span>
                    <button onClick={() => setModelModalOpen(true)} className="bg-white/10 text-white text-sm rounded-md px-3 py-1.5 hover:bg-white/20 transition">
                       {selectedModel.name}
                    </button>
                </div>
                <div className="border-t border-white/10 pt-2">
                    <p className="text-gray-300 text-sm mb-2">Tỷ lệ khung hình</p>
                    <div className="grid grid-cols-5 gap-2">
                        <AspectRatioButton value="1:1" icon={<div className="w-5 h-5 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                        <AspectRatioButton value="3:4" icon={<div className="w-5 h-[26.66px] bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                        <AspectRatioButton value="4:3" icon={<div className="w-[26.66px] h-5 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                        <AspectRatioButton value="9:16" icon={<div className="w-5 h-[35.55px] bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                        <AspectRatioButton value="16:9" icon={<div className="w-[35.55px] h-5 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                    </div>
                </div>
                 <ToggleSwitch label="Seed ngẫu nhiên" checked={useRandomSeed} onChange={(e) => setUseRandomSeed(e.target.checked)} />
            </div>
          </SettingsBlock>
        </div>

        {/* Right Side: Output */}
        <div className="lg:col-span-1 bg-[#1a1a22]/80 p-4 rounded-xl border border-white/10 flex flex-col min-h-[500px] lg:min-h-0">
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-semibold text-gray-200">Kết quả</h3>
             <div className="flex items-center gap-1 text-sm font-bold bg-pink-500/10 text-pink-300 px-3 py-1 rounded-full">
                <DiamondIcon cost={COST_PER_IMAGE}/>
             </div>
          </div>
          <div className="flex-grow w-full bg-black/30 rounded-lg flex items-center justify-center overflow-hidden">
            {isGenerating ? (
              <GenerationProgress currentStep={generationStep} />
            ) : generatedImage ? (
              <img src={generatedImage} alt="Generated result" className="w-full h-full object-contain animate-fade-in" />
            ) : (
              <div className="text-center text-gray-500 p-4">
                <i className="ph-fill ph-image-square text-5xl mb-3"></i>
                <p className="font-semibold">Ảnh của bạn sẽ xuất hiện ở đây</p>
              </div>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={isGenerating}
            className="w-full mt-4 py-4 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-lg transition-all duration-300 shadow-xl shadow-[#F72585]/30 hover:shadow-2xl hover:shadow-[#F72585]/40 hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {isGenerating ? 'Đang Sáng Tạo...' : 'Tạo Ảnh'}
          </button>
        </div>
      </div>
      <ModelSelectionModal 
        isOpen={isModelModalOpen}
        onClose={() => setModelModalOpen(false)}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        characterImage={!!characterImage}
      />
       <InstructionModal 
        isOpen={!!instructionKey}
        onClose={() => setInstructionKey(null)}
        instructionKey={instructionKey}
      />
    </div>
  );
};

export default AITool;
