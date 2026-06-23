
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
  
  // This component now acts as a Controller/Router for tools
  // ensuring separation of concerns.

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
            return <div className="p-10 text-center">Unknown tool type</div>;
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 animate-fade-in pb-20 md:pb-0">
        {/* Common Header / Back Button */}
        <div className="flex items-center gap-2">
             <button 
                data-tour-id="desktop.tool.back"
                onClick={onBack} 
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-600 dark:text-slate-300 font-medium text-sm"
             >
                <Icons.ChevronRight className="w-4 h-4 rotate-180" />
                {lang === 'vi' ? 'Quay lại thư viện' : 'Back to Library'}
            </button>
            <div className="h-6 w-px bg-slate-300 dark:bg-white/10 mx-2"></div>
            <span className="text-sm text-slate-400">{feature.engine}</span>
        </div>

        {/* Dynamic Tool Content */}
        <div className="flex-1 min-h-0">
            {renderTool()}
        </div>
    </div>
  );
};
