import React from 'react';
import { Language, Feature, ViewId } from '../types';
import { GenerationTool } from './features/GenerationTool';
import { EditingTool } from './features/EditingTool';
import { VideoTool } from './features/VideoTool';
import { PromptImageTool } from './features/PromptImageTool';

interface ToolWorkspaceProps {
  feature: Feature;
  lang: Language;
  onNavigateToFeature?: (featureId: string) => void;
  onNavigateView?: (view: ViewId, data?: any) => void;
}

export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({ feature, lang, onNavigateToFeature, onNavigateView }) => {

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
    <div className="h-full flex flex-col animate-fade-in pb-24 lg:pb-0">
        <div className="flex-1 min-h-0">
            {renderTool()}
        </div>
    </div>
  );
};
