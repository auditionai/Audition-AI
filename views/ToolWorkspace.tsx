import React from 'react';
import { Language, Feature, ViewId } from '../types';
import { Icons } from '../components/Icons';
import { GenerationTool } from './features/GenerationTool';
import { EditingTool } from './features/EditingTool';
import { VideoTool } from './features/VideoTool';
import { PromptImageTool } from './features/PromptImageTool';

interface ToolWorkspaceProps {
  feature: Feature;
  lang: Language;
  onBack: () => void;
  onNavigateToFeature?: (featureId: string) => void;
  onNavigateView?: (view: ViewId, data?: any) => void;
}

export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({ feature, lang, onBack, onNavigateToFeature, onNavigateView }) => {

  const renderTool = () => {
    if (feature.id === 'ai_image_tool') {
        return <PromptImageTool key={feature.id} feature={feature} lang={lang} onNavigateView={onNavigateView} />;
    }

    switch (feature.toolType) {
        case 'generation':
            return <GenerationTool key={feature.id} feature={feature} lang={lang} onNavigateToFeature={onNavigateToFeature} onNavigateView={onNavigateView} />;
        case 'editing':
            return <EditingTool key={feature.id} feature={feature} lang={lang} onNavigateToFeature={onNavigateToFeature} onNavigateView={onNavigateView} />;
        case 'video':
            return <VideoTool key={feature.id} feature={feature} lang={lang} onNavigateToFeature={onNavigateToFeature} onNavigateView={onNavigateView} />;
        default:
            return <div className="p-10 text-center neu-card text-xs font-bold">Tool type unknown</div>;
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 animate-fade-in pb-24 lg:pb-0">
        {/* 3D Cyber Workspace Header */}
        <div className="neu-card px-5 py-3.5 rounded-3xl flex items-center justify-between">
             <div className="flex items-center gap-3">
               <button 
                  data-tour-id="desktop.tool.back"
                  onClick={onBack} 
                  className="neu-button px-4 py-2 rounded-2xl flex items-center gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-200 hover:text-[#FF007F] transition-all"
               >
                  <Icons.ChevronLeft className="w-4 h-4 text-[#FF007F]" />
                  <span>{lang === 'vi' ? 'Quay lại Dashboard' : 'Back to Dashboard'}</span>
               </button>

               <div className="h-4 w-px bg-slate-300 dark:bg-slate-800 hidden sm:block"></div>

               <div className="flex items-center gap-2">
                 <span className="font-extrabold text-sm text-slate-800 dark:text-white font-accent">
                   {feature.name[lang]}
                 </span>
               </div>
             </div>

             <div className="flex items-center gap-2">
                <span className="neu-inset-sm px-3.5 py-1 rounded-full text-[10px] font-mono font-black text-[#FF007F] dark:text-[#00F2FE]">
                  {feature.engine}
                </span>
             </div>
        </div>

        {/* Workspace Canvas Container */}
        <div className="flex-1 min-h-0">
            {renderTool()}
        </div>
    </div>
  );
};
