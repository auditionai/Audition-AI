
import React, { useEffect, useState } from 'react';
import { APP_CONFIG } from '../constants';
import { Language, Feature, ViewId } from '../types';
import { Icons } from '../components/Icons';
import { subscribeCheckinStatus, isFeatureInMaintenance, type FeatureMaintenanceConfig } from '../services/economyService';

interface HomeProps {
  lang: Language;
  onSelectFeature: (feature: Feature) => void;
  onNavigate: (view: ViewId) => void;
  onOpenCheckin: () => void;
  isMaintenance?: boolean;
  maintenanceMessage?: string;
  featureMaintenance?: FeatureMaintenanceConfig | null;
}

interface FeatureCardProps {
  feature: Feature;
  lang: Language;
  onClick: () => void;
  idx: number;
}

const FeatureCard: React.FC<FeatureCardProps & { isMaintenance?: boolean; maintenanceLabel?: string }> = React.memo(({ feature, lang, onClick, idx, isMaintenance, maintenanceLabel }) => {
    const isPremium = feature.isPremium;
    const tag = feature.tag;
    const isGen = feature.toolType === 'generation';
    const isVideo = feature.toolType === 'video';
    const isEdit = feature.toolType === 'editing';

    // Color coding based on tool type
    const getIconGradient = () => {
        if (isMaintenance) return 'bg-text-muted/20';
        if (isVideo) return 'gradient-amber';
        if (isGen) return 'gradient-primary';
        return 'gradient-cyan';
    };

    const getIconColor = () => {
        if (isMaintenance) return 'text-text-muted';
        return 'text-white';
    };

    const getBadgeColor = () => {
        if (isVideo) return 'bg-secondary-light text-text-primary';
        if (isGen) return 'bg-primary-light text-white';
        return 'bg-accent-cyan text-white';
    };

    return (
        <div
            data-tour-id={`desktop.home.feature.${feature.id}`}
            onClick={isMaintenance ? undefined : onClick}
            className={`group relative neomorph-float p-6 transition-all duration-500 ${
              !isMaintenance && 'hover:neomorph-raised cursor-pointer hover:-translate-y-1'
            } ${isMaintenance && 'opacity-60 cursor-not-allowed'}`}
            style={{ animationDelay: `${idx * 0.1}s` }}
        >
            {/* Header: Icon & Badges */}
            <div className="flex justify-between items-start mb-4">
                {/* Icon */}
                <div className={`w-14 h-14 rounded-2xl neomorph-icon ${getIconGradient()} ${getIconColor()} transition-all duration-500 group-hover:scale-110 group-hover:rotate-3`}>
                    {isVideo ? <Icons.Video className="w-7 h-7" /> : isGen ? <Icons.Sparkles className="w-7 h-7" /> : <Icons.Wand className="w-7 h-7" />}
                </div>

                {/* Badges */}
                <div className="flex flex-col gap-2 items-end">
                    {isMaintenance && (
                        <span className="text-[9px] font-bold px-2.5 py-1 neomorph-inset text-text-muted uppercase tracking-wider">
                            {maintenanceLabel || (lang === 'vi' ? 'Bảo trì' : 'Maintenance')}
                        </span>
                    )}
                    <div className="flex gap-2 flex-wrap justify-end">
                        <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full ${getBadgeColor()} shadow-sm tracking-wider uppercase`}>
                            {isVideo ? 'VIDEO' : isGen ? 'GEN' : 'EDIT'}
                        </span>

                        {isPremium && (
                            <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-secondary text-white shadow-sm flex items-center gap-1 uppercase tracking-wider">
                                <Icons.Crown className="w-3 h-3" /> VIP
                            </span>
                        )}
                    </div>
                    {tag === 'HOT' && (
                        <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-accent-pink to-secondary text-white shadow-lg flex items-center gap-1 animate-pulse uppercase tracking-wider">
                           <Icons.Flame className="w-3 h-3 fill-white" /> HOT
                        </span>
                    )}
                    {tag === 'NEW' && (
                        <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-accent-green text-white shadow-sm uppercase tracking-wider">
                           NEW
                        </span>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="mb-4">
                <h3 className="font-accent text-lg font-bold text-text-primary mb-2 leading-tight group-hover:text-primary transition-colors">
                    {feature.name[lang]}
                </h3>
                <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                    {feature.description[lang]}
                </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-text-muted/20">
                 <span className="text-[9px] font-mono text-text-muted uppercase tracking-widest">{feature.engine.split(' ')[0]}</span>
                 <div className={`w-8 h-8 rounded-full neomorph-btn flex items-center justify-center transition-all duration-500 ${!isMaintenance && 'group-hover:neomorph-inset group-hover:text-primary'}`}>
                     <Icons.ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                 </div>
            </div>
        </div>
    );
});

export const Home: React.FC<HomeProps> = ({ lang, onSelectFeature, onNavigate, onOpenCheckin, isMaintenance, maintenanceMessage, featureMaintenance }) => {

  // Split features into categories
  const studioFeatures = APP_CONFIG.main_features.filter(f => f.toolType === 'generation');
  const toolFeatures = APP_CONFIG.main_features.filter(f => f.toolType === 'editing');
  const videoFeatures = APP_CONFIG.main_features.filter(f => f.toolType === 'video');
  const [isCheckedIn, setIsCheckedIn] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      unsubscribe = subscribeCheckinStatus(
        (status) => setIsCheckedIn(status.isCheckedInToday),
        { force: false },
      );
    }, 1200);

    return () => {
      window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="space-y-12 pb-24 relative">

      {/* Hero Section - Compact */}
      <div data-tour-id="desktop.home.hero" className="neomorph-raised p-6 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse"></div>
              <div>
                   <h1 className="font-accent text-2xl md:text-3xl font-bold text-text-primary leading-none">
                       HELLO, <span className="text-transparent bg-clip-text gradient-primary">CREATOR</span>
                   </h1>
                   <p className="text-text-secondary text-sm hidden md:block mt-1">
                       {lang === 'vi' ? 'Hệ thống đã sẵn sàng. Hãy chọn công cụ bên dưới.' : 'System online. Select a tool below to start.'}
                   </p>
              </div>
          </div>

          <div className="flex items-center gap-3">
             {/* Check-in button */}
             <button
                data-tour-id="desktop.home.checkin"
                onClick={onOpenCheckin}
                className={`neomorph-btn px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${
                    !isCheckedIn
                    ? 'bg-gradient-to-r from-accent-pink to-secondary text-white shadow-lg animate-pulse'
                    : 'text-text-secondary hover:text-primary'
                }`}
             >
                <div className="relative">
                     <Icons.Calendar className={`w-4 h-4 ${!isCheckedIn ? 'animate-bounce' : ''}`} />
                     {!isCheckedIn && (
                         <span className="absolute -top-1 -right-1 flex h-2 w-2">
                             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                             <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
                         </span>
                     )}
                </div>
                {lang === 'vi'
                    ? (!isCheckedIn ? 'Điểm danh' : 'Đã điểm danh')
                    : (!isCheckedIn ? 'Check-in' : 'Checked')
                }
             </button>
          </div>
      </div>

      {/* SECTION 1: STUDIO AI (Generation) */}
      <div data-tour-id="desktop.home.studio" className="animate-fade-in" style={{animationDelay: '0.1s'}}>
        <div className="flex items-center justify-between mb-6 neomorph-flat p-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 neomorph-icon gradient-primary">
                    <Icons.Wand className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="font-accent text-2xl font-bold text-text-primary">
                        STUDIO AI
                    </h2>
                    <p className="text-xs text-text-secondary mt-1">
                        {lang === 'vi' ? 'Bộ công cụ sáng tạo hình ảnh chuyên nghiệp' : 'Professional image generation suite'}
                    </p>
                </div>
            </div>
            <div className="hidden md:block text-[10px] font-mono text-text-muted uppercase tracking-wider">Powered by Gemini 3.0</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {studioFeatures.map((feature, idx) => (
                <FeatureCard
                    key={feature.id}
                    feature={feature}
                    lang={lang}
                    onClick={() => onSelectFeature(feature)}
                    idx={idx}
                    isMaintenance={isMaintenance || isFeatureInMaintenance(featureMaintenance, feature.id)}
                    maintenanceLabel={isFeatureInMaintenance(featureMaintenance, feature.id) ? (lang === 'vi' ? 'Bảo trì' : 'Maintenance') : undefined}
                />
            ))}
        </div>
      </div>

      {/* SECTION 2: VIDEO LAB */}
      {videoFeatures.length > 0 && (
        <div data-tour-id="desktop.home.video" className="animate-fade-in" style={{animationDelay: '0.2s'}}>
          <div className="flex items-center justify-between mb-6 neomorph-flat p-4">
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 neomorph-icon gradient-amber">
                      <Icons.Video className="w-5 h-5 text-white" />
                  </div>
                  <div>
                      <h2 className="font-accent text-2xl font-bold text-text-primary">
                          VIDEO LAB
                      </h2>
                      <p className="text-xs text-text-secondary mt-1">
                          {lang === 'vi' ? 'Bộ công cụ tạo video AI theo hệ sinh thái TST' : 'AI video generation suite'}
                      </p>
                  </div>
              </div>
              <div className="hidden md:block text-[10px] font-mono text-text-muted uppercase tracking-wider">TST Video Suite</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {videoFeatures.map((feature, idx) => (
                  <FeatureCard
                      key={feature.id}
                      feature={feature}
                      lang={lang}
                      onClick={() => onSelectFeature(feature)}
                      idx={idx}
                      isMaintenance={isMaintenance || isFeatureInMaintenance(featureMaintenance, feature.id)}
                      maintenanceLabel={isFeatureInMaintenance(featureMaintenance, feature.id) ? (lang === 'vi' ? 'Bảo trì' : 'Maintenance') : undefined}
                  />
              ))}
          </div>
        </div>
      )}

      {/* SECTION 3: TOOLS (Editing) */}
      <div data-tour-id="desktop.home.editing" className="animate-fade-in" style={{animationDelay: '0.3s'}}>
        <div className="flex items-center justify-between mb-6 neomorph-flat p-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 neomorph-icon gradient-cyan">
                    <Icons.Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="font-accent text-2xl font-bold text-text-primary">
                        TOOLS
                    </h2>
                     <p className="text-xs text-text-secondary mt-1">
                        {lang === 'vi' ? 'Công cụ chỉnh sửa và nâng cấp ảnh' : 'Image editing and enhancement tools'}
                    </p>
                </div>
            </div>
             <div className="hidden md:block text-[10px] font-mono text-text-muted uppercase tracking-wider">AI Enhancement</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {toolFeatures.map((feature, idx) => (
                <FeatureCard
                    key={feature.id}
                    feature={feature}
                    lang={lang}
                    onClick={() => onSelectFeature(feature)}
                    idx={idx}
                    isMaintenance={isMaintenance || isFeatureInMaintenance(featureMaintenance, feature.id)}
                    maintenanceLabel={isFeatureInMaintenance(featureMaintenance, feature.id) ? (lang === 'vi' ? 'Bảo trì' : 'Maintenance') : undefined}
                />
            ))}
        </div>
      </div>

    </div>
  );
};
