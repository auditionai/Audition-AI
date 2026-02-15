
import React, { useState, useRef, useEffect } from 'react';
import { Feature, Language, GeneratedImage } from '../../types';
import { Icons } from '../../components/Icons';
import { generateImage } from '../../services/geminiService';
import { saveImageToStorage } from '../../services/storageService';
import { createSolidFence, optimizePayload, urlToBase64 } from '../../utils/imageProcessor';
import { getUserProfile, updateUserBalance } from '../../services/economyService';
import { useNotification } from '../../components/NotificationSystem';
import { caulenhauClient } from '../../services/supabaseClient';

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
  isFaceLocked: boolean; // New: Toggle for Face Swap
}

// --- SMART TIPS DATA ---
const SMART_TIPS = [
    { icon: Icons.Sparkles, text: "✨ Mẹo: Để ảnh đẹp nhất, hãy tải lên ảnh nhân vật đã tách nền (PNG trong suốt)." },
    { icon: Icons.Zap, text: "⚡ Tip: Để khuôn mặt sắc nét, hãy dùng ảnh chụp cận mặt từ Patch hoặc đã qua làm nét (Remini)." },
    { icon: Icons.Crown, text: "👑 Lưu ý: Model Pro tốn nhiều Vcoin hơn nhưng độ chi tiết trang phục gấp đôi Flash." },
    { icon: Icons.Palette, text: "🎨 Mẹo: Nhập mô tả màu sắc trang phục cụ thể (ví dụ: váy đỏ, giày trắng) để AI vẽ đúng ý." },
    { icon: Icons.Unlock, text: "🔓 Tip: Tắt 'Khóa Mặt' nếu bạn muốn AI tự sáng tạo khuôn mặt mới ngẫu nhiên." },
    { icon: Icons.Image, text: "📸 Mẹo: Ảnh mẫu (Ref) nên có góc chụp tương đồng với ý tưởng bạn muốn tạo." },
    { icon: Icons.MessageCircle, text: "✍️ Tip: Bí ý tưởng? Dùng nút 'Sử dụng Prompt Mẫu' để lấy ý tưởng từ cộng đồng." },
    { icon: Icons.Monitor, text: "🖥️ Lưu ý: Độ phân giải 4K rất nét, thích hợp in ấn nhưng sẽ tốn thời gian xử lý hơn." }
];

// --- TUTORIAL VIDEO ID (Youtube) ---
const TUTORIAL_VIDEO_ID = "ba2WR8txe_c"; 

interface SamplePrompt {
    id: string;
    image_url: string;
    prompt: string;
    category?: string;
}

export const GenerationTool: React.FC<GenerationToolProps> = ({ feature, lang }) => {
  const { notify } = useNotification();
  const [stage, setStage] = useState<Stage>('input');
  const [progressMsg, setProgressMsg] = useState('');
  const [progressLogs, setProgressLogs] = useState<string[]>([]);

  const [activeMode, setActiveMode] = useState<GenMode>('single');
  const [characters, setCharacters] = useState<CharacterInput[]>([{ id: 1, bodyImage: null, faceImage: null, gender: 'female', isFaceLocked: true }]);
  const [activeCharTab, setActiveCharTab] = useState<number>(1); // Mobile Tab State
  
  const [refImage, setRefImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('crowd, extra people, audience, bystanders, deformed, bad anatomy, disfigured, poorly drawn face, mutation, mutated, extra limb, ugly, disgusting, poorly drawn hands, missing limb, floating limbs, disconnected limbs, malformed hands, blur, out of focus, long neck, long body, mutated hands and fingers, out of frame, blender, doll, cropped, low-res, close-up, poorly-drawn face, out of frame double, two heads, blurred, ugly, disfigured, too many fingers, deformed, repetitive, black and white, grainy, extra limbs, bad anatomy, duplicate, photorealistic, realistic photo, sketch, cartoon, drawing, art, 2d');
  
  // Sample Prompt Modal
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [samplePrompts, setSamplePrompts] = useState<SamplePrompt[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);

  // --- SETTINGS RESTORED ---
  const [modelType, setModelType] = useState<'flash' | 'pro'>('pro'); 
  const [aspectRatio, setAspectRatio] = useState('3:4'); 
  const [selectedStyle, setSelectedStyle] = useState('3d');
  const [resolution, setResolution] = useState<Resolution>('2K'); 
  const [useSearch, setUseSearch] = useState(false); 
  const [useCloudRef, setUseCloudRef] = useState(true);

  // --- GUIDE & TIPS STATE ---
  const [guideTopic, setGuideTopic] = useState<'chars' | 'settings' | null>(null);
  const [currentTipIdx, setCurrentTipIdx] = useState(0);
  const [showVideo, setShowVideo] = useState(false);

  const [resultImage, setResultImage] = useState<string | null>(null);
  const [generatedData, setGeneratedData] = useState<GeneratedImage | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadType = useRef<{ charId?: number, type: 'body' | 'face' | 'ref' } | null>(null);

  // Rotate Tips Effect
  useEffect(() => {
      const interval = setInterval(() => {
          setCurrentTipIdx(prev => (prev + 1) % SMART_TIPS.length);
      }, 5000); // 5 seconds rotation
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (feature.id.includes('couple')) handleModeChange('couple');
    else if (feature.id.includes('group_3')) handleModeChange('group3');
    else if (feature.id.includes('group_4')) handleModeChange('group4');
    else handleModeChange('single');
  }, [feature]);

  const handleModeChange = (mode: GenMode) => {
      setActiveMode(mode);
      setActiveCharTab(1); // Reset to first tab
      let count = 1;
      if (mode === 'couple') count = 2;
      if (mode === 'group3') count = 3;
      if (mode === 'group4') count = 4;

      setCharacters(prev => {
          const newChars = [];
          for (let i = 1; i <= count; i++) {
              const existing = prev.find(p => p.id === i);
              newChars.push(existing || { id: i, bodyImage: null, faceImage: null, gender: i % 2 === 0 ? 'male' : 'female', isFaceLocked: true });
          }
          return newChars;
      });
  };

  const fetchSamplePrompts = async () => {
      if (!caulenhauClient) {
          notify("Chưa kết nối database mẫu. Vui lòng kiểm tra cấu hình.", "error");
          return;
      }
      setLoadingSamples(true);
      
      try {
          // Changed table 'prompts' to 'images' based on your database screenshot
          // Assuming 'image_url' contains the link and 'prompt' contains text
          let query = caulenhauClient
              .from('images')
              .select('id, image_url, prompt')
              .order('created_at', { ascending: false })
              .limit(50);
          
          const { data, error } = await query;

          if (error) {
              console.error("Supabase Error:", error);
              throw error;
          }
          
          if (data) {
              setSamplePrompts(data.map((item: any) => ({
                  id: item.id,
                  image_url: item.image_url,
                  prompt: item.prompt,
                  category: 'general'
              })));
          }
      } catch (e: any) {
          console.error("Fetch samples error", e);
          notify(`Lỗi tải dữ liệu: ${e.message}`, 'error');
          setSamplePrompts([]);
      } finally {
          setLoadingSamples(false);
      }
  };

  const handleOpenSamples = () => {
      setShowSampleModal(true);
      fetchSamplePrompts();
  };

  const handleSelectSample = (sample: SamplePrompt) => {
      if (sample.prompt) {
          setPrompt(sample.prompt);
          setShowSampleModal(false);
          notify("Đã áp dụng Prompt mẫu!", "success");
      } else {
          notify("Mẫu này không có prompt.", "warning");
      }
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
                      if (currentType.type === 'body') return { ...c, bodyImage: result };
                      if (currentType.type === 'face') return { ...c, faceImage: result, isFaceLocked: true }; // Auto lock on new upload
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

  const toggleFaceLock = (charId: number) => {
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, isFaceLocked: !c.isFaceLocked } : c));
  }

  const calculateCost = () => {
      let cost = modelType === 'pro' ? 2 : 1;
      if (modelType === 'pro') {
          if (resolution === '1K') cost += 2;
          if (resolution === '2K') cost += 5;
          if (resolution === '4K') cost += 10;
          if (useSearch) cost += 3; 
          if (useCloudRef) cost += 2;
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
    
    setStage('processing');
    setProgressLogs([]);
    addLog(lang === 'vi' ? 'Đang khởi tạo...' : 'Initializing...');

    try {
      await new Promise(r => setTimeout(r, 500));
      await updateUserBalance(-cost, `Gen: ${feature.name['en']}`, 'usage');
      
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
              faceImage: char.isFaceLocked ? char.faceImage : null, // Respect Lock State
              shoesImage: null // Removed per user request
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
          useCloudRef, 
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

  const styles = [
      { id: '3d', name: '3D Game', icon: Icons.MessageCircle }, 
      { id: 'blindbox', name: 'Blind Box', icon: Icons.Gift },
      { id: 'anime', name: 'Anime 3D', icon: Icons.Zap },
      { id: 'cinematic', name: 'Cinematic', icon: Icons.Play },
      { id: 'fashion', name: 'Fashion', icon: Icons.ShoppingBag },
  ];

  const ratios = [
      { id: '1:1', label: '1:1', desc: 'Vuông' },
      { id: '9:16', label: '9:16', desc: 'Story' },
      { id: '16:9', label: '16:9', desc: 'Cinema' },
      { id: '3:4', label: '3:4', desc: 'Dọc' },
      { id: '4:3', label: '4:3', desc: 'Ngang' },
  ];

  // --- GUIDE CONTENT RENDERER ---
  const renderGuideContent = () => {
      switch(guideTopic) {
          case 'chars':
              return (
                  <>
                      <h3 className="text-xl font-bold text-audi-yellow mb-4 flex items-center gap-2">
                          <Icons.User className="w-6 h-6" /> Hướng dẫn Upload Nhân vật
                      </h3>
                      <ul className="space-y-3 text-sm text-slate-300">
                          <li className="flex gap-2">
                              <span className="text-audi-cyan font-bold">1. Ảnh Toàn Thân (Body):</span>
                              Dùng để AI học trang phục, dáng đứng và cấu trúc cơ thể. Nên dùng ảnh rõ ràng, ít chi tiết thừa.
                          </li>
                          <li className="flex gap-2">
                              <span className="text-audi-pink font-bold">2. Ảnh Mặt (Face):</span>
                              <span className="bg-red-500/20 text-red-400 px-1 rounded text-xs font-bold h-fit mt-0.5">QUAN TRỌNG</span>
                              Dùng để ghép mặt (Face Swap). Hãy chọn ảnh cận mặt, chính diện, rõ nét, không bị che khuất.
                          </li>
                          <li className="flex gap-2">
                              <span className="text-white font-bold">3. Khóa/Mở Khóa:</span>
                              Nút <Icons.Lock className="w-3 h-3 inline text-audi-cyan"/> dùng để BẬT tính năng ghép mặt. Nếu TẮT <Icons.Unlock className="w-3 h-3 inline text-red-500"/>, AI sẽ tự sáng tạo khuôn mặt mới.
                          </li>
                      </ul>
                  </>
              );
          case 'settings':
              return (
                  <>
                      <h3 className="text-xl font-bold text-audi-yellow mb-4 flex items-center gap-2">
                          <Icons.Settings className="w-6 h-6" /> Cấu hình Nâng cao
                      </h3>
                      <ul className="space-y-3 text-sm text-slate-300">
                          <li className="flex gap-2">
                              <span className="text-audi-cyan font-bold">Model Flash vs Pro:</span>
                              <br/>- <b className="text-white">Flash:</b> Nhanh, rẻ, phù hợp thử nghiệm.
                              <br/>- <b className="text-white">Pro:</b> Chất lượng cao nhất, chi tiết tốt hơn, hiểu lệnh tốt hơn (Khuyên dùng).
                          </li>
                          <li className="flex gap-2">
                              <span className="text-audi-pink font-bold">HQ Cloud Link:</span>
                              Khi BẬT, ảnh gốc của bạn sẽ được gửi lên Cloud để AI phân tích kỹ hơn &rarr; Kết quả giống thật hơn 30%. (Tốn thêm Vcoin).
                          </li>
                          <li className="flex gap-2">
                              <span className="text-white font-bold">Độ phân giải:</span>
                              2K là chuẩn đẹp nhất. 4K dành cho in ấn hoặc màn hình lớn (tốn nhiều Vcoin hơn).
                          </li>
                      </ul>
                  </>
              );
          default: return null;
      }
  }

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
                  {lang === 'vi' ? 'AI ĐANG VẼ...' : 'GENERATING...'}
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
                              <Icons.Download className="w-4 h-4" /> Tải Về
                          </a>
                          <button onClick={() => setStage('input')} className="flex-1 px-4 py-2.5 bg-audi-pink text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-pink-600 transition-colors shadow-[0_0_15px_#FF0099] text-sm">
                              <Icons.Wand className="w-4 h-4" /> Tạo Tiếp
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  const TipIcon = SMART_TIPS[currentTipIdx].icon;

  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto pb-48 animate-fade-in relative">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

        {/* --- VIDEO TUTORIAL MODAL --- */}
        {showVideo && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-fade-in" onClick={() => setShowVideo(false)}>
                <div className="relative w-full max-w-2xl aspect-video bg-black rounded-2xl overflow-hidden border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.1)]" onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={() => setShowVideo(false)} 
                        className="absolute -top-10 right-0 md:top-4 md:right-4 bg-white/10 hover:bg-red-600 text-white p-2 rounded-full transition-colors z-50 backdrop-blur-md"
                    >
                        <Icons.X className="w-6 h-6" />
                    </button>
                    <iframe 
                        className="w-full h-full"
                        src={`https://www.youtube.com/embed/${TUTORIAL_VIDEO_ID}?autoplay=1`}
                        title="Hướng dẫn sử dụng"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    ></iframe>
                </div>
            </div>
        )}

        {/* --- GUIDE MODAL (UPDATED BG) --- */}
        {guideTopic && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-fade-in" onClick={() => setGuideTopic(null)}>
                <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-audi-yellow/50 shadow-[0_0_30px_rgba(251,218,97,0.2)] relative" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setGuideTopic(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                        <Icons.X className="w-6 h-6" />
                    </button>
                    {renderGuideContent()}
                    <div className="mt-6 pt-4 border-t border-white/10 text-center">
                        <button onClick={() => setGuideTopic(null)} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold text-white transition-colors">
                            Đã Hiểu
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- SAMPLE PROMPTS MODAL (CAULENHAU) --- */}
        {showSampleModal && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-fade-in" onClick={() => setShowSampleModal(false)}>
                {/* Updated Size: max-w-xl (was 2xl) and h-[500px] (was 60vh) for tighter fit */}
                <div className="bg-[#12121a] w-full max-w-xl h-[500px] rounded-[2rem] border border-audi-purple/50 shadow-[0_0_50px_rgba(183,33,255,0.2)] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
                        <div className="flex items-center gap-2">
                            <Icons.Image className="w-5 h-5 text-audi-purple" />
                            <h3 className="font-bold text-white text-lg">Thư viện Prompt Mẫu</h3>
                            <span className="text-xs bg-audi-purple/20 text-audi-purple px-2 py-0.5 rounded border border-audi-purple/30">
                                Mode: {activeMode.toUpperCase()}
                            </span>
                        </div>
                        <button onClick={() => setShowSampleModal(false)} className="p-2 hover:bg-white/10 rounded-full text-white">
                            <Icons.X className="w-6 h-6" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-black/10">
                        {loadingSamples ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4">
                                <Icons.Loader className="w-10 h-10 text-audi-purple animate-spin" />
                                <span className="text-slate-400 text-sm">Đang tải dữ liệu từ caulenhau.io.vn...</span>
                            </div>
                        ) : samplePrompts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                                <div className="p-4 bg-white/5 rounded-full">
                                    <Icons.Image className="w-12 h-12 opacity-30" />
                                </div>
                                <p>Chưa có mẫu nào cho chế độ này.</p>
                                <button 
                                    onClick={fetchSamplePrompts}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-full text-xs font-bold text-white transition-colors"
                                >
                                    Thử lại
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {samplePrompts.map((sample) => (
                                    <div 
                                        key={sample.id} 
                                        onClick={() => handleSelectSample(sample)}
                                        className="group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border border-white/10 hover:border-audi-purple transition-all hover:scale-[1.02]"
                                    >
                                        <img src={sample.image_url} alt="Sample" className="w-full h-full object-cover" loading="lazy" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                                            <span className="text-xs font-bold text-white text-center bg-audi-purple px-3 py-1 rounded-full shadow-lg">
                                                Sử dụng
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="p-3 border-t border-white/10 bg-black/20 text-center text-[10px] text-slate-500">
                        Dữ liệu được cung cấp bởi caulenhau.io.vn
                    </div>
                </div>
            </div>
        )}

        {/* Mode Selector */}
        <div className="w-full flex justify-center mb-4">
            <div className="bg-[#12121a] p-1.5 rounded-2xl border border-white/10 flex gap-1 shadow-lg overflow-x-auto no-scrollbar max-w-full">
                {[
                    { id: 'single', label: { vi: 'Đơn', en: 'Single' }, icon: Icons.User },
                    { id: 'couple', label: { vi: 'Đôi', en: 'Couple' }, icon: Icons.Heart },
                    { id: 'group3', label: { vi: 'Nhóm 3', en: 'Group 3' }, icon: Icons.User },
                    { id: 'group4', label: { vi: 'Nhóm 4', en: 'Group 4' }, icon: Icons.User },
                ].map(mode => (
                    <button
                        key={mode.id}
                        onClick={() => handleModeChange(mode.id as GenMode)}
                        className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs md:text-sm font-bold transition-all whitespace-nowrap ${activeMode === mode.id ? 'bg-white text-black shadow-md' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                    >
                        {mode.id === 'group4' ? <div className="flex -space-x-1"><Icons.User className="w-3 h-3"/><Icons.User className="w-3 h-3"/></div> : <mode.icon className="w-3 h-3 md:w-4 md:h-4" />}
                        {mode.label[lang === 'vi' ? 'vi' : 'en']}
                    </button>
                ))}
            </div>
        </div>

        {/* --- SMART TIPS BANNER --- */}
        <div className="w-full bg-gradient-to-r from-orange-500/10 via-yellow-500/10 to-orange-500/10 border-y border-white/5 md:border md:rounded-xl md:mb-6 p-2 md:p-3 flex items-center justify-center gap-3 backdrop-blur-md overflow-hidden relative min-h-[40px]">
            <div key={currentTipIdx} className="flex items-center gap-2 animate-fade-in transition-all duration-500">
                <TipIcon className="w-4 h-4 md:w-5 md:h-5 text-audi-yellow shrink-0 animate-bounce-slow" />
                <span className="text-[10px] md:text-xs font-medium text-slate-200 line-clamp-2 md:line-clamp-1 text-center md:text-left">
                    {SMART_TIPS[currentTipIdx].text}
                </span>
            </div>
            {/* Progress Dots */}
            <div className="absolute bottom-1 md:right-3 flex gap-1 justify-center w-full md:w-auto">
                {SMART_TIPS.map((_, i) => (
                    <div key={i} className={`w-1 h-1 rounded-full transition-all ${i === currentTipIdx ? 'bg-audi-yellow w-3' : 'bg-white/10'}`}></div>
                ))}
            </div>
        </div>

        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 md:mt-0">
            
            {/* LEFT: CHARACTER INPUT SECTION */}
            <div className="lg:col-span-2 space-y-4">
                
                {/* Header with Help & Video Button */}
                <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-white text-sm uppercase flex items-center gap-2">
                        <Icons.User className="w-4 h-4 text-audi-pink" /> 1. Upload Nhân Vật
                    </h3>
                    <div className="flex gap-2">
                        {/* Video Button */}
                        <button 
                            onClick={() => setShowVideo(true)}
                            className="flex items-center gap-1 text-[10px] font-bold text-white hover:scale-105 transition-transform bg-red-600 px-3 py-1 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)] border border-red-400 group"
                        >
                            <Icons.Play className="w-3 h-3 fill-white group-hover:animate-pulse" />
                            Video HD
                        </button>
                        {/* Guide Button */}
                        <button 
                            onClick={() => setGuideTopic('chars')}
                            className="flex items-center gap-1 text-[10px] font-bold text-audi-yellow hover:text-white transition-colors bg-audi-yellow/10 px-2 py-1 rounded-full border border-audi-yellow/30"
                        >
                            <Icons.Info className="w-3 h-3" /> Hướng dẫn
                        </button>
                    </div>
                </div>

                {/* Mobile Tab Navigation */}
                {characters.length > 1 && (
                    <div className="flex md:hidden overflow-x-auto gap-2 pb-2 no-scrollbar">
                        {characters.map((char) => (
                            <button
                                key={char.id}
                                onClick={() => setActiveCharTab(char.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                                    activeCharTab === char.id 
                                    ? 'bg-audi-pink text-white border-audi-pink shadow-lg' 
                                    : 'bg-[#12121a] text-slate-400 border-white/10 hover:border-white/30'
                                }`}
                            >
                                {lang === 'vi' ? `Nhân vật ${char.id}` : `Char ${char.id}`}
                                {char.bodyImage && <span className="ml-1 text-green-400">✓</span>}
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex flex-wrap justify-center gap-4 w-full">
                    {characters.map((char) => (
                        <div 
                            key={char.id} 
                            // Mobile Logic: Only show the active tab. Desktop Logic: Show all (md:block).
                            className={`w-full md:w-[220px] bg-[#12121a] border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-colors relative group shrink-0 shadow-lg ${
                                char.id === activeCharTab ? 'block' : 'hidden md:block'
                            }`}
                        >
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-xs font-bold text-white bg-white/10 px-2 py-1 rounded">NV {char.id}</span>
                                <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
                                    <button onClick={() => toggleGender(char.id, 'female')} className={`px-2 py-0.5 rounded text-[9px] font-bold ${char.gender === 'female' ? 'bg-audi-pink text-white' : 'text-slate-500'}`}>Nữ</button>
                                    <button onClick={() => toggleGender(char.id, 'male')} className={`px-2 py-0.5 rounded text-[9px] font-bold ${char.gender === 'male' ? 'bg-blue-500 text-white' : 'text-slate-500'}`}>Nam</button>
                                </div>
                            </div>
                            
                            {/* UPDATED: EQUAL SIZE BOXES + LOCK TOGGLE */}
                            <div className="space-y-3">
                                {/* BODY SLOT (Main Image) */}
                                <div onClick={() => handleUploadClick(char.id, 'body')} className="w-full h-40 bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-pink cursor-pointer relative overflow-hidden group/item transition-all flex flex-col items-center justify-center">
                                    {char.bodyImage ? (
                                        <img src={char.bodyImage} className="w-full h-full object-contain" alt="Body" />
                                    ) : (
                                        <div className="flex flex-col items-center text-slate-500 group-hover/item:text-audi-pink transition-colors">
                                            <Icons.User className="w-8 h-8 mb-1" />
                                            <span className="text-[10px] uppercase font-bold">Ảnh Toàn Thân</span>
                                        </div>
                                    )}
                                </div>

                                {/* FACE SLOT (Equal Size) + LOCK BUTTON */}
                                <div onClick={() => handleUploadClick(char.id, 'face')} className="w-full h-40 bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-cyan cursor-pointer relative overflow-hidden group/item transition-all flex flex-col items-center justify-center">
                                    {char.faceImage ? (
                                        <>
                                            <img src={char.faceImage} className={`w-full h-full object-cover transition-all ${char.isFaceLocked ? '' : 'grayscale opacity-50'}`} alt="Face" />
                                            
                                            {/* LOCK TOGGLE OVERLAY */}
                                            <div 
                                                onClick={(e) => { e.stopPropagation(); toggleFaceLock(char.id); }}
                                                className={`absolute bottom-2 right-2 px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 shadow-xl transition-all cursor-pointer z-10 border ${char.isFaceLocked ? 'bg-audi-cyan text-black border-white' : 'bg-red-500/90 text-white border-red-400'}`}
                                            >
                                                {char.isFaceLocked ? <Icons.Lock className="w-3 h-3" /> : <Icons.Unlock className="w-3 h-3" />}
                                                {char.isFaceLocked ? (lang === 'vi' ? 'Đã Khóa' : 'Locked') : (lang === 'vi' ? 'Không dùng' : 'Unlocked')}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center text-slate-500 group-hover/item:text-audi-cyan transition-colors">
                                            <Icons.Eye className="w-8 h-8 mb-1" />
                                            <span className="text-[10px] uppercase font-bold">Ảnh Mặt (Tùy chọn)</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* PROMPT BOX & REF IMAGE */}
                <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 shadow-lg">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                            <Icons.MessageCircle className="w-4 h-4" /> 2. Mô tả & Ảnh mẫu
                        </label>
                        <div className="flex gap-2">
                            {/* UPDATED BUTTON: SAMPLE PROMPTS */}
                            <button 
                                onClick={handleOpenSamples}
                                className="text-[10px] font-bold text-audi-yellow hover:text-white flex items-center gap-1 bg-audi-yellow/10 px-3 py-1.5 rounded-full border border-audi-yellow/30 animate-pulse transition-all hover:bg-audi-yellow/20"
                            >
                                <Icons.Image className="w-3 h-3" /> Sử dụng Prompt Mẫu
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* REF IMAGE UPLOAD */}
                        <div 
                            onClick={handleRefUploadClick}
                            className="w-full md:w-32 aspect-[3/4] md:aspect-square bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-purple cursor-pointer relative overflow-hidden group shrink-0 flex items-center justify-center transition-all"
                        >
                            {refImage ? (
                                <>
                                    <img src={refImage} className="w-full h-full object-cover opacity-80" alt="Ref" />
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Icons.X className="w-6 h-6 text-white" onClick={(e) => { e.stopPropagation(); setRefImage(null); }} />
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center text-slate-500 p-2 text-center">
                                    <Icons.Image className="w-6 h-6 mb-1" />
                                    <span className="text-[9px] font-bold uppercase leading-tight">Ảnh mẫu<br/>(Pose)</span>
                                </div>
                            )}
                        </div>

                        {/* TEXT AREA */}
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={lang === 'vi' ? "Mô tả chi tiết: trang phục, bối cảnh, ánh sáng..." : "Detailed prompt: clothes, scene, lighting..."}
                            className="flex-1 bg-black/20 border border-white/5 rounded-xl p-3 text-sm text-white focus:border-audi-purple outline-none resize-none min-h-[100px]"
                        />
                    </div>
                </div>
            </div>

            {/* RIGHT: SETTINGS PANEL */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-[#12121a] border border-white/10 rounded-2xl p-5 space-y-5 shadow-lg h-full">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Icons.Settings className="w-5 h-5 text-slate-400" />
                            3. Cấu Hình
                        </h3>
                        <button 
                            onClick={() => setGuideTopic('settings')}
                            className="text-audi-yellow hover:text-white transition-colors animate-pulse"
                        >
                            <Icons.Info className="w-4 h-4" />
                        </button>
                    </div>

                    {/* MODEL SELECTION */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Chất lượng AI (Model)</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => setModelType('flash')}
                                className={`p-3 rounded-xl border text-left transition-all ${modelType === 'flash' ? 'bg-white/10 border-white text-white' : 'border-white/10 text-slate-500 hover:border-white/30'}`}
                            >
                                <div className="font-bold text-xs">Flash (Tiết kiệm)</div>
                                <div className="text-[9px] opacity-70">Tốc độ cao</div>
                            </button>
                            <button 
                                onClick={() => setModelType('pro')}
                                className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${modelType === 'pro' ? 'bg-audi-purple/20 border-audi-purple text-white shadow-[0_0_10px_rgba(183,33,255,0.2)]' : 'border-white/10 text-slate-500 hover:border-white/30'}`}
                            >
                                <div className="font-bold text-xs flex items-center gap-1">Pro (Cao cấp) <Icons.Crown className="w-3 h-3 text-audi-yellow"/></div>
                                <div className="text-[9px] opacity-70">Chi tiết 4K</div>
                            </button>
                        </div>
                    </div>

                    {/* RATIO */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Tỉ lệ khung hình</label>
                        <div className="flex flex-wrap gap-2">
                            {ratios.map(r => (
                                <button 
                                    key={r.id} 
                                    onClick={() => setAspectRatio(r.id)} 
                                    className={`flex-1 min-w-[50px] py-2 rounded-lg border text-[10px] font-bold transition-all ${aspectRatio === r.id ? 'bg-white text-black border-white' : 'border-white/10 text-slate-500 hover:bg-white/5'}`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* STYLES */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Phong cách (Style)</label>
                        <div className="grid grid-cols-2 gap-2">
                            {styles.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => setSelectedStyle(s.id)}
                                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-bold transition-all ${selectedStyle === s.id ? 'bg-audi-pink text-white border-audi-pink' : 'border-white/10 text-slate-500 hover:bg-white/5'}`}
                                >
                                    <s.icon className="w-3 h-3" /> {s.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* RESOLUTION */}
                    {modelType === 'pro' && (
                        <div className="space-y-2 animate-fade-in">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Độ phân giải</label>
                            <div className="flex gap-2 bg-black/30 p-1 rounded-lg">
                                {['1K', '2K', '4K'].map(r => (
                                    <button 
                                        key={r} 
                                        onClick={() => setResolution(r as any)} 
                                        className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all ${resolution === r ? 'bg-audi-purple text-white shadow' : 'text-slate-500 hover:text-white'}`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ADVANCED TOGGLES */}
                    <div className="pt-2 border-t border-white/10 space-y-2">
                        <div 
                            onClick={() => setUseCloudRef(!useCloudRef)}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${useCloudRef ? 'bg-audi-cyan/10' : 'hover:bg-white/5'}`}
                        >
                            <span className={`text-xs font-bold ${useCloudRef ? 'text-audi-cyan' : 'text-slate-400'}`}>HQ Cloud Link (R2)</span>
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
                <span className="text-[10px] text-slate-400 font-bold uppercase">Chi phí ước tính</span>
                <span className="text-xl font-black text-white">{calculateCost()} <span className="text-audi-yellow text-sm">VCOIN</span></span>
            </div>
            <button 
                onClick={handleGenerate}
                className="px-8 py-3 bg-gradient-to-r from-audi-pink to-audi-purple rounded-xl font-bold text-white shadow-[0_0_20px_rgba(255,0,153,0.4)] hover:scale-105 transition-all flex items-center gap-2"
            >
                <Icons.Wand className="w-5 h-5" />
                <span>{lang === 'vi' ? 'TẠO ẢNH NGAY' : 'GENERATE'}</span>
            </button>
        </div>
    </div>
  );
};
