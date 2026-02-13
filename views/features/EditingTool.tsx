
import React, { useState, useRef } from 'react';
import { Feature, Language, GeneratedImage } from '../../types';
import { Icons } from '../../components/Icons';
import { editImageWithInstructions } from '../../services/geminiService';
import { saveImageToStorage } from '../../services/storageService';

interface EditingToolProps {
  feature: Feature;
  lang: Language;
}

export const EditingTool: React.FC<EditingToolProps> = ({ feature, lang }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setUploadedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleExecute = async () => {
     if (!uploadedImage) {
         alert(lang === 'vi' ? 'Vui lòng tải ảnh lên' : 'Please upload an image');
         return;
     }

     setLoading(true);
     setResultImage(null);

     try {
         // Logic specific to Editing
         let instruction = feature.defaultPrompt || "";
         if (prompt) instruction += " " + prompt;

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
         }
     } catch (error) {
         console.error(error);
         alert(lang === 'vi' ? 'Chỉnh sửa thất bại' : 'Editing failed');
     } finally {
         setLoading(false);
     }
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full">
      <div className="w-full md:w-1/3 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-3xl border-l-4 border-purple-500">
             <h2 className="text-xl font-bold mb-1 text-slate-800 dark:text-white flex items-center gap-2">
                 <Icons.Wand className="w-5 h-5 text-purple-500" />
                 {feature.name[lang]}
             </h2>
             <p className="text-sm text-slate-500 dark:text-slate-400">{feature.description[lang]}</p>
         </div>

         {/* Upload Area */}
         <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl h-48 flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative
                ${uploadedImage ? 'border-purple-500' : 'border-slate-300 dark:border-slate-700 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10'}`}
         >
             {uploadedImage ? (
                 <img src={uploadedImage} alt="Source" className="w-full h-full object-contain p-2" />
             ) : (
                 <div className="text-center">
                     <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-2 text-purple-600">
                         <Icons.Download className="w-6 h-6" />
                     </div>
                     <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{lang === 'vi' ? 'Tải ảnh gốc lên' : 'Upload Source Image'}</span>
                 </div>
             )}
             <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
         </div>

         {/* Extra Instructions */}
         <div className="space-y-2">
             <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{lang === 'vi' ? 'Yêu cầu thêm (Tùy chọn)' : 'Extra Instructions (Optional)'}</label>
             <input 
                type="text" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full p-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:ring-2 focus:ring-purple-500 outline-none dark:text-white"
                placeholder={lang === 'vi' ? 'Ví dụ: Làm sáng hơn...' : 'Ex: Make it brighter...'}
             />
         </div>

         <button 
            onClick={handleExecute}
            disabled={loading || !uploadedImage}
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-bold shadow-lg hover:shadow-purple-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
         >
             {loading ? <Icons.Sparkles className="animate-spin" /> : <Icons.Zap />}
             {loading ? (lang === 'vi' ? 'Đang xử lý...' : 'Processing...') : (lang === 'vi' ? 'Thực hiện' : 'Run Tool')}
         </button>
      </div>

      <div className="flex-1 glass-panel rounded-3xl p-6 flex flex-col items-center justify-center bg-slate-100/50 dark:bg-black/20 min-h-[400px]">
          {loading ? (
               <div className="text-center">
                   <Icons.Sparkles className="w-12 h-12 text-purple-500 animate-spin mb-4 mx-auto" />
                   <p className="text-slate-500 font-medium">{lang === 'vi' ? 'Đang chỉnh sửa ảnh...' : 'Editing image...'}</p>
               </div>
          ) : resultImage ? (
              <div className="relative group w-full h-full flex items-center justify-center">
                   <div className="grid grid-cols-2 gap-4 w-full h-full">
                       <div className="flex flex-col gap-2">
                           <span className="text-xs font-bold text-slate-500 text-center">Original</span>
                           <img src={uploadedImage!} alt="Original" className="w-full h-full object-contain rounded-lg border border-slate-200 dark:border-white/10" />
                       </div>
                       <div className="flex flex-col gap-2">
                           <span className="text-xs font-bold text-purple-500 text-center">Result</span>
                           <img src={resultImage} alt="Result" className="w-full h-full object-contain rounded-lg border-2 border-purple-500 shadow-xl" />
                       </div>
                   </div>
                   <a 
                    href={resultImage} 
                    download={`edit-${Date.now()}.png`}
                    className="absolute bottom-6 right-6 p-3 bg-purple-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-purple-600"
                  >
                      <Icons.Download className="w-6 h-6" />
                  </a>
              </div>
          ) : (
              <div className="text-center text-slate-400">
                  <Icons.Image className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>{lang === 'vi' ? 'Kết quả sẽ hiển thị ở đây' : 'Result will appear here'}</p>
              </div>
          )}
      </div>
    </div>
  );
};
