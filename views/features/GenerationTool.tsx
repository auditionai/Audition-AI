
import React, { useState, useRef, useEffect } from 'react';
import { Feature, Language, GeneratedImage } from '../../types';
import { Icons } from '../../components/Icons';
import { generateImage, suggestPrompt } from '../../services/geminiService';
import { saveImageToStorage } from '../../services/storageService';
import { createSolidFence, optimizePayload, urlToBase64 } from '../../utils/imageProcessor';
import { getUserProfile, updateUserBalance } from '../../services/economyService';

interface GenerationToolProps {
  feature: Feature;
  lang: Language;
}

type GenMode = 'single' | 'couple' | 'group3' | 'group4';
type Stage = 'input' | 'processing' | 'result';
type Resolution = '1K' | '2K' | '4K';

interface CharacterInput {
  id: number;
  bodyImage: string | null;
  faceImage: string | null; // This acts as the IDENTITY + OUTFIT source
  gender: 'female' | 'male';
  isFaceLocked: boolean;
}

export const GenerationTool: React.FC<GenerationToolProps> = ({ feature, lang }) => {
  // --- STAGE MANAGEMENT ---
  const [stage, setStage] = useState<Stage>('input');
  const [currentStep, setCurrentStep] = useState(0);

  // --- CONFIGURATION STATE ---
  const [activeMode, setActiveMode] = useState<GenMode>('single');
  const [characters, setCharacters] = useState<CharacterInput[]>([{ id: 1, bodyImage: null, faceImage: null, gender: 'female', isFaceLocked: false }]);
  
  // Reference Image
  const [refImage, setRefImage] = useState<string | null>(null);
  
  // Prompt & Text
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('real photo, photorealistic, grainy, noise, bad quality, 2d, sketch, extra limbs, missing limbs, mutated hands, bad anatomy, fused bodies, duplicate characters');
  const [seed, setSeed] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isScanningFace, setIsScanningFace] = useState(false); 

  // Advanced Settings
  const [modelType, setModelType] = useState<'flash' | 'pro'>('pro'); // Default to Pro based on user preference
  const [aspectRatio, setAspectRatio] = useState('3:4'); 
  const [selectedStyle, setSelectedStyle] = useState('3d');
  
  // NEW: PRO SETTINGS
  const [resolution, setResolution] = useState<Resolution>('2K'); 
  const [useSearch, setUseSearch] = useState(false); 
  const [isSharpening, setIsSharpening] = useState(false); // For Flash (Upscale/Sharpen)

  // Result State
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [generatedData, setGeneratedData] = useState<GeneratedImage | null>(null);

  // Helper Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadType = useRef<{ charId?: number, type: 'body' | 'face' | 'ref' } | null>(null);

  // --- STEPS CONFIGURATION ---
  const processingSteps = [
      { label: { vi: 'Khởi tạo Worker & Tài nguyên', en: 'Initializing Workers & Resources' } },
      { label: { vi: 'Xác thực & Trừ Vcoin', en: 'Verifying & Deducting Vcoin' } },
      { label: { vi: 'Phân tích Pose & Bố cục từ Ảnh Mẫu', en: 'Analyzing Pose & Composition from Reference' } },
      { label: { vi: 'Tách biệt dữ liệu từng nhân vật', en: 'Isolating Character Data' } }, 
      { label: { vi: 'Kết nối Gemini 3.0 Vision (Multi-Subject Mode)', en: 'Connecting Gemini 3.0 Vision' } },
      { label: { vi: 'Đang render 3D (Kiểm tra giải phẫu)...', en: 'Rendering 3D (Anatomy Check)...' } },
      { label: { vi: 'Hoàn tất & Xử lý hậu kỳ', en: 'Finalizing & Post-processing' } }
  ];

  // --- INITIALIZATION ---
  useEffect(() => {
    if (feature.id.includes('couple')) handleModeChange('couple');
    else if (feature.id.includes('group_3')) handleModeChange('group3');
    else if (feature.id.includes('group_4')) handleModeChange('group4');
    else handleModeChange('single');
  }, [feature]);

  // --- HANDLERS ---

  const handleModeChange = (mode: GenMode) => {
      setActiveMode(mode);
      let count = 1;
      if (mode === 'couple') count = 2;
      if (mode === 'group3') count = 3;
      if (mode === 'group4') count = 4;

      setCharacters(prev => {
          const newChars = [];
          for (let i = 1; i <= count; i++) {
              const existing = prev.find(p => p.id === i);
              newChars.push(existing || { id: i, bodyImage: null, faceImage: null, gender: i % 2 === 0 ? 'male' : 'female', isFaceLocked: false });
          }
          return newChars;
      });
  };

  const handleUploadClick = (charId: number, type: 'body' | 'face') => {
      activeUploadType.current = { charId, type };
      fileInputRef.current?.click();
  };

  const handleRefUploadClick = () => {
      activeUploadType.current = { type: 'ref' };
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeUploadType.current) return;

      const reader = new FileReader();
      reader.onloadend = () => {
          const result = reader.result as string;
          const currentType = activeUploadType.current;

          if (currentType?.type === 'ref') {
             setRefImage(result);
          } else if (currentType?.charId) {
              setCharacters(prev => prev.map(c => {
                  if (c.id === currentType.charId) {
                      return currentType.type === 'body' 
                          ? { ...c, bodyImage: result } 
                          : { ...c, faceImage: result };
                  }
                  return c;
              }));
          }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const toggleFaceLock = (e: React.MouseEvent, charId: number) => {
      e.stopPropagation();
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, isFaceLocked: !c.isFaceLocked } : c));
  };

  const toggleGender = (charId: number, gender: 'male' | 'female') => {
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, gender } : c));
  }

  const calculateCost = () => {
      // Base Cost
      let cost = modelType === 'pro' ? 2 : 1;
      
      // Resolution Cost (Only for Pro)
      if (modelType === 'pro') {
          if (resolution === '1K') cost += 2;
          if (resolution === '2K') cost += 5;
          if (resolution === '4K') cost += 10;
          
          if (useSearch) cost += 3; // Extra for search
      }

      // Multi-character cost
      if (activeMode === 'couple') cost += 2;
      if (activeMode === 'group3') cost += 4;
      if (activeMode === 'group4') cost += 6;

      // Face Lock Cost
      const lockedCount = characters.filter(c => c.isFaceLocked).length;
      cost += lockedCount * 1; 

      return cost;
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
         alert(lang === 'vi' ? 'Vui lòng nhập mô tả' : 'Please enter a prompt');
         return;
    }

    const cost = calculateCost();
    const user = await getUserProfile();

    if ((user.balance || 0) < cost) {
        alert(lang === 'vi' ? 'Số dư không đủ!' : 'Insufficient balance!');
        return;
    }
    
    // VISUAL EFFECT: Face Scanning
    if (characters.some(c => c.faceImage)) {
        setIsScanningFace(true);
        await new Promise(r => setTimeout(r, 2000)); // Show scan effect for 2s
        setIsScanningFace(false);
    }
    
    // START PROCESSING
    setStage('processing');
    setCurrentStep(0);

    try {
      // Step 0: Init
      await new Promise(r => setTimeout(r, 500));
      setCurrentStep(1);

      // Step 1: Payment
      await updateUserBalance(-cost, `Gen: ${feature.name['en']}`, 'usage');
      await new Promise(r => setTimeout(r, 600));
      setCurrentStep(2);
      
      // Step 2: PREPARE POSE STRUCTURE (BLUEPRINT)
      let structureRefData: string | undefined = undefined;
      
      let sourceForStructure = refImage || feature.preview_image;
      
      if (sourceForStructure.startsWith('http')) {
          const b64 = await urlToBase64(sourceForStructure);
          if (b64) sourceForStructure = b64;
      }
      
      if (sourceForStructure) {
          const optimizedStructure = await optimizePayload(sourceForStructure);
          const fencedImage = await createSolidFence(optimizedStructure, aspectRatio);
          structureRefData = fencedImage.split(',')[1];
      }
      
      await new Promise(r => setTimeout(r, 600));
      setCurrentStep(3);

      // Step 3: PREPARE CHARACTER DATA PACKAGES
      // We package each character's identity/outfit image into a structured list
      const characterDataList = [];
      
      for (const char of characters) {
          let charImageData = null;
          // Use faceImage as the primary source for Identity AND Outfit
          if (char.faceImage) {
              const opt = await optimizePayload(char.faceImage, 512);
              charImageData = opt.split(',')[1];
          }
          
          characterDataList.push({
              id: char.id,
              gender: char.gender,
              image: charImageData // Can be null if no upload, AI will gen generic
          });
      }
      
      await new Promise(r => setTimeout(r, 800)); 
      setCurrentStep(4);

      // Step 4: Connecting Gemini
      let finalPrompt = (feature.defaultPrompt || "") + prompt;
      if (selectedStyle) finalPrompt += `, style: ${selectedStyle}`;
      if (negativePrompt) finalPrompt += ` --no ${negativePrompt}`;
      
      await new Promise(r => setTimeout(r, 500));
      setCurrentStep(5);

      // Step 5: Generating
      const result = await generateImage(
          finalPrompt, 
          aspectRatio, 
          structureRefData, // The Pose Blueprint
          characterDataList, // The Array of Players
          modelType === 'pro' ? resolution : '1K', 
          modelType === 'pro' ? useSearch : false 
      );

      if (result) {
        setCurrentStep(6);
        // Step 6: Finalizing
        const newImage: GeneratedImage = {
          id: crypto.randomUUID(),
          url: result,
          prompt: finalPrompt,
          timestamp: Date.now(),
          toolId: feature.id,
          toolName: feature.name['en'],
          engine: modelType === 'pro' ? `Gemini 3.0 Pro ${resolution}` : 'Gemini 2.5 Flash'
        };
        setGeneratedData(newImage);
        await saveImageToStorage(newImage);
        
        await new Promise(r => setTimeout(r, 800));
        
        setResultImage(result);
        setStage('result');
      } else {
          throw new Error("No result returned");
      }
    } catch (error) {
      console.error(error);
      await updateUserBalance(cost, `Refund: ${feature.name['en']} Failed`, 'refund');
      alert(lang === 'vi' ? 'Tạo ảnh thất bại. Đã hoàn lại Vcoin.' : 'Generation failed. Vcoin refunded.');
      setStage('input'); 
    }
  };

  const handleSuggestPrompt = async () => {
    setIsSuggesting(true);
    try {
        const enhancedPrompt = await suggestPrompt(prompt, lang, feature.name[lang]);
        if (enhancedPrompt) setPrompt(enhancedPrompt);
    } catch (error) { console.error(error); } 
    finally { setIsSuggesting(false); }
  };

  // ... (Keep existing Ratios, Styles, Render Logic unchanged) ...
  // Re-using the same UI render code as before
  
  // --- DATA LISTS ---
  const styles = [
      { id: '3d', name: '3D Game', icon: Icons.MessageCircle }, 
      { id: 'blindbox', name: 'Blind Box', icon: Icons.Gift },
      { id: 'anime', name: 'Anime 3D', icon: Icons.Zap },
      { id: 'cinematic', name: 'Cinematic', icon: Icons.Play },
      { id: 'cyberpunk', name: 'Cyberpunk', icon: Icons.Cpu },
      { id: 'clay', name: 'Clay', icon: Icons.Palette },
      { id: 'fashion', name: 'Fashion', icon: Icons.ShoppingBag },
  ];

  const ratios = [
      { id: '1:1', label: '1:1', desc: 'Square' },
      { id: '3:4', label: '3:4', desc: 'Portrait' },
      { id: '4:3', label: '4:3', desc: 'Landscape' },
      { id: '9:16', label: '9:16', desc: 'Story' },
      { id: '16:9', label: '16:9', desc: 'Cinema' },
  ];

  // ================= RENDER: PROCESSING STAGE =================
  if (stage === 'processing') {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in w-full max-w-md mx-auto">
              {/* Spinner */}
              <div className="relative w-24 h-24 mb-8">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-t-audi-pink border-r-audi-purple border-b-transparent border-l-transparent animate-spin"></div>
                  <div className="absolute inset-4 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
                      <Icons.Sparkles className="w-10 h-10 text-white" />
                  </div>
              </div>
              
              <h2 className="font-game text-2xl font-bold text-white mb-2 tracking-widest animate-neon-flash">
                  {lang === 'vi' ? 'ĐANG TẠO NHÂN VẬT...' : 'GENERATING CHARACTER...'}
              </h2>
              <p className="text-slate-400 font-mono text-xs max-w-xs mx-auto mb-8">
                  {lang === 'vi' ? 'Hệ thống đang render 3D. Vui lòng đợi...' : 'Rendering 3D model. Please wait...'}
              </p>
              
              {/* Detailed Steps List */}
              <div className="w-full bg-[#12121a] border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl text-left">
                  {processingSteps.map((s, idx) => {
                      const isDone = currentStep > idx;
                      const isCurrent = currentStep === idx;
                      const isPending = currentStep < idx;

                      return (
                          <div key={idx} className={`flex items-center gap-4 transition-all duration-300 ${isPending ? 'opacity-30 blur-[0.5px]' : 'opacity-100'}`}>
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 transition-all ${
                                  isDone ? 'bg-green-500 border-green-500' :
                                  isCurrent ? 'border-audi-pink animate-spin-slow' :
                                  'border-slate-600'
                              }`}>
                                  {isDone && <Icons.Check className="w-3 h-3 text-black" />}
                                  {isCurrent && <div className="w-1.5 h-1.5 bg-audi-pink rounded-full"></div>}
                              </div>
                              <span className={`text-xs font-mono transition-colors ${
                                  isCurrent ? 'text-audi-pink font-bold animate-pulse' : 
                                  isDone ? 'text-green-500 line-through decoration-green-500/50' : 
                                  'text-slate-400'
                              }`}>
                                  {s.label[lang === 'vi' ? 'vi' : 'en']}
                              </span>
                          </div>
                      )
                  })}
              </div>
          </div>
      );
  }

  // ================= RENDER: RESULT STAGE =================
  if (stage === 'result' && resultImage) {
      return (
          <div className="flex flex-col items-center animate-fade-in pb-20 w-full">
              <div className="w-full max-w-xl bg-[#090014] border border-white/10 rounded-3xl overflow-hidden shadow-2xl mx-auto">
                  <div className="flex justify-between items-center p-3 border-b border-white/10 bg-white/5">
                      <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="font-bold text-xs text-white">{lang === 'vi' ? 'Hoàn thành' : 'Completed'}</span>
                      </div>
                      <div className="flex gap-2">
                          <button onClick={() => setStage('input')} className="text-[10px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10">
                              {lang === 'vi' ? 'Đóng' : 'Close'}
                          </button>
                      </div>
                  </div>
                  
                  <div className="relative bg-black/50 min-h-[300px] flex items-center justify-center p-4">
                      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-audi-purple via-transparent to-transparent"></div>
                      <img 
                          src={resultImage} 
                          alt="Result" 
                          className="max-w-full max-h-[50vh] object-contain rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-white/5" 
                      />
                  </div>

                  <div className="p-4 bg-[#12121a]">
                      <div className="flex flex-col gap-3">
                          <div className="w-full">
                              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">{lang === 'vi' ? 'Prompt sử dụng' : 'Prompt Used'}</label>
                              <div className="bg-black/40 rounded-lg p-2 border border-white/10">
                                  <p className="text-xs text-slate-300 line-clamp-1 italic">"{generatedData?.prompt}"</p>
                              </div>
                          </div>
                          <div className="flex gap-2">
                              <a 
                                  href={resultImage} 
                                  download={`dmp-ai-${Date.now()}.png`} 
                                  className="flex-1 px-4 py-2.5 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-audi-cyan transition-colors text-sm"
                              >
                                  <Icons.Download className="w-4 h-4" />
                                  {lang === 'vi' ? 'Tải Về' : 'Download'}
                              </a>
                              <button 
                                  onClick={() => setStage('input')}
                                  className="flex-1 px-4 py-2.5 bg-audi-pink text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-pink-600 transition-colors shadow-[0_0_15px_#FF0099] text-sm"
                              >
                                  <Icons.Wand className="w-4 h-4" />
                                  {lang === 'vi' ? 'Tạo Tiếp' : 'Create New'}
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // ================= RENDER: INPUT STAGE (DEFAULT) =================
  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto pb-48 animate-fade-in relative">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

        <div className="w-full flex justify-center mb-8">
            <div className="bg-[#12121a] p-1.5 rounded-2xl border border-white/10 flex gap-1 shadow-lg">
                {[
                    { id: 'single', label: { vi: 'Ảnh Đơn', en: 'Single' }, icon: Icons.User },
                    { id: 'couple', label: { vi: 'Ảnh Đôi', en: 'Couple' }, icon: Icons.Heart },
                    { id: 'group3', label: { vi: 'Nhóm 3', en: 'Group 3' }, icon: Icons.User },
                    { id: 'group4', label: { vi: 'Nhóm 4+', en: 'Group 4' }, icon: Icons.User },
                ].map(mode => (
                    <button
                        key={mode.id}
                        onClick={() => handleModeChange(mode.id as GenMode)}
                        className={`px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold transition-all ${activeMode === mode.id ? 'bg-white text-black shadow-md' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                    >
                        {mode.id === 'group4' ? <div className="flex -space-x-1"><Icons.User className="w-3 h-3"/><Icons.User className="w-3 h-3"/></div> : <mode.icon className="w-4 h-4" />}
                        {mode.label[lang === 'vi' ? 'vi' : 'en']}
                    </button>
                ))}
            </div>
        </div>

        <div className="w-full space-y-6">
            
            {/* --- SECTION 1: CHARACTER UPLOAD --- */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-audi-pink flex items-center justify-center text-xs">1</div>
                        {lang === 'vi' ? 'Thiết lập nhân vật' : 'Character Setup'}
                    </h3>
                </div>

                <div className="flex flex-wrap justify-center gap-4 w-full">
                    {characters.map((char) => (
                        <div key={char.id} className="w-[180px] bg-[#12121a] border border-white/10 rounded-2xl p-3 hover:border-white/20 transition-colors relative group shrink-0">
                            <div className="absolute top-0 left-0 bg-white/10 text-[10px] font-bold px-3 py-1 rounded-br-xl rounded-tl-xl text-white">
                                PLAYER {char.id}
                            </div>
                            
                            <div className="flex flex-col gap-3 mt-7">
                                {/* Body Upload Slot (Legacy / Optional) */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 mb-1 px-1">
                                        <Icons.User className="w-3 h-3 text-audi-pink" />
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{lang === 'vi' ? 'Body (Optional)' : 'Body (Optional)'}</span>
                                    </div>
                                    <div 
                                        onClick={() => handleUploadClick(char.id, 'body')}
                                        className="w-full aspect-square bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-pink cursor-pointer relative overflow-hidden group/item transition-colors"
                                    >
                                        {char.bodyImage ? (
                                            <>
                                                <img src={char.bodyImage} className="w-full h-full object-cover" alt="Body" />
                                                <div className="absolute top-1 right-1 p-1 bg-black/60 rounded-full cursor-pointer hover:bg-red-500 transition-colors z-10" 
                                                     onClick={(e) => { e.stopPropagation(); setCharacters(prev => prev.map(c => c.id === char.id ? {...c, bodyImage: null} : c)); }}>
                                                    <Icons.X className="w-2.5 h-2.5 text-white" />
                                                </div>
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 group-hover/item:text-audi-pink">
                                                <Icons.User className="w-5 h-5 mb-1" />
                                                <span className="text-[8px] uppercase font-bold text-center leading-tight px-1">{lang === 'vi' ? 'Tải Dáng' : 'Up Body'}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Face Upload Slot */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 mb-1 px-1">
                                        <Icons.Eye className="w-3 h-3 text-audi-cyan" />
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{lang === 'vi' ? 'Gương Mặt' : 'Face'}</span>
                                    </div>
                                    <div 
                                        onClick={() => handleUploadClick(char.id, 'face')}
                                        className={`w-full aspect-square bg-black/40 rounded-xl border-2 border-dashed cursor-pointer relative overflow-hidden group/item transition-colors ${char.isFaceLocked ? 'border-audi-cyan shadow-[0_0_10px_rgba(33,212,253,0.3)]' : 'border-slate-700 hover:border-audi-cyan'}`}
                                    >
                                        {/* SCAN EFFECT */}
                                        {isScanningFace && char.faceImage && (
                                            <div className="absolute inset-0 z-30 pointer-events-none">
                                                <div className="absolute inset-0 bg-audi-cyan/20 animate-pulse"></div>
                                                <div className="absolute top-0 w-full h-1 bg-audi-cyan shadow-[0_0_10px_#21D4FD] animate-[scan_1s_linear_infinite]"></div>
                                            </div>
                                        )}

                                        {char.faceImage ? (
                                            <>
                                                <img src={char.faceImage} className="w-full h-full object-cover" alt="Face" />
                                                <div className="absolute top-1 right-1 p-1 bg-black/60 rounded-full cursor-pointer hover:bg-red-500 transition-colors z-10" 
                                                     onClick={(e) => { e.stopPropagation(); setCharacters(prev => prev.map(c => c.id === char.id ? {...c, faceImage: null, isFaceLocked: false} : c)); }}>
                                                    <Icons.X className="w-2.5 h-2.5 text-white" />
                                                </div>
                                                
                                                <div 
                                                    onClick={(e) => toggleFaceLock(e, char.id)}
                                                    className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-[90%] py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all z-20 cursor-pointer shadow-lg backdrop-blur-md border ${
                                                        char.isFaceLocked 
                                                        ? 'bg-audi-cyan/90 border-audi-cyan text-black' 
                                                        : 'bg-black/60 border-white/20 text-white hover:bg-black/80'
                                                    }`}
                                                >
                                                    {char.isFaceLocked ? (
                                                         <>
                                                            <Icons.Lock className="w-3 h-3" />
                                                            <span className="text-[9px] font-black uppercase">{lang === 'vi' ? 'FACE ID ON' : 'LOCKED'}</span>
                                                         </>
                                                    ) : (
                                                         <>
                                                            <Icons.Unlock className="w-3 h-3 text-slate-400" />
                                                            <div className="flex flex-col leading-none text-left">
                                                                <span className="text-[8px] font-bold uppercase">{lang === 'vi' ? 'KHÓA MẶT' : 'LOCK FACE'}</span>
                                                                <span className="text-[8px] font-bold text-audi-yellow">1 Vcoin</span>
                                                            </div>
                                                         </>
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 group-hover/item:text-audi-cyan">
                                                <Icons.Eye className="w-5 h-5 mb-1" />
                                                <span className="text-[8px] uppercase font-bold text-center leading-tight px-1">{lang === 'vi' ? 'Tải Mặt' : 'Up Face'}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {activeMode !== 'single' && (
                                    <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10 mt-1">
                                        <button 
                                            onClick={() => toggleGender(char.id, 'female')}
                                            className={`flex-1 py-1 rounded text-[9px] font-bold transition-all ${char.gender === 'female' ? 'bg-audi-pink text-white' : 'text-slate-500 hover:text-white'}`}
                                        >
                                            Nữ
                                        </button>
                                        <button 
                                            onClick={() => toggleGender(char.id, 'male')}
                                            className={`flex-1 py-1 rounded text-[9px] font-bold transition-all ${char.gender === 'male' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:text-white'}`}
                                        >
                                            Nam
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- SECTION 2: PROMPT & REFERENCE --- */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-audi-purple flex items-center justify-center text-xs">2</div>
                        {lang === 'vi' ? 'Mô tả & Ảnh Mẫu' : 'Prompt & Reference'}
                    </h3>
                    <button 
                        onClick={handleSuggestPrompt}
                        disabled={isSuggesting}
                        className="text-xs font-bold text-audi-purple hover:text-white flex items-center gap-1 transition-colors"
                    >
                        <Icons.Sparkles className={`w-3 h-3 ${isSuggesting ? 'animate-spin' : ''}`} />
                        {lang === 'vi' ? 'Magic Prompt' : 'Magic Prompt'}
                    </button>
                </div>
                
                <div className="flex flex-col md:flex-row gap-4">
                    {/* RESTORED: Reference Image Upload */}
                    <div className="w-full md:w-1/3 space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block pl-1">
                            {lang === 'vi' ? 'Ảnh Mẫu (Pose/Bố cục)' : 'Reference Image'}
                        </label>
                        <div 
                            onClick={handleRefUploadClick}
                            className="w-full aspect-[3/4] md:h-32 md:aspect-auto bg-[#12121a] border-2 border-dashed border-slate-700 hover:border-audi-purple rounded-2xl cursor-pointer relative overflow-hidden group transition-all"
                        >
                             {refImage ? (
                                <>
                                    <img src={refImage} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Reference" />
                                    <div className="absolute top-1 right-1 p-1 bg-black/60 rounded-full cursor-pointer hover:bg-red-500 transition-colors z-10" 
                                         onClick={(e) => { e.stopPropagation(); setRefImage(null); }}>
                                        <Icons.X className="w-3 h-3 text-white" />
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] font-bold text-center py-1">
                                        REFERENCE ACTIVE
                                    </div>
                                </>
                             ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 group-hover:text-audi-purple">
                                    <Icons.Image className="w-6 h-6 mb-1" />
                                    <span className="text-[9px] uppercase font-bold text-center leading-tight px-4">
                                        {lang === 'vi' ? 'Tải ảnh mẫu để AI học theo' : 'Upload Reference'}
                                    </span>
                                </div>
                             )}
                        </div>
                    </div>

                    {/* Prompt Text Area */}
                    <div className="w-full md:w-2/3 relative group">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block pl-1 mb-2">
                            {lang === 'vi' ? 'Mô tả chi tiết' : 'Detailed Prompt'}
                        </label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={lang === 'vi' ? "Mô tả trang phục, bối cảnh (Ví dụ: Váy dạ hội đỏ, sân khấu neon...)" : "Describe outfit, background..."}
                            className="w-full h-32 bg-[#12121a] border border-white/10 rounded-2xl p-4 text-sm text-white placeholder-slate-600 focus:border-audi-purple outline-none resize-none transition-all focus:shadow-[0_0_20px_rgba(183,33,255,0.1)]"
                        />
                    </div>
                </div>
            </div>

            {/* --- SECTION 3: ADVANCED CONFIGURATION --- */}
            <div className="space-y-3">
                 <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-audi-cyan flex items-center justify-center text-xs text-black">3</div>
                        {lang === 'vi' ? 'Cấu hình' : 'Config'}
                    </h3>
                </div>
                
                <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">{lang === 'vi' ? 'Tỉ lệ' : 'Ratio'}</label>
                            <div className="flex gap-2">
                                {ratios.map(r => (
                                    <button 
                                        key={r.id}
                                        onClick={() => setAspectRatio(r.id)}
                                        className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all ${aspectRatio === r.id ? 'bg-white text-black border-white' : 'bg-transparent border-white/10 text-slate-500 hover:border-white/30'}`}
                                    >
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">{lang === 'vi' ? 'Chất lượng Mô hình' : 'Model Quality'}</label>
                            <div className="flex bg-black/40 rounded-lg p-1 border border-white/10 mb-3">
                                <button 
                                    onClick={() => setModelType('flash')}
                                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2 ${modelType === 'flash' ? 'bg-white/10 text-audi-cyan shadow' : 'text-slate-500'}`}
                                >
                                    <Icons.Zap className="w-3 h-3" /> Flash (Fast)
                                </button>
                                <button 
                                    onClick={() => setModelType('pro')}
                                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2 ${modelType === 'pro' ? 'bg-gradient-to-r from-audi-pink to-audi-purple text-white shadow' : 'text-slate-500'}`}
                                >
                                    <Icons.Crown className="w-3 h-3" /> Pro 3.0
                                </button>
                            </div>

                            {/* PRO FEATURES: RESOLUTION & SEARCH */}
                            {modelType === 'pro' && (
                                <div className="space-y-3 animate-fade-in bg-white/5 rounded-xl p-3 border border-white/10">
                                    {/* Resolution Selector */}
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">{lang === 'vi' ? 'Độ phân giải' : 'Resolution'}</label>
                                        <div className="flex gap-2">
                                            {['1K', '2K', '4K'].map((res) => (
                                                <button
                                                    key={res}
                                                    onClick={() => setResolution(res as Resolution)}
                                                    className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${resolution === res ? 'bg-audi-purple text-white border-audi-purple' : 'bg-transparent border-white/10 text-slate-500 hover:border-white/30'}`}
                                                >
                                                    {res}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Search Grounding Toggle */}
                                    <div 
                                        onClick={() => setUseSearch(!useSearch)}
                                        className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${useSearch ? 'bg-audi-cyan/10 border-audi-cyan' : 'bg-transparent border-white/10 hover:bg-white/5'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${useSearch ? 'bg-audi-cyan text-black' : 'bg-white/10 text-slate-500'}`}>
                                                <Icons.Search className="w-3 h-3" />
                                            </div>
                                            <div>
                                                <div className={`text-[10px] font-bold ${useSearch ? 'text-audi-cyan' : 'text-slate-400'}`}>Google Search</div>
                                                <div className="text-[8px] text-slate-600">Thêm dữ liệu thực tế</div>
                                            </div>
                                        </div>
                                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${useSearch ? 'bg-audi-cyan' : 'bg-slate-700'}`}>
                                            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${useSearch ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="h-px bg-white/5 w-full"></div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">{lang === 'vi' ? 'Phong cách' : 'Style'}</label>
                        <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                             {styles.map(s => (
                                 <button
                                    key={s.id}
                                    onClick={() => setSelectedStyle(s.id)}
                                    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${selectedStyle === s.id ? 'border-audi-cyan bg-audi-cyan/10 text-audi-cyan' : 'border-white/5 bg-white/5 text-slate-500 hover:bg-white/10'}`}
                                 >
                                     <s.icon className="w-4 h-4 mb-1" />
                                     <span className="text-[9px] font-bold">{s.name}</span>
                                 </button>
                             ))}
                        </div>
                    </div>
                </div>
            </div>

        </div>

        {/* --- STICKY FOOTER --- */}
        <div className="fixed bottom-24 left-4 right-4 md:left-[50%] md:right-auto md:-translate-x-1/2 md:w-[900px] p-4 bg-[#090014]/90 backdrop-blur-md border border-white/10 rounded-2xl z-50 shadow-[0_5px_30px_rgba(0,0,0,0.8)]">
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">{lang === 'vi' ? 'Tổng chi phí' : 'Total Cost'}</span>
                    <div className="flex items-center gap-1.5">
                        <span className="text-2xl font-black text-white">{calculateCost()}</span>
                        <div className="flex flex-col leading-none">
                            <span className="text-[10px] font-bold text-audi-yellow uppercase">VCOIN</span>
                            <span className="text-[8px] text-slate-500">Credits</span>
                        </div>
                    </div>
                </div>

                <button 
                    onClick={handleGenerate}
                    disabled={isSuggesting}
                    className="px-8 py-3 bg-gradient-to-r from-audi-pink to-audi-purple rounded-xl font-bold text-white shadow-[0_0_20px_rgba(255,0,153,0.4)] hover:shadow-[0_0_30px_rgba(255,0,153,0.6)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Icons.Wand className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                    <span className="tracking-wide">{lang === 'vi' ? 'TẠO NHÂN VẬT' : 'GENERATE'}</span>
                </button>
            </div>
        </div>

    </div>
  );
};
