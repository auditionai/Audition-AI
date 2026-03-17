
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

// Suggestions for Photo Editor
const SUGGESTIONS = [
    { label: { vi: 'Thay đổi background sang biển', en: 'Change background to beach' }, icon: Icons.Image },
    { label: { vi: 'Mặc vest đen sang trọng', en: 'Wear luxury black suit' }, icon: Icons.User },
    { label: { vi: 'Thêm hiệu ứng tuyết rơi', en: 'Add snowing effect' }, icon: Icons.Cloud },
    { label: { vi: 'Biến thành tranh sơn dầu', en: 'Turn into oil painting' }, icon: Icons.Palette },
    { label: { vi: 'Đổi màu tóc sang đỏ', en: 'Change hair color to red' }, icon: Icons.Scissors },
    { label: { vi: 'Thêm kính râm cool ngầu', en: 'Add cool sunglasses' }, icon: Icons.Monitor },
    { label: { vi: 'Chuyển sang phong cách Cyberpunk', en: 'Make it Cyberpunk style' }, icon: Icons.Zap },
    { label: { vi: 'Xóa người thừa phía sau', en: 'Remove background people' }, icon: Icons.Trash },
];

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
  const isMagicEditor = feature.id === 'magic_editor_pro';
  
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
      // 1. Photo Editor Logic (Professional Instructions)
      if (isMagicEditor) {
          if (!prompt.trim()) return "";
          return `Act as a professional photo editor. Perform the following edit on the image: "${prompt}". 
          CRITICAL RULES:
          1. KEEP ORIGINAL IMAGE QUALITY AND SIZE. DO NOT DOWNSCALE.
          2. Maintain the original identity, face, and high resolution of the subject unless explicitly asked to change.
          3. Ensure realistic lighting, shadows, and perspective blending.
          4. If changing background, ensure the subject is perfectly integrated.
          5. Output highly detailed, photorealistic result with high fidelity.`;
      }

      // 2. Upscaler Logic (High Fidelity 4K)
      if (isUpscaler) {
          return `Upscale this image to 4K resolution. CRITICAL: Do NOT alter facial features, eyes, or clothing details. Maintain exact fidelity to the original. Apply intelligent sharpening, de-blurring, and texture restoration only. Do NOT reimagine or hallucinate new elements. Goal: Pure Image Restoration.`;
      }

      // 3. Background Remover Logic (Force Black & High Quality)
      if (isRemover) {
          return "Remove the background completely and place the subject on a pure BLACK background (#000000). CRITICAL: Maintain the original image resolution (4K) and subject details exactly. Do NOT downscale, do NOT blur edges, do NOT alter the subject's lighting.";
      }

      return feature.defaultPrompt || "";
  };

  const handleExecute = async () => {
     if (!uploadedImage) {
         notify(lang === 'vi' ? 'Vui lòng tải ảnh lên' : 'Please upload an image', 'warning');
         return;
     }

     if (isMagicEditor && !prompt.trim()) {
         notify(lang === 'vi' ? 'Vui lòng nhập yêu cầu chỉnh sửa' : 'Please enter edit prompt', 'warning');
         return;
     }

     // Cost Calculation: Photo Editor is more expensive (Premium)
     const cost = isMagicEditor ? 3 : (isUpscaler ? 2 : 1); 
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

  const getBorderColor = () => {
      if (isMagicEditor) return 'border-audi-purple';
      if (isUpscaler) return 'border-audi-cyan';
      if (isRemover) return 'border-audi-pink';
      return 'border-purple-500';
  };

  const getGradient = () => {
      if (isMagicEditor) return 'from-audi-purple to-pink-500';
      if (isUpscaler) return 'from-audi-cyan to-blue-500';
      if (isRemover) return 'from-audi-pink to-purple-600';
      return 'from-purple-500 to-pink-600';
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full pb-20 md:pb-0">
      <div className="w-full md:w-1/3 flex flex-col gap-6">
          <div className={`glass-panel p-6 rounded-3xl border-l-4 ${getBorderColor()}`}>
             <h2 className={`text-xl font-bold mb-1 text-slate-800 dark:text-white flex items-center gap-2`}>
                 {isMagicEditor ? <Icons.Wand className="w-5 h-5 text-audi-purple" /> : isUpscaler ? <Icons.Zap className="w-5 h-5 text-audi-cyan" /> : isRemover ? <Icons.Scissors className="w-5 h-5 text-audi-pink" /> : <Icons.Wand className="w-5 h-5 text-purple-500" />}
                 {feature.name[lang]}
             </h2>
             <p className="text-sm text-slate-500 dark:text-slate-400">{feature.description[lang]}</p>
         </div>

         {/* Upload Area */}
         <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl h-48 flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative group
                ${uploadedImage 
                    ? getBorderColor()
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
                     <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${isMagicEditor ? 'bg-audi-purple/20 text-audi-purple' : isUpscaler ? 'bg-audi-cyan/20 text-audi-cyan' : 'bg-audi-pink/20 text-audi-pink'}`}>
                         <Icons.Upload className="w-6 h-6" />
                     </div>
                     <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{lang === 'vi' ? 'Tải ảnh gốc lên' : 'Upload Source Image'}</span>
                 </div>
             )}
             <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
         </div>

         {/* --- CONTROLS SECTION --- */}
         <div className="space-y-4">
             
             {/* 1. PHOTO EDITOR (FORMERLY MAGIC) */}
             {isMagicEditor && (
                 <div className="animate-fade-in space-y-4">
                     <div className="relative">
                         <div className="absolute top-0 right-0 -mt-2 -mr-2 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                         <div className="bg-[#1a1a24] p-4 rounded-2xl border border-audi-purple/30 shadow-[0_0_15px_rgba(183,33,255,0.1)]">
                             <label className="text-xs font-bold text-audi-purple uppercase mb-2 flex items-center gap-2">
                                 <Icons.Sparkles className="w-3 h-3" />
                                 {lang === 'vi' ? 'Nhập yêu cầu chỉnh sửa' : 'Enter Edit Request'}
                             </label>
                             <textarea 
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-audi-purple outline-none min-h-[80px] resize-none placeholder:text-slate-600"
                                placeholder={lang === 'vi' ? "Ví dụ: Thêm nơ hồng vào tóc, đổi background sang rừng rậm..." : "Ex: Add pink bow to hair, change background to jungle..."}
                             />
                         </div>
                     </div>

                     {/* Suggestion Chips */}
                     <div className="space-y-2">
                         <span className="text-[10px] font-bold text-slate-500 uppercase">Gợi ý nhanh</span>
                         <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto custom-scrollbar">
                             {SUGGESTIONS.map((s, idx) => (
                                 <button
                                    key={idx}
                                    onClick={() => setPrompt(s.label[lang === 'vi' ? 'vi' : 'en'])}
                                    className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] text-slate-300 transition-colors"
                                 >
                                     <s.icon className="w-3 h-3 text-audi-purple" />
                                     {s.label[lang === 'vi' ? 'vi' : 'en']}
                                 </button>
                             ))}
                         </div>
                     </div>
                 </div>
             )}

             {/* 2. UPSCALER CONTROLS */}
             {isUpscaler && (
                 <div className="animate-fade-in space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                     <div className="flex items-center gap-3">
                         <div className="p-2 bg-audi-cyan/20 rounded-lg text-audi-cyan">
                             <Icons.Zap className="w-5 h-5" />
                         </div>
                         <div>
                             <h4 className="text-sm font-bold text-white">Làm Nét 4K (High Fidelity)</h4>
                             <p className="text-xs text-slate-400 mt-1">
                                 Tự động khôi phục chi tiết, làm nét ảnh.
                                 <br/>
                                 <span className="text-audi-cyan">Cam kết không biến dạng mặt & trang phục.</span>
                             </p>
                         </div>
                     </div>
                 </div>
             )}

             {/* 3. REMOVER CONTROLS */}
             {isRemover && (
                 <div className="animate-fade-in space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                     <div className="flex items-center gap-3">
                         <div className="p-2 bg-audi-pink/20 rounded-lg text-audi-pink">
                             <Icons.Scissors className="w-5 h-5" />
                         </div>
                         <div>
                             <h4 className="text-sm font-bold text-white">Chế độ Tách Nền (HQ)</h4>
                             <p className="text-xs text-slate-400 mt-1">
                                 Tự động tách nền và chuyển sang nền đen (Black).
                                 <br/>
                                 <span className="text-audi-cyan">Giữ nguyên độ phân giải gốc (4K Supported).</span>
                             </p>
                         </div>
                     </div>
                 </div>
             )}

             {/* 4. GENERIC PROMPT (Legacy Fallback) */}
             {!isUpscaler && !isRemover && !isMagicEditor && (
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
             <span className="text-sm font-bold text-audi-yellow">{isMagicEditor ? 3 : (isUpscaler ? 2 : 1)} Vcoin</span>
         </div>

         <button 
            onClick={handleExecute}
            disabled={loading || !uploadedImage}
            className={`w-full py-4 bg-gradient-to-r ${getGradient()} text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] shadow-[0_5px_20px_rgba(0,0,0,0.3)]`}
         >
             {loading ? <Icons.Loader className="animate-spin" /> : <Icons.Wand />}
             {loading ? (lang === 'vi' ? 'Đang xử lý...' : 'Processing...') : (lang === 'vi' ? 'THỰC HIỆN NGAY' : 'EXECUTE')}
         </button>
      </div>

      {/* RESULT AREA */}
      <div className="flex-1 glass-panel rounded-3xl p-6 flex flex-col items-center justify-center bg-slate-100/50 dark:bg-black/20 min-h-[400px] relative overflow-hidden">
          {loading ? (
               <div className="text-center animate-pulse z-10">
                   <div className="relative w-24 h-24 mx-auto mb-6">
                       <div className={`absolute inset-0 rounded-full border-4 border-t-transparent animate-spin ${isUpscaler ? 'border-audi-cyan' : isMagicEditor ? 'border-audi-purple' : 'border-audi-pink'}`}></div>
                       <Icons.Sparkles className={`w-10 h-10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isUpscaler ? 'text-audi-cyan' : isMagicEditor ? 'text-audi-purple' : 'text-audi-pink'}`} />
                   </div>
                   <p className="text-white font-bold text-lg font-game tracking-widest">{lang === 'vi' ? 'AI ĐANG SUY NGHĨ...' : 'AI THINKING...'}</p>
                   <p className="text-slate-500 text-sm mt-2">{isMagicEditor ? (lang === 'vi' ? 'Đang thực hiện chỉnh sửa...' : 'Editing...') : (lang === 'vi' ? 'Đang xử lý...' : 'Processing...')}</p>
               </div>
          ) : resultImage ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 z-10">
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
              <div className="text-center text-slate-500 z-10">
                  <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto mb-4 border border-white/5 shadow-inner">
                      <Icons.Image className="w-10 h-10 opacity-30" />
                  </div>
                  <p className="text-sm font-bold uppercase tracking-widest opacity-50">{lang === 'vi' ? 'KẾT QUẢ SẼ HIỆN Ở ĐÂY' : 'RESULT WILL APPEAR HERE'}</p>
              </div>
          )}
          
          {/* Decorative Grid Background */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
      </div>
    </div>
  );
};
