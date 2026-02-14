import React, { useState, useRef, useEffect } from 'react';
import { Feature, Language, GeneratedImage } from '../../types';
import { Icons } from '../../components/Icons';
import { generateImage, suggestPrompt } from '../../services/geminiService';
import { saveImageToStorage } from '../../services/storageService';
import { createSolidFence, optimizePayload } from '../../utils/imageProcessor';
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
  faceImage: string | null;
  gender: 'female' | 'male';
  isFaceLocked: boolean;
}

export const GenerationTool: React.FC<GenerationToolProps> = ({ feature, lang }) => {
  // --- STAGE MANAGEMENT ---
  const [stage, setStage] = useState<Stage>('input');
  const [processingStep, setProcessingStep] = useState<string>('');

  // --- CONFIGURATION STATE ---
  const [activeMode, setActiveMode] = useState<GenMode>('single');
  const [characters, setCharacters] = useState<CharacterInput[]>([{ id: 1, bodyImage: null, faceImage: null, gender: 'female', isFaceLocked: false }]);
  const [refImage, setRefImage] = useState<string | null>(null);
  
  // Prompt & Text
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [seed, setSeed] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);

  // Advanced Settings
  const [modelType, setModelType] = useState<'flash' | 'pro'>('flash');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [selectedStyle, setSelectedStyle] = useState('cinematic');
  const [resolution, setResolution] = useState<Resolution>('1K'); // For Pro
  const [isSharpening, setIsSharpening] = useState(false); // For Flash (Upscale/Sharpen)

  // Result State
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [generatedData, setGeneratedData] = useState<GeneratedImage | null>(null);

  // Helper Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadType = useRef<{ charId: number, type: 'body' | 'face' } | { type: 'ref' } | null>(null);

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
              newChars.push(existing || { id: i, bodyImage: null, faceImage: null, gender: 'female', isFaceLocked: false });
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

          if ('charId' in currentType!) {
              setCharacters(prev => prev.map(c => {
                  if (c.id === currentType.charId) {
                      return currentType.type === 'body' 
                          ? { ...c, bodyImage: result } 
                          : { ...c, faceImage: result };
                  }
                  return c;
              }));
          } else {
              setRefImage(result);
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
          if (resolution === '1K') cost += 10;
          if (resolution === '2K') cost += 15;
          if (resolution === '4K') cost += 20;
      }

      // Upscale Cost (Only for Flash)
      if (modelType === 'flash' && isSharpening) {
          cost += 1;
      }

      // Face Lock Cost
      const lockedCount = characters.filter(c => c.isFaceLocked).length;
      cost += lockedCount * 1; // 1 Vcoin per face lock

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
    
    // 1. Move to Processing Stage
    setStage('processing');

    try {
      // --- WORKER PATTERN SIMULATION ---
      setProcessingStep('Initializing Workers...');

      // Deduct Vcoin first (and log it for admin stats)
      await updateUserBalance(-cost, `Gen: ${feature.name['en']}`, 'usage');
      
      let finalPrompt = (feature.defaultPrompt || "") + prompt;
      if (selectedStyle) finalPrompt += `, style: ${selectedStyle}`;
      if (negativePrompt) finalPrompt += ` --no ${negativePrompt}`;
      
      // Context for multiple characters
      if (activeMode !== 'single') {
          const genderStr = characters.map(c => `Player ${c.id}: ${c.gender}`).join(', ');
          finalPrompt += ` [Context: ${genderStr}]`;
      }

      // --- CLIENT-SIDE PRE-PROCESSING (Hybrid Flow) ---
      
      let styleRefData: string | undefined = undefined;
      let faceRefData: string | undefined = undefined;

      // 1. Process Body / Style Reference (Solid Fence Strategy)
      // Apply the Structural Image Conditioning to whatever image is in the primary slot (Body or Ref)
      const primaryStructuralImage = characters[0].bodyImage || refImage;

      if (primaryStructuralImage) {
          setProcessingStep('Structural Conditioning (Solid Fence)...');
          
          // First, optimize the payload size
          const optimized = await optimizePayload(primaryStructuralImage);
          
          // Then, apply the Solid Fence technique using the TARGET aspect ratio
          // This creates the #808080 background and black border anchor
          const fencedImage = await createSolidFence(optimized, aspectRatio);
          
          // Extract base64 for API
          styleRefData = fencedImage.split(',')[1];
      }

      // 2. Process Face Reference (Face ID Pipeline)
      // We take the face of the first character if locked or present
      if (characters[0].faceImage && characters[0].isFaceLocked) {
          setProcessingStep('Injecting Face Sprite...');
          const optimizedFace = await optimizePayload(characters[0].faceImage, 512); // Faces can be smaller
          faceRefData = optimizedFace.split(',')[1];
      }

      setProcessingStep('Multimodal Composition (Gemini 3 Vision)...');

      // 3. Call API with Pre-processed Assets
      const result = await generateImage(finalPrompt, aspectRatio, styleRefData, faceRefData);

      if (result) {
        setProcessingStep('Finalizing & Saving...');
        setResultImage(result);
        const newImage: GeneratedImage = {
          id: crypto.randomUUID(),
          url: result,
          prompt: finalPrompt,
          timestamp: Date.now(),
          toolId: feature.id,
          toolName: feature.name['en'],
          engine: modelType === 'pro' ? 'Gemini 3.0 Pro' : 'Gemini 2.5 Flash'
        };
        setGeneratedData(newImage);
        await saveImageToStorage(newImage);
        
        // Move to Result Stage
        setStage('result');
      } else {
          throw new Error("No result returned");
      }
    } catch (error) {
      console.error(error);
      // Refund if failed
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

  // --- DATA LISTS ---
  const styles = [
      { id: 'cinematic', name: 'Cinematic', icon: Icons.Play },
      { id: 'anime', name: 'Anime', icon: Icons.Zap },
      { id: '3d', name: '3D Render', icon: Icons.MessageCircle }, 
      { id: 'photography', name: 'Realistic', icon: Icons.Image },
      { id: 'cyberpunk', name: 'Cyberpunk', icon: Icons.Cpu },
      { id: 'oil', name: 'Oil Paint', icon: Icons.Palette },
      { id: 'sketch', name: 'Sketch', icon: Icons.Wand },
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
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
              <div className="relative w-32 h-32 mb-8">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-t-audi-pink border-r-audi-purple border-b-transparent border-l-transparent animate-spin"></div>
                  <div className="absolute inset-4 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
                      <Icons.Sparkles className="w-12 h-12 text-white" />
                  </div>
              </div>
              <h2 className="font-game text-3xl font-bold text-white mb-2 tracking-widest animate-neon-flash">
                  {lang === 'vi' ? 'ĐANG KHỞI TẠO...' : 'GENERATING...'}
              </h2>
              <p className="text-slate-400 font-mono text-sm max-w-md mx-auto mb-4">
                  {lang === 'vi' ? 'Hệ thống đang vẽ nên ý tưởng của bạn. Vui lòng đợi trong giây lát.' : 'The system is painting your imagination. Please wait a moment.'}
              </p>
              
              <div className="px-4 py-2 bg-white/5 rounded-full border border-white/10">
                  <span className="text-xs font-bold text-audi-cyan animate-pulse">{processingStep || 'Processing...'}</span>
              </div>
          </div>
      );
  }

  // ================= RENDER: RESULT STAGE =================
  if (stage === 'result' && resultImage) {
      return (
          <div className="flex flex-col items-center animate-fade-in pb-20">
              <div className="w-full max-w-4xl bg-[#090014] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                  {/* Result Header */}
                  <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/5">
                      <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="font-bold text-sm text-white">{lang === 'vi' ? 'Hoàn thành' : 'Completed'}</span>
                      </div>
                      <div className="flex gap-2">
                          <button onClick={() => setStage('input')} className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1 rounded bg-white/5 hover:bg-white/10">
                              {lang === 'vi' ? 'Đóng' : 'Close'}
                          </button>
                      </div>
                  </div>
                  
                  {/* Image Display */}
                  <div className="relative bg-black/50 min-h-[400px] flex items-center justify-center p-4">
                      {/* Pattern Background */}
                      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-audi-purple via-transparent to-transparent"></div>
                      
                      <img 
                          src={resultImage} 
                          alt="Result" 
                          className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/5" 
                      />
                  </div>

                  {/* Actions Bar */}
                  <div className="p-6 bg-[#12121a]">
                      <div className="flex flex-col md:flex-row gap-6 justify-between items-center">
                          
                          {/* Prompt Info */}
                          <div className="flex-1 w-full">
                              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{lang === 'vi' ? 'Prompt sử dụng' : 'Prompt Used'}</label>
                              <div className="bg-black/40 rounded-lg p-3 border border-white/10">
                                  <p className="text-sm text-slate-300 line-clamp-2 italic">"{generatedData?.prompt}"</p>
                              </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-3 w-full md:w-auto">
                              <a 
                                  href={resultImage} 
                                  download={`dmp-ai-${Date.now()}.png`} 
                                  className="flex-1 md:flex-none px-6 py-3 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-audi-cyan transition-colors"
                              >
                                  <Icons.Download className="w-4 h-4" />
                                  {lang === 'vi' ? 'Tải Về' : 'Download'}
                              </a>
                              <button 
                                  onClick={() => setStage('input')}
                                  className="flex-1 md:flex-none px-6 py-3 bg-audi-pink text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-pink-600 transition-colors shadow-[0_0_15px_#FF0099]"
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

        {/* --- HEADER TABS --- */}
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
                                {/* Body Upload Slot */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 mb-1 px-1">
                                        <Icons.User className="w-3 h-3 text-audi-pink" />
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{lang === 'vi' ? 'Ảnh Dáng' : 'Body'}</span>
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

                                {/* Face Upload Slot with Lock Button */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 mb-1 px-1">
                                        <Icons.Eye className="w-3 h-3 text-audi-cyan" />
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{lang === 'vi' ? 'Gương Mặt' : 'Face'}</span>
                                    </div>
                                    <div 
                                        onClick={() => handleUploadClick(char.id, 'face')}
                                        className={`w-full aspect-square bg-black/40 rounded-xl border-2 border-dashed cursor-pointer relative overflow-hidden group/item transition-colors ${char.isFaceLocked ? 'border-audi-cyan shadow-[0_0_10px_rgba(33,212,253,0.3)]' : 'border-slate-700 hover:border-audi-cyan'}`}
                                    >
                                        {char.faceImage ? (
                                            <>
                                                <img src={char.faceImage} className="w-full h-full object-cover" alt="Face" />
                                                <div className="absolute top-1 right-1 p-1 bg-black/60 rounded-full cursor-pointer hover:bg-red-500 transition-colors z-10" 
                                                     onClick={(e) => { e.stopPropagation(); setCharacters(prev => prev.map(c => c.id === char.id ? {...c, faceImage: null, isFaceLocked: false} : c)); }}>
                                                    <Icons.X className="w-2.5 h-2.5 text-white" />
                                                </div>
                                                
                                                {/* Re-designed Face Lock Toggle Inside Image */}
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
                                                            <span className="text-[9px] font-black uppercase">{lang === 'vi' ? 'ĐÃ KHÓA' : 'LOCKED'}</span>
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
                                
                                {/* Gender Selector (Only for Multi-character) */}
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

            {/* --- SECTION 2: REFERENCE (OPTIONAL) --- */}
            <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4">
                 <div className="flex items-center gap-4">
                     <div 
                        onClick={handleRefUploadClick}
                        className="w-20 h-20 bg-black/40 rounded-xl border border-dashed border-slate-600 flex items-center justify-center cursor-pointer hover:border-white hover:text-white text-slate-500 shrink-0 overflow-hidden relative"
                     >
                         {refImage ? (
                             <img src={refImage} className="w-full h-full object-cover" alt="Ref" />
                         ) : (
                             <Icons.Image className="w-6 h-6" />
                         )}
                         {refImage && (
                            <button onClick={(e) => {e.stopPropagation(); setRefImage(null);}} className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl shadow"><Icons.X className="w-3 h-3"/></button>
                         )}
                     </div>
                     <div>
                         <h4 className="font-bold text-white text-sm">{lang === 'vi' ? 'Ảnh tham chiếu (Tùy chọn)' : 'Reference Image (Optional)'}</h4>
                         <p className="text-xs text-slate-400 mt-1">{lang === 'vi' ? 'AI sẽ sử dụng bố cục hoặc màu sắc từ ảnh này.' : 'AI will use composition or colors from this image.'}</p>
                     </div>
                 </div>
            </div>

            {/* --- SECTION 3: PROMPT --- */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-audi-purple flex items-center justify-center text-xs">2</div>
                        {lang === 'vi' ? 'Mô tả ý tưởng' : 'Description'}
                    </h3>
                    <button 
                        onClick={handleSuggestPrompt}
                        disabled={isSuggesting}
                        className="text-xs font-bold text-audi-purple hover:text-white flex items-center gap-1 transition-colors"
                    >
                        <Icons.Sparkles className={`w-3 h-3 ${isSuggesting ? 'animate-spin' : ''}`} />
                        {lang === 'vi' ? 'Dùng Magic Prompt' : 'Use Magic Prompt'}
                    </button>
                </div>
                <div className="relative group">
                    <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={lang === 'vi' ? "Mô tả chi tiết bức ảnh bạn muốn tạo (Ví dụ: Một cô gái mặc váy dạ hội đỏ, đứng trên sân khấu neon...)" : "Describe the image in detail..."}
                        className="w-full h-32 bg-[#12121a] border border-white/10 rounded-2xl p-4 text-sm text-white placeholder-slate-600 focus:border-audi-purple outline-none resize-none transition-all focus:shadow-[0_0_20px_rgba(183,33,255,0.1)]"
                    />
                </div>
            </div>

            {/* --- SECTION 4: ADVANCED CONFIGURATION --- */}
            <div className="space-y-3">
                 <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-audi-cyan flex items-center justify-center text-xs text-black">3</div>
                        {lang === 'vi' ? 'Cấu hình nâng cao' : 'Advanced Config'}
                    </h3>
                </div>
                
                <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 space-y-6">
                    
                    {/* Row 1: Ratio & Model */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">{lang === 'vi' ? 'Tỉ lệ khung hình' : 'Aspect Ratio'}</label>
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
                            <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">{lang === 'vi' ? 'Chất lượng Model' : 'Model Quality'}</label>
                            <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                                <button 
                                    onClick={() => setModelType('flash')}
                                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2 ${modelType === 'flash' ? 'bg-white/10 text-audi-cyan shadow' : 'text-slate-500'}`}
                                >
                                    <Icons.Zap className="w-3 h-3" /> Flash
                                </button>
                                <button 
                                    onClick={() => setModelType('pro')}
                                    className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2 ${modelType === 'pro' ? 'bg-gradient-to-r from-audi-pink to-audi-purple text-white shadow' : 'text-slate-500'}`}
                                >
                                    <Icons.Crown className="w-3 h-3" /> Pro 4K
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-white/5 w-full"></div>

                    {/* Row 2: Styles */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">{lang === 'vi' ? 'Phong cách nghệ thuật' : 'Art Style'}</label>
                        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
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

                    <div className="h-px bg-white/5 w-full"></div>

                    {/* Row 3: Negative Prompt & Seed & Upscale/Resolution */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-4">
                             <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">{lang === 'vi' ? 'Loại trừ (Negative)' : 'Negative'}</label>
                             <input 
                                type="text"
                                value={negativePrompt}
                                onChange={(e) => setNegativePrompt(e.target.value)}
                                placeholder="VD: bad quality..."
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:border-slate-500 outline-none"
                             />
                        </div>
                        <div className="md:col-span-3">
                             <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Seed</label>
                             <input 
                                type="text"
                                value={seed}
                                onChange={(e) => setSeed(e.target.value)}
                                placeholder="Random"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:border-slate-500 outline-none"
                             />
                        </div>
                        
                        {/* Dynamic Upscale / Resolution Section */}
                        <div className="md:col-span-5 flex flex-col">
                             {modelType === 'flash' ? (
                                <>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">{lang === 'vi' ? 'Nâng cao' : 'Enhanced'}</label>
                                    <div 
                                        onClick={() => setIsSharpening(!isSharpening)}
                                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${isSharpening ? 'border-audi-yellow bg-audi-yellow/10' : 'border-white/10 bg-black/40 hover:bg-white/5'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Icons.Gem className={`w-4 h-4 ${isSharpening ? 'text-audi-yellow' : 'text-slate-500'}`} />
                                            <div>
                                                <div className={`text-xs font-bold ${isSharpening ? 'text-white' : 'text-slate-400'}`}>{lang === 'vi' ? 'Làm Nét Ảnh' : 'Sharpen Image'}</div>
                                                <div className="text-[9px] text-slate-500">+1 Vcoin</div>
                                            </div>
                                        </div>
                                        <div className={`w-8 h-4 rounded-full relative transition-colors ${isSharpening ? 'bg-audi-yellow' : 'bg-slate-700'}`}>
                                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${isSharpening ? 'left-4.5' : 'left-0.5'}`}></div>
                                        </div>
                                    </div>
                                </>
                             ) : (
                                <>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">{lang === 'vi' ? 'Độ phân giải (Upscale)' : 'Resolution'}</label>
                                    <div className="flex bg-black/40 rounded-lg p-1 border border-white/10 h-[42px]">
                                        {['1K', '2K', '4K'].map((res) => {
                                            const cost = res === '1K' ? 10 : res === '2K' ? 15 : 20;
                                            return (
                                                <button
                                                    key={res}
                                                    onClick={() => setResolution(res as Resolution)}
                                                    className={`flex-1 rounded-md flex flex-col items-center justify-center transition-all ${resolution === res ? 'bg-audi-yellow text-black font-bold shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                                >
                                                    <span className="text-[10px] leading-none">{res}</span>
                                                    <span className={`text-[8px] ${resolution === res ? 'text-black/70' : 'text-slate-600'}`}>{cost} Vcoin</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </>
                             )}
                        </div>
                    </div>

                </div>
            </div>

        </div>

        {/* --- STICKY FOOTER --- */}
        {/* Adjusted Position to be distinct from Global Dock (bottom-24 vs bottom-6) */}
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
                    <span className="tracking-wide">{lang === 'vi' ? 'BẮT ĐẦU TẠO' : 'GENERATE NOW'}</span>
                </button>
            </div>
        </div>

    </div>
  );
};