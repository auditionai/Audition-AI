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

const FeatureCard: React.FC<{
  feature: Feature;
  lang: Language;
  onClick: () => void;
  isMaintenance?: boolean;
  maintenanceLabel?: string;
}> = React.memo(({ feature, lang, onClick, isMaintenance, maintenanceLabel }) => {
  const isPremium = feature.isPremium;
  const tag = feature.tag;
  const isGen = feature.toolType === 'generation';
  const isVideo = feature.toolType === 'video';

  const getBgColor = () => {
    if (isMaintenance) return 'bg-gray-50';
    if (isVideo) return 'bg-orange-50';
    if (isGen) return 'bg-blue-50';
    return 'bg-cyan-50';
  };

  const getIconColor = () => {
    if (isMaintenance) return 'text-gray-400';
    if (isVideo) return 'text-orange-600';
    if (isGen) return 'text-blue-600';
    return 'text-cyan-600';
  };

  return (
    <div
      onClick={isMaintenance ? undefined : onClick}
      className={`modern-card group relative overflow-hidden p-6 transition-all duration-300 ${!isMaintenance ? 'cursor-pointer hover:shadow-xl hover:-translate-y-1' : 'opacity-60 cursor-not-allowed'}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className={`flex h-14 w-14 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${getBgColor()}`}>
          {isVideo ? (
            <Icons.Video className={`h-7 w-7 ${getIconColor()}`} />
          ) : isGen ? (
            <Icons.Sparkles className={`h-7 w-7 ${getIconColor()}`} />
          ) : (
            <Icons.Wand className={`h-7 w-7 ${getIconColor()}`} />
          )}
        </div>

        <div className="flex flex-col gap-2 items-end">
          {isMaintenance && (
            <span className="rounded-full bg-gray-200 px-2.5 py-1 text-[10px] font-semibold text-gray-600 uppercase">
              {maintenanceLabel || (lang === 'vi' ? 'Bảo trì' : 'Maintenance')}
            </span>
          )}
          {tag === 'HOT' && (
            <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-2.5 py-1 text-[10px] font-semibold text-white uppercase animate-pulse">
              <Icons.Flame className="h-3 w-3" /> HOT
            </span>
          )}
          {tag === 'NEW' && (
            <span className="rounded-full bg-green-500 px-2.5 py-1 text-[10px] font-semibold text-white uppercase">
              NEW
            </span>
          )}
          {isPremium && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-semibold text-white uppercase">
              <Icons.Crown className="h-3 w-3" /> VIP
            </span>
          )}
        </div>
      </div>

      <div className="mb-4">
        <h3 className="mb-2 text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
          {feature.name[lang]}
        </h3>
        <p className="line-clamp-2 text-sm text-gray-600">
          {feature.description[lang]}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <span className="text-xs font-medium text-gray-500">
          {feature.engine.split(' ')[0]}
        </span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${getBgColor()} ${!isMaintenance && 'group-hover:bg-blue-600 group-hover:text-white'}`}>
          <Icons.ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
});

export const Home: React.FC<HomeProps> = ({
  lang,
  onSelectFeature,
  onNavigate,
  onOpenCheckin,
  isMaintenance,
  maintenanceMessage,
  featureMaintenance
}) => {
  const studioFeatures = APP_CONFIG.main_features.filter(f => f.toolType === 'generation');
  const toolFeatures = APP_CONFIG.main_features.filter(f => f.toolType === 'editing');
  const videoFeatures = APP_CONFIG.main_features.filter(f => f.toolType === 'video');
  const [isCheckedIn, setIsCheckedIn] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      unsubscribe = subscribeCheckinStatus(
        (status) => setIsCheckedIn(status.isCheckedInToday),
        { force: false }
      );
    }, 1200);
    return () => {
      window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="modern-card overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-2xl font-bold">
              {lang === 'vi' ? 'Chào mừng trở lại!' : 'Welcome back!'}
            </h1>
            <p className="text-blue-100">
              {lang === 'vi'
                ? 'Hệ thống đã sẵn sàng. Hãy chọn công cụ bên dưới.'
                : 'System ready. Choose a tool below.'}
            </p>
          </div>
          {!isCheckedIn && (
            <button
              onClick={onOpenCheckin}
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-blue-600 shadow-lg hover:bg-blue-50 transition-all animate-pulse"
            >
              <Icons.Calendar className="h-4 w-4" />
              {lang === 'vi' ? 'Điểm danh ngay' : 'Check in now'}
            </button>
          )}
        </div>
      </div>

      {/* STUDIO AI Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Icons.Wand className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">STUDIO AI</h2>
              <p className="text-sm text-gray-600">
                {lang === 'vi'
                  ? 'Bộ công cụ sáng tạo hình ảnh chuyên nghiệp'
                  : 'Professional image generation suite'}
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-gray-500">Powered by Gemini 3.0</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {studioFeatures.map((feature) => (
            <FeatureCard
              key={feature.id}
              feature={feature}
              lang={lang}
              onClick={() => onSelectFeature(feature)}
              isMaintenance={isMaintenance || isFeatureInMaintenance(featureMaintenance, feature.id)}
              maintenanceLabel={
                isFeatureInMaintenance(featureMaintenance, feature.id)
                  ? (lang === 'vi' ? 'Bảo trì' : 'Maintenance')
                  : undefined
              }
            />
          ))}
        </div>
      </section>

      {/* VIDEO LAB Section */}
      {videoFeatures.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
                <Icons.Video className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">VIDEO LAB</h2>
                <p className="text-sm text-gray-600">
                  {lang === 'vi'
                    ? 'Bộ công cụ tạo video AI'
                    : 'AI video generation suite'}
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-gray-500">TST Video Suite</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {videoFeatures.map((feature) => (
              <FeatureCard
                key={feature.id}
                feature={feature}
                lang={lang}
                onClick={() => onSelectFeature(feature)}
                isMaintenance={isMaintenance || isFeatureInMaintenance(featureMaintenance, feature.id)}
                maintenanceLabel={
                  isFeatureInMaintenance(featureMaintenance, feature.id)
                    ? (lang === 'vi' ? 'Bảo trì' : 'Maintenance')
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* TOOLS Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100">
              <Icons.Zap className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">TOOLS</h2>
              <p className="text-sm text-gray-600">
                {lang === 'vi'
                  ? 'Công cụ chỉnh sửa và nâng cấp ảnh'
                  : 'Image editing and enhancement tools'}
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-gray-500">AI Enhancement</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {toolFeatures.map((feature) => (
            <FeatureCard
              key={feature.id}
              feature={feature}
              lang={lang}
              onClick={() => onSelectFeature(feature)}
              isMaintenance={isMaintenance || isFeatureInMaintenance(featureMaintenance, feature.id)}
              maintenanceLabel={
                isFeatureInMaintenance(featureMaintenance, feature.id)
                  ? (lang === 'vi' ? 'Bảo trì' : 'Maintenance')
                  : undefined
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
};
