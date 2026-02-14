
import React, { useState, useRef, useEffect } from 'react';
import { Feature, Language, GeneratedImage } from '../../types';
import { Icons } from '../../components/Icons';
import { editImageWithInstructions } from '../../services/geminiService';
import { saveImageToStorage } from '../../services/storageService';
import { getUserProfile, updateUserBalance } from '../../services/economyService';
import { useNotification } from '../../components/NotificationSystem';

interface EditingToolProps {
  feature: Feature;
  lang: Language;
}

type UpscaleLevel = '2K' | '4K';
type UpscaleMode = 'general' | 'portrait';
type BgMode = 'white' | 'green' | 'mask';

export const EditingTool: React.FC<EditingToolProps> = ({ feature, lang }) => {
  const { notify } = useNotification();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  
  // Specific States
  const isUpscaler = feature.id === 'sharpen_upscale';
  const isRemover = feature.id === 'remove_bg_pro';
  
  const [upscaleLevel, setUpscaleLevel] = useState<UpscaleLevel>('2K');
  const [upscaleMode, setUpscaleMode] = useState<UpscaleMode>('general');
  const [bgMode, setBgMode] = useState<BgMode>('white');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when feature changes
  useEffect(() => {
      setResultImage(null);
      setUploadedImage(null);
      setPrompt('');
  }, [feature.id]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
          setUploadedImage(reader.result as string);
          setResultImage(null); // Clear previous result
      };
      reader.readAsDataURL(file);
    }
    // Reset value to allow re-uploading same file
    e.target.value = '';
  };

  const constructPrompt = () => {
      // 1. Manual Prompt Mode (Generic Tools)
      if (!isUpscaler && !isRemover) {
          let instruction = feature.defaultPrompt || "";
          if (prompt) instruction += " " + prompt;
          return instruction;
      }

      // 2. Upscaler Logic
      if (isUpscaler) {
          let base = `Upscale this image to ${upscaleLevel} resolution. Sharpen details, denoise, improve clarity.`;
          if (upscaleMode === 'portrait') {
              base += ` FOCUS: Enhance facial details, eyes, skin texture. Keep it realistic.`;
          } else {
              base += ` FOCUS: General texture enhancement, clean edges.`;
          }
          return base;
      }

      // 3. Background Remover Logic
      if (isRemover) {
          if (bgMode === 'white') return "Remove the background completely. Place the subject on a pure WHITE background. Clean edges.";
          if (bgMode === 'green') return "Remove the background. Place the subject on a pure GREEN screen (#00FF00) background.";
          if (bgMode === 'mask') return "Generate a black and white silhouette mask. Subject is white, background is black.";
      }

      return feature.defaultPrompt || "";
  };

  const handleExecute = async () => {
     if (!uploadedImage) {
         notify(lang === 'vi' ? 'Vui lòng tải ảnh lên' : 'Please upload an image', 'warning');
         return;
     }

     const cost = isUpscaler ? 2 : 1; 
     const user = await getUserProfile();
     
     if ((user.balance || 0) < cost) {
         notify(lang === 'vi' ? `Số dư không đủ (Cần ${cost} Vcoin)` : `Insufficient balance (Need ${cost} Vcoin)`, 'error');
         return;
     }

     setLoading(true);
     setResultImage(null);

     try {
         // Deduct cost and log usage
         await updateUserBalance(-cost, `Edit: ${feature.name['en']}`, 'usage');

         const instruction = constructPrompt();
         
         const base64Data = uploadedImage.split(',')[1];
         const mimeType = uploadedImage.substring(uploadedImage.indexOf(':') + 1, uploadedImage.indexOf(';'));

         const result = await editImageWithInstructions(base64Data, instruction, mimeType);

         if (result) {
            setResultImage(result);
            const newImage: GeneratedImage = {
                id: crypto.randomUUID(),
                url: result,
                prompt: instruction,
                timestamp: Date.now(),
                toolId: feature.id,
                toolName: feature.name['en'],
                engine: feature.engine
            };
            await saveImageToStorage(newImage);
            notify(lang === 'vi' ? 'Xử lý thành công!' : 'Processing successful!', 'success');
         } else {
             throw new Error("Processing failed");
         }
     } catch (error) {
         console.error(error);
         // Refund on fail
         await updateUserBalance(cost, `Refund: ${feature.name['en']} Failed`, 'refund');
         notify(lang === 'vi' ? 'Xử lý thất bại' : 'Processing failed', 'error');
     } finally {
         setLoading(false);
     }
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full">
      <div className="w-full md:w-1/3 flex flex-col gap-6">
          <div className={`glass-panel p-6 rounded-3xl border-l-4 ${isUpscaler ? 'border-audi-cyan' : isRemover ? 'border-audi-pink' : 'border-purple-500'}`}>
             <h2 className={`text-xl font-bold mb-1 text-slate-800 dark:text-white flex items-center gap-2`}>
                 {isUpscaler ? <Icons.Zap className="w-5 h-5 text-audi-cyan" /> : isRemover ? <Icons.Scissors className="w-5 h-5 text-audi-pink" /> : <Icons.Wand className="w-5 h-5 text-purple-500" />}
                 {feature.name[lang]}
             </h2>
             <p className="text-sm text-slate-500 dark:text-slate-400">{feature.description[lang]}</p>
         </div>

         {/* Upload Area */}
         <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl h-48 flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative group
                ${uploadedImage 
                    ? (isUpscaler ? 'border-audi-cyan' : isRemover ? 'border-audi-pink' : 'border-purple-500') 
                    : 'border-slate-300 dark:border-slate-700 hover:border-white hover:bg-white/5'}`}
         >
             {uploadedImage ? (
                 <>
                    <img src={uploadedImage} alt="Source" className="w-full h-full object-contain p-2 opacity-80 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs font-bold text-white uppercase"><Icons.Upload className="w-6 h-6 mb-1 mx-auto"/>Đổi Ảnh</span>
                    </div>
                 </>
             ) : (
                 <div className="text-center p-4">
                     <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${isUpscaler ? 'bg-audi-cyan/20 text-audi-cyan' : 'bg-audi-pink/20 text-audi-pink'}`}>
                         <Icons.Upload className="w-6 h-6" />
                     </div>
                     <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{lang === 'vi' ? 'Tải ảnh gốc lên' : 'Upload Source Image'}</span>
                 </div>
             )}
             <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
         </div>

         {/* --- CONTROLS SECTION --- */}
         <div className="space-y-4">
             
             {/* 1. UPSCALER CONTROLS */}
             {isUpscaler && (
                 <div className="animate-fade-in space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                     <div>
                         <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Chất lượng (Resolution)</label>
                         <div className="flex gap-2">
                             {(['2K', '4K'] as UpscaleLevel[]).map(lvl => (
                                 <button
                                    key={lvl}
                                    onClick={() => setUpscaleLevel(lvl)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${upscaleLevel === lvl ? 'bg-audi-cyan text-black border-audi-cyan' : 'bg-transparent text-slate-400 border-slate-600 hover:border-white'}`}
                                 >
                                     {lvl} (Siêu nét)
                                 </button>
                             ))}
                         </div>
                     </div>
                     <div>
                         <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Chế độ xử lý</label>
                         <div className="flex gap-2">
                             <button onClick={() => setUpscaleMode('general')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${upscaleMode === 'general' ? 'bg-white text-black' : 'bg-transparent text-slate-400 border-slate-600'}`}>
                                 Cảnh vật
                             </button>
                             <button onClick={() => setUpscaleMode('portrait')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${upscaleMode === 'portrait' ? 'bg-audi-pink text-white border-audi-pink' : 'bg-transparent text-slate-400 border-slate-600'}`}>
                                 Chân dung (Face Fix)
                             </button>
                         </div>
                     </div>
                 </div>
             )}

             {/* 2. REMOVER CONTROLS */}
             {isRemover && (
                 <div className="animate-fade-in space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                     <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Tùy chọn nền (Output)</label>
                     <div className="grid grid-cols-1 gap-2">
                         <button onClick={() => setBgMode('white')} className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${bgMode === 'white' ? 'bg-white text-black border-white' : 'hover:bg-white/10 border-transparent'}`}>
                             <div className="w-4 h-4 rounded-full border border-slate-300 bg-white"></div>
                             <span className="text-xs font-bold">Nền Trắng (White)</span>
                         </button>
                         <button onClick={() => setBgMode('green')} className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${bgMode === 'green' ? 'bg-[#00FF00]/20 text-green-400 border-green-500' : 'hover:bg-white/10 border-transparent'}`}>
                             <div className="w-4 h-4 rounded-full border border-green-500 bg-[#00FF00]"></div>
                             <span className="text-xs font-bold">Phông Xanh (Green Screen)</span>
                         </button>
                         <button onClick={() => setBgMode('mask')} className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${bgMode === 'mask' ? 'bg-slate-700 text-white border-slate-500' : 'hover:bg-white/10 border-transparent'}`}>
                             <div className="w-4 h-4 rounded-full border border-white bg-gradient-to-r from-white to-black"></div>
                             <span className="text-xs font-bold">Tạo Mask (Đen/Trắng)</span>
                         </button>
                     </div>
                 </div>
             )}

             {/* 3. GENERIC PROMPT (Fallback) */}
             {!isUpscaler && !isRemover && (
                 <div className="space-y-2">
                     <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{lang === 'vi' ? 'Yêu cầu thêm' : 'Extra Instructions'}</label>
                     <input 
                        type="text" 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="w-full p-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:ring-2 focus:ring-purple-500 outline-none dark:text-white"
                        placeholder={lang === 'vi' ? 'Ví dụ: Làm sáng hơn...' : 'Ex: Make it brighter...'}
                     />
                 </div>
             )}
         </div>

         {/* COST & ACTION */}
         <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
             <span className="text-xs text-slate-400 font-bold uppercase">{lang === 'vi' ? 'Chi phí' : 'Cost'}</span>
             <span className="text-sm font-bold text-audi-yellow">{isUpscaler ? 2 : 1} Vcoin</span>
         </div>

         <button 
            onClick={handleExecute}
            disabled={loading || !uploadedImage}
            className={`w-full py-4 bg-gradient-to-r ${isUpscaler ? 'from-audi-cyan to-blue-500 shadow-audi-cyan/30' : isRemover ? 'from-audi-pink to-purple-600 shadow-audi-pink/30' : 'from-purple-500 to-pink-600'} text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02]`}
         >
             {loading ? <Icons.Loader className="animate-spin" /> : <Icons.Zap />}
             {loading ? (lang === 'vi' ? 'Đang xử lý...' : 'Processing...') : (lang === 'vi' ? 'BẮT ĐẦU NGAY' : 'EXECUTE')}
         </button>
      </div>

      {/* RESULT AREA */}
      <div className="flex-1 glass-panel rounded-3xl p-6 flex flex-col items-center justify-center bg-slate-100/50 dark:bg-black/20 min-h-[400px] relative">
          {loading ? (
               <div className="text-center animate-pulse">
                   <div className="relative w-20 h-20 mx-auto mb-6">
                       <div className={`absolute inset-0 rounded-full border-4 border-t-transparent animate-spin ${isUpscaler ? 'border-audi-cyan' : 'border-audi-pink'}`}></div>
                       <Icons.Sparkles className={`w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isUpscaler ? 'text-audi-cyan' : 'text-audi-pink'}`} />
                   </div>
                   <p className="text-white font-bold text-lg">{lang === 'vi' ? 'AI đang làm việc...' : 'AI is working...'}</p>
                   <p className="text-slate-500 text-sm mt-1">{isUpscaler ? 'Đang nâng cấp độ phân giải...' : 'Đang tách nền...'}</p>
               </div>
          ) : resultImage ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                   <div className="relative w-full h-full max-h-[60vh] flex items-center justify-center group select-none">
                       {/* Result Image */}
                       <img 
                            src={isComparing ? uploadedImage! : resultImage} 
                            alt="Result" 
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-white/10"
                            onMouseDown={() => setIsComparing(true)}
                            onMouseUp={() => setIsComparing(false)}
                            onTouchStart={() => setIsComparing(true)}
                            onTouchEnd={() => setIsComparing(false)}
                        />
                       
                       {/* Compare Badge */}
                       <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/20 pointer-events-none">
                           {isComparing ? 'ORIGINAL' : 'RESULT (Hold to Compare)'}
                       </div>
                   </div>

                   <div className="flex gap-3">
                       <a 
                        href={resultImage} 
                        download={`dmp-edit-${feature.id}-${Date.now()}.png`}
                        className="px-6 py-3 bg-white text-black hover:bg-audi-cyan transition-colors rounded-xl font-bold flex items-center gap-2 shadow-lg"
                      >
                          <Icons.Download className="w-4 h-4" />
                          {lang === 'vi' ? 'Tải Về' : 'Download'}
                      </a>
                      <button onClick={() => setIsComparing(!isComparing)} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold border border-white/10">
                          {isComparing ? 'Xem Kết Quả' : 'Xem Ảnh Gốc'}
                      </button>
                   </div>
              </div>
          ) : (
              <div className="text-center text-slate-500">
                  <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-white/5">
                      <Icons.Image className="w-8 h-8 opacity-30" />
                  </div>
                  <p className="text-sm font-bold uppercase tracking-widest opacity-50">{lang === 'vi' ? 'KẾT QUẢ SẼ HIỆN Ở ĐÂY' : 'RESULT WILL APPEAR HERE'}</p>
              </div>
          )}
      </div>
    </div>
  );
};
