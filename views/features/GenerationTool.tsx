
import React, { useState, useRef, useEffect } from 'react';
import { Feature, Language, GeneratedImage } from '../../types';
import { Icons } from '../../components/Icons';
import { generateImage, suggestPrompt } from '../../services/geminiService';
import { saveImageToStorage } from '../../services/storageService';
import { createSolidFence, optimizePayload, urlToBase64 } from '../../utils/imageProcessor';
import { getUserProfile, updateUserBalance } from '../../services/economyService';
import { useNotification } from '../../components/NotificationSystem';

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
  shoesImage: string | null; 
  gender: 'female' | 'male';
  isFaceLocked: boolean;
}

export const GenerationTool: React.FC<GenerationToolProps> = ({ feature, lang }) => {
  const { notify } = useNotification();
  const [stage, setStage] = useState<Stage>('input');
  const [progressMsg, setProgressMsg] = useState('');
  const [progressLogs, setProgressLogs] = useState<string[]>([]);

  const [activeMode, setActiveMode] = useState<GenMode>('single');
  const [characters, setCharacters] = useState<CharacterInput[]>([{ id: 1, bodyImage: null, faceImage: null, shoesImage: null, gender: 'female', isFaceLocked: false }]);
  
  const [refImage, setRefImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('crowd, extra people, audience, bystanders, deformed, bad anatomy, disfigured, poorly drawn face, mutation, mutated, extra limb, ugly, disgusting, poorly drawn hands, missing limb, floating limbs, disconnected limbs, malformed hands, blur, out of focus, long neck, long body, mutated hands and fingers, out of frame, blender, doll, cropped, low-res, close-up, poorly-drawn face, out of frame double, two heads, blurred, ugly, disfigured, too many fingers, deformed, repetitive, black and white, grainy, extra limbs, bad anatomy, duplicate, photorealistic, realistic photo, sketch, cartoon, drawing, art, 2d');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isScanningFace, setIsScanningFace] = useState(false); 

  const [modelType, setModelType] = useState<'flash' | 'pro'>('pro'); 
  const [aspectRatio, setAspectRatio] = useState('3:4'); 
  const [selectedStyle, setSelectedStyle] = useState('3d');
  const [resolution, setResolution] = useState<Resolution>('2K'); 
  const [useSearch, setUseSearch] = useState(false); 
  const [useCloudRef, setUseCloudRef] = useState(true); // Default to True for High Quality

  const [resultImage, setResultImage] = useState<string | null>(null);
  const [generatedData, setGeneratedData] = useState<GeneratedImage | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadType = useRef<{ charId?: number, type: 'body' | 'face' | 'shoes' | 'ref' } | null>(null);

  useEffect(() => {
    if (feature.id.includes('couple')) handleModeChange('couple');
    else if (feature.id.includes('group_3')) handleModeChange('group3');
    else if (feature.id.includes('group_4')) handleModeChange('group4');
    else handleModeChange('single');
  }, [feature]);

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
              newChars.push(existing || { id: i, bodyImage: null, faceImage: null, shoesImage: null, gender: i % 2 === 0 ? 'male' : 'female', isFaceLocked: false });
          }
          return newChars;
      });
  };

  const handleUploadClick = (charId: number, type: 'body' | 'face' | 'shoes') => {
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
                      if (currentType.type === 'body') return { ...c, bodyImage: result };
                      if (currentType.type === 'face') return { ...c, faceImage: result };
                      if (currentType.type === 'shoes') return { ...c, shoesImage: result };
                  }
                  return c;
              }));
          }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const toggleGender = (charId: number, gender: 'male' | 'female') => {
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, gender } : c));
  }

  const calculateCost = () => {
      let cost = modelType === 'pro' ? 2 : 1;
      if (modelType === 'pro') {
          if (resolution === '1K') cost += 2;
          if (resolution === '2K') cost += 5;
          if (resolution === '4K') cost += 10;
          if (useSearch) cost += 3; 
          if (useCloudRef) cost += 2; // Extra for cloud upload handling
      }
      if (activeMode === 'couple') cost += 2;
      if (activeMode === 'group3') cost += 4;
      if (activeMode === 'group4') cost += 6;
      
      return cost;
  };

  const addLog = (msg: string) => {
      setProgressLogs(prev => [...prev, msg]);
      setProgressMsg(msg);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
         notify(lang === 'vi' ? 'Vui lòng nhập mô tả' : 'Please enter a prompt', 'warning');
         return;
    }

    const cost = calculateCost();
    const user = await getUserProfile();

    if ((user.balance || 0) < cost) {
        notify(lang === 'vi' ? 'Số dư không đủ!' : 'Insufficient balance!', 'error');
        return;
    }
    
    if (characters.some(c => c.faceImage)) {
        setIsScanningFace(true);
        await new Promise(r => setTimeout(r, 2000)); 
        setIsScanningFace(false);
    }
    
    setStage('processing');
    setProgressLogs([]);
    addLog(lang === 'vi' ? 'Khởi tạo Digital Twin V6 (High-Fidelity)...' : 'Initializing Protocol V6...');

    try {
      await new Promise(r => setTimeout(r, 500));
      await updateUserBalance(-cost, `Gen: ${feature.name['en']}`, 'usage');
      addLog(lang === 'vi' ? `Đã trừ ${cost} Vcoin` : `Deducted ${cost} Vcoin`);
      
      let structureRefData: string | undefined = undefined;
      let sourceForStructure = refImage || feature.preview_image;
      if (sourceForStructure.startsWith('http')) {
          const b64 = await urlToBase64(sourceForStructure);
          if (b64) sourceForStructure = b64;
      }
      if (sourceForStructure) {
          const optimizedStructure = await optimizePayload(sourceForStructure);
          structureRefData = await createSolidFence(optimizedStructure, aspectRatio, true);
      }
      
      const characterDataList = [];
      for (const char of characters) {
          characterDataList.push({
              id: char.id,
              gender: char.gender,
              image: char.bodyImage, 
              faceImage: char.faceImage,
              shoesImage: char.shoesImage
          });
      }
      
      let finalPrompt = (feature.defaultPrompt || "") + prompt;
      if (selectedStyle) finalPrompt += `, style: ${selectedStyle}`;
      if (negativePrompt) finalPrompt += ` --no ${negativePrompt}`;
      
      const result = await generateImage(
          finalPrompt, 
          aspectRatio, 
          structureRefData, 
          characterDataList, 
          modelType === 'pro' ? resolution : '1K', 
          modelType === 'pro' ? useSearch : false,
          useCloudRef, // Pass the new flag
          (msg) => addLog(msg)
      );

      if (result) {
        addLog(lang === 'vi' ? 'Hoàn tất!' : 'Finalizing...');
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
        setResultImage(result);
        setStage('result');
        notify(lang === 'vi' ? 'Tạo ảnh thành công!' : 'Generation successful!', 'success');
      } else {
          throw new Error("No result returned");
      }
    } catch (error) {
      console.error(error);
      await updateUserBalance(cost, `Refund: ${feature.name['en']} Failed`, 'refund');
      notify(lang === 'vi' ? 'Lỗi. Đã hoàn tiền.' : 'Error. Refunded.', 'error');
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

  const ratios = [
      { id: '1:1', label: '1:1', desc: 'Square' },
      { id: '3:4', label: '3:4', desc: 'Portrait' },
      { id: '16:9', label: '16:9', desc: 'Cinema' },
  ];

  if (stage === 'processing') {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in w-full max-w-md mx-auto">
              <div className="relative w-24 h-24 mb-8">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-t-audi-pink border-r-audi-purple border-b-transparent border-l-transparent animate-spin"></div>
                  <div className="absolute inset-4 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
                      <Icons.Sparkles className="w-10 h-10 text-white" />
                  </div>
              </div>
              <h2 className="font-game text-2xl font-bold text-white mb-2 tracking-widest animate-neon-flash">
                  {lang === 'vi' ? 'VISUAL ANCHORING V6' : 'PROCESSING V6'}
              </h2>
              <p className="text-audi-cyan font-mono text-sm max-w-xs mx-auto mb-8 animate-pulse font-bold">
                  {progressMsg}
              </p>
              <div className="w-full bg-[#12121a] border border-white/10 rounded-2xl p-4 space-y-2 shadow-2xl text-left h-48 overflow-y-auto custom-scrollbar">
                  {progressLogs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs font-mono border-b border-white/5 pb-1 last:border-0 animate-fade-in">
                          <span className="text-audi-pink"> &gt; </span>
                          <span className={idx === progressLogs.length - 1 ? 'text-white font-bold' : 'text-slate-400'}>{log}</span>
                      </div>
                  ))}
              </div>
          </div>
      );
  }

  if (stage === 'result' && resultImage) {
      return (
          <div className="flex flex-col items-center animate-fade-in pb-20 w-full">
              <div className="w-full max-w-xl bg-[#090014] border border-white/10 rounded-3xl overflow-hidden shadow-2xl mx-auto">
                  <div className="flex justify-between items-center p-3 border-b border-white/10 bg-white/5">
                      <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="font-bold text-xs text-white">Result</span>
                      </div>
                      <button onClick={() => setStage('input')} className="text-[10px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10">X</button>
                  </div>
                  <div className="relative bg-black/50 min-h-[300px] flex items-center justify-center p-4">
                      <img src={resultImage} alt="Result" className="max-w-full max-h-[50vh] object-contain rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-white/5" />
                  </div>
                  <div className="p-4 bg-[#12121a] flex flex-col gap-3">
                      <div className="flex gap-2">
                          <a href={resultImage} download={`dmp-ai-${Date.now()}.png`} className="flex-1 px-4 py-2.5 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-audi-cyan transition-colors text-sm">
                              <Icons.Download className="w-4 h-4" /> Download
                          </a>
                          <button onClick={() => setStage('input')} className="flex-1 px-4 py-2.5 bg-audi-pink text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-pink-600 transition-colors shadow-[0_0_15px_#FF0099] text-sm">
                              <Icons.Wand className="w-4 h-4" /> New
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

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
            
            {/* CHARACTER INPUT SECTION */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-audi-pink flex items-center justify-center text-xs">1</div>
                        {lang === 'vi' ? 'Hồ sơ nhân vật (Body - Face - Shoes)' : 'Character Dossier'}
                    </h3>
                </div>

                <div className="flex flex-wrap justify-center gap-4 w-full">
                    {characters.map((char) => (
                        <div key={char.id} className="w-[200px] bg-[#12121a] border border-white/10 rounded-2xl p-3 hover:border-white/20 transition-colors relative group shrink-0">
                            <div className="absolute top-0 left-0 bg-white/10 text-[10px] font-bold px-3 py-1 rounded-br-xl rounded-tl-xl text-white">
                                PLAYER {char.id}
                            </div>
                            
                            <div className="flex flex-col gap-2 mt-7">
                                {/* BODY SLOT */}
                                <div onClick={() => handleUploadClick(char.id, 'body')} className="w-full h-32 bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-pink cursor-pointer relative overflow-hidden group/item">
                                    {char.bodyImage ? (
                                        <img src={char.bodyImage} className="w-full h-full object-contain" alt="Body" />
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                                            <Icons.User className="w-5 h-5 mb-1" />
                                            <span className="text-[8px] uppercase font-bold">BODY (Required)</span>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    {/* FACE SLOT */}
                                    <div onClick={() => handleUploadClick(char.id, 'face')} className="aspect-square bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-cyan cursor-pointer relative overflow-hidden group/item">
                                        {char.faceImage ? (
                                            <img src={char.faceImage} className="w-full h-full object-cover" alt="Face" />
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                                                <Icons.Eye className="w-4 h-4 mb-1" />
                                                <span className="text-[7px] uppercase font-bold">FACE</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* SHOES SLOT */}
                                    <div onClick={() => handleUploadClick(char.id, 'shoes')} className="aspect-square bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-yellow cursor-pointer relative overflow-hidden group/item">
                                        {char.shoesImage ? (
                                            <img src={char.shoesImage} className="w-full h-full object-cover" alt="Shoes" />
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                                                <div className="w-4 h-4 border-2 border-current rounded-sm mb-1"></div>
                                                <span className="text-[7px] uppercase font-bold text-center">SHOES<br/>(Vital)</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {activeMode !== 'single' && (
                                    <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10 mt-1">
                                        <button onClick={() => toggleGender(char.id, 'female')} className={`flex-1 py-1 rounded text-[9px] font-bold ${char.gender === 'female' ? 'bg-audi-pink text-white' : 'text-slate-500'}`}>Nữ</button>
                                        <button onClick={() => toggleGender(char.id, 'male')} className={`flex-1 py-1 rounded text-[9px] font-bold ${char.gender === 'male' ? 'bg-blue-500 text-white' : 'text-slate-500'}`}>Nam</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* PROMPT SECTION */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-audi-purple flex items-center justify-center text-xs">2</div>
                        {lang === 'vi' ? 'Mô tả & Bối cảnh' : 'Prompt & Scene'}
                    </h3>
                    <button onClick={handleSuggestPrompt} disabled={isSuggesting} className="text-xs font-bold text-audi-purple flex items-center gap-1">
                        <Icons.Sparkles className={`w-3 h-3 ${isSuggesting ? 'animate-spin' : ''}`} /> Magic Prompt
                    </button>
                </div>
                
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="w-full md:w-1/3 space-y-2">
                        <div onClick={handleRefUploadClick} className="w-full aspect-[16/9] bg-[#12121a] border-2 border-dashed border-slate-700 hover:border-audi-purple rounded-2xl cursor-pointer relative overflow-hidden flex items-center justify-center">
                             {refImage ? (
                                <img src={refImage} className="w-full h-full object-contain bg-black" alt="Ref" />
                             ) : (
                                <div className="text-center text-slate-500">
                                    <Icons.Image className="w-6 h-6 mx-auto mb-1" />
                                    <span className="text-[9px] font-bold">POSE REF (Optional)</span>
                                </div>
                             )}
                        </div>
                    </div>
                    <div className="w-full md:w-2/3">
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={lang === 'vi' ? "Mô tả bối cảnh..." : "Describe background..."}
                            className="w-full h-full min-h-[100px] bg-[#12121a] border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-audi-purple outline-none resize-none"
                        />
                    </div>
                </div>
            </div>

            {/* CONFIG SECTION */}
            <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Aspect Ratio</label>
                        <div className="flex gap-2">
                            {ratios.map(r => (
                                <button key={r.id} onClick={() => setAspectRatio(r.id)} className={`flex-1 py-1.5 rounded border text-[10px] font-bold ${aspectRatio === r.id ? 'bg-white text-black' : 'border-white/10 text-slate-500'}`}>{r.label}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Resolution</label>
                        <div className="flex gap-2">
                            {['1K', '2K', '4K'].map(r => (
                                <button key={r} onClick={() => setResolution(r as any)} className={`flex-1 py-1.5 rounded border text-[10px] font-bold ${resolution === r ? 'bg-audi-purple text-white border-audi-purple' : 'border-white/10 text-slate-500'}`}>{r}</button>
                            ))}
                        </div>
                    </div>
                    
                    {/* NEW: CLOUD REF TOGGLE */}
                    <div className="col-span-2 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Chế độ xử lý</label>
                        <div 
                            onClick={() => setUseCloudRef(!useCloudRef)}
                            className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all ${useCloudRef ? 'bg-audi-cyan/10 border-audi-cyan shadow-[0_0_10px_rgba(33,212,253,0.1)]' : 'bg-white/5 border-white/10'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${useCloudRef ? 'bg-audi-cyan text-black' : 'bg-white/10 text-slate-500'}`}>
                                    <Icons.Cloud className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className={`text-xs font-bold ${useCloudRef ? 'text-audi-cyan' : 'text-slate-400'}`}>HQ Cloud Link (R2/File API)</div>
                                    <div className="text-[9px] text-slate-500">Giữ nguyên chất lượng ảnh gốc, không nén Base64.</div>
                                </div>
                            </div>
                            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${useCloudRef ? 'bg-audi-cyan' : 'bg-slate-700'}`}>
                                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${useCloudRef ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        {/* FOOTER */}
        <div className="fixed bottom-24 left-4 right-4 md:left-[50%] md:-translate-x-1/2 md:w-[900px] p-4 bg-[#090014]/90 backdrop-blur-md border border-white/10 rounded-2xl z-50 shadow-2xl flex items-center justify-between">
            <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Total Cost</span>
                <span className="text-xl font-black text-white">{calculateCost()} <span className="text-audi-yellow text-sm">VCOIN</span></span>
            </div>
            <button 
                onClick={handleGenerate}
                disabled={isSuggesting}
                className="px-8 py-3 bg-gradient-to-r from-audi-pink to-audi-purple rounded-xl font-bold text-white shadow-[0_0_20px_rgba(255,0,153,0.4)] hover:scale-105 transition-all flex items-center gap-2"
            >
                <Icons.Wand className="w-5 h-5" />
                <span>{lang === 'vi' ? 'RENDER 3D' : 'GENERATE'}</span>
            </button>
        </div>
    </div>
  );
};
