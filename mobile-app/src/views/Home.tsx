/**
 * Home.tsx — Main landing page (production)
 * Apple-inspired minimal design with real gallery preview.
 */

import { useState, useEffect } from 'react';
import { Image as ImageIcon, Video, Wand2, CalendarDays, Scissors, Sparkles, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAllImagesFromStorage } from '../services/storageService';
import { getFeatureMaintenanceConfig, isFeatureInMaintenance, subscribeCheckinStatus, type FeatureMaintenanceConfig } from '../services/economyService';
import { DailyCheckin } from '../components/DailyCheckin';
import type { GeneratedImage } from '../types';

export function Home() {
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const [recentItems, setRecentItems] = useState<GeneratedImage[]>([]);
  const [showCheckin, setShowCheckin] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(true);
  const [featureMaintenance, setFeatureMaintenance] = useState<FeatureMaintenanceConfig>({ disabledFeatureIds: [] });

  useEffect(() => {
    (async () => {
      try {
        const all = await getAllImagesFromStorage();
        setRecentItems(all.sort((a, b) => b.timestamp - a.timestamp).slice(0, 6));
      } catch { /* silent */ }
    })();
  }, []);

  useEffect(() => {
    return subscribeCheckinStatus(
      (status) => setIsCheckedIn(status.isCheckedInToday),
      { force: true }
    );
  }, []);

  useEffect(() => {
    getFeatureMaintenanceConfig().then(setFeatureMaintenance).catch(() => {
      setFeatureMaintenance({ disabledFeatureIds: [] });
    });
  }, []);

  const isAdmin = userRole === 'admin';
  const isLocked = (featureId: string) => !isAdmin && isFeatureInMaintenance(featureMaintenance, featureId);
  const openFeature = (featureId: string, path: string) => {
    if (isLocked(featureId)) return;
    navigate(path);
  };
  const lockBadge = (
    <span className="absolute right-3 top-3 z-20 rounded-full bg-amber-400 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-black shadow-lg">
      Bảo trì
    </span>
  );

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Chào buổi sáng';
    if (h < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  })();

  const userName = user?.username || 'Nhà sáng tạo';

  return (
    <div className="relative animate-fade-in space-y-8 p-5 pb-20">
      {/* Greeting and Checkin Action */}
      <div data-tour-id="mobile.home.hero" className="pt-1 flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-zinc-400 font-medium">{greeting}, {userName} 👋</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mt-0.5">Bạn muốn tạo gì hôm nay?</h1>
        </div>
        <button
          data-tour-id="mobile.home.checkin"
          onClick={() => setShowCheckin(true)}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl transition-transform active:scale-95 ${!isCheckedIn
              ? 'bg-red-50 dark:bg-red-500/10 text-red-600 border border-red-100 dark:border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse dark:bg-red-500/10 dark:border-red-500/20'
              : 'bg-white dark:bg-[#18181B] text-gray-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800 shadow-sm'
            }`}
        >
          <div className="relative">
            <CalendarDays className={`w-4 h-4 ${!isCheckedIn ? 'text-red-500' : 'text-purple-500'}`} />
            {!isCheckedIn && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide">
            {!isCheckedIn ? 'Điểm danh' : 'Đã nhận'}
          </span>
        </button>
      </div>

      {/* AuMix3D Partner Banner */}
      <a
        data-tour-id="mobile.home.promo"
        href="https://aumix3d.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-[#18181B] shadow-sm active:scale-[0.98] transition-all duration-150 group"
      >
        {/* Icon */}
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/20 group-active:scale-95 transition-transform">
          <span className="text-white text-lg font-black">3D</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <h4 className="text-[13px] font-extrabold text-gray-900 dark:text-white truncate">AuMix 3D Audition</h4>
            <span className="px-1.5 py-px bg-red-500 text-white text-[8px] font-black uppercase rounded tracking-wider shrink-0">AD</span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 leading-snug truncate">Mix đồ 3D trực tiếp • Kho item khổng lồ</p>
        </div>

        {/* Arrow */}
        <div className="w-8 h-8 rounded-full bg-gray-50 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:bg-cyan-50 dark:group-hover:bg-cyan-500/10 transition-colors">
          <ExternalLink className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 group-hover:text-cyan-500 transition-colors" />
        </div>
      </a>

      {/* Features Grid */}
      <div data-tour-id="mobile.home.features" className="space-y-4">

        {/* 1. Tạo Ảnh Audition AI */}
        <div
          data-tour-id="mobile.home.feature.single_photo_gen"
          onClick={() => openFeature('single_photo_gen', '/generate/image')}
          className={`relative overflow-hidden rounded-[32px] p-6 flex flex-col justify-end min-h-[180px] group transition-all duration-300 bg-gradient-to-br from-[#ff3385] via-[#ff0055] to-[#cc0044] border border-white/20 shadow-[0_15px_35px_-5px_rgba(255,0,85,0.3),0_6px_0_#990033,inset_0_2px_4px_rgba(255,255,255,0.2)] ${isLocked('single_photo_gen') ? 'cursor-not-allowed opacity-55' : 'cursor-pointer active:scale-[0.98] active:shadow-[0_5px_15px_rgba(255,0,85,0.2),0_1px_0_#990033,inset_0_2px_4px_rgba(255,255,255,0.1)] active:translate-y-1'}`}
        >
          {isLocked('single_photo_gen') && lockBadge}
          {/* Abstract blobs */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 dark:bg-white/10 blur-[60px] rounded-full -mr-20 -mt-20 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-purple-500/20 blur-[40px] rounded-full -ml-10 -mb-10 pointer-events-none" />

          {/* Shimmer Effect */}
          <div className="absolute top-0 left-0 w-[200%] h-[200%] bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer pointer-events-none z-0" />

          <div className="relative z-10 flex justify-between items-start mb-auto">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-[18px] flex items-center justify-center border border-white/30 shadow-inner">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
            <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/30 shadow-inner">
              <span className="text-[10px] font-black text-white uppercase tracking-wider">HOT</span>
            </div>
          </div>

          <div className="relative z-10 mt-6">
            <h3 className="text-[22px] font-black text-white mb-0.5 drop-shadow-[0_2px_10px_rgba(0,0,0,0.2)] tracking-tight">Tạo Ảnh Audition AI</h3>
            <p className="text-[13px] text-pink-100 font-medium opacity-90">Model Gemini Pro • Nhanh & Sắc nét</p>
          </div>
        </div>

        {/* 2. Tạo Video Audition AI */}
        <div
          data-tour-id="mobile.home.feature.video_ai_gen"
          onClick={() => openFeature('video_ai_gen', '/generate/video')}
          className={`relative overflow-hidden rounded-[32px] p-6 flex flex-col justify-end min-h-[160px] group transition-all duration-300 bg-gradient-to-br from-[#4A72FF] via-[#2F5BFF] to-[#0038FF] border border-white/20 shadow-[0_15px_35px_-5px_rgba(59,130,246,0.3),0_6px_0_#0024a8,inset_0_2px_4px_rgba(255,255,255,0.2)] ${isLocked('video_ai_gen') ? 'cursor-not-allowed opacity-55' : 'cursor-pointer active:scale-[0.98] active:shadow-[0_5px_15px_rgba(59,130,246,0.2),0_1px_0_#0024a8,inset_0_2px_4px_rgba(255,255,255,0.1)] active:translate-y-1'}`}
        >
          {isLocked('video_ai_gen') && lockBadge}
          {/* Abstract blobs */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-300/20 blur-[60px] rounded-full -mr-10 -mt-20 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-indigo-500/20 blur-[40px] rounded-full -ml-10 -mb-10 pointer-events-none" />

          {/* Shimmer Effect */}
          <div className="absolute top-0 left-0 w-[200%] h-[200%] bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer pointer-events-none z-0" style={{ animationDelay: '1s' }} />

          <div className="relative z-10 flex justify-between items-start mb-auto">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-[18px] flex items-center justify-center border border-white/30 shadow-inner">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/30 shadow-inner">
              <span className="text-[10px] font-black text-white uppercase tracking-wider">KLING 3.0</span>
            </div>
          </div>

          <div className="relative z-10 mt-5">
            <h3 className="text-xl font-black text-white mb-0.5 drop-shadow-[0_2px_10px_rgba(0,0,0,0.2)] tracking-tight">Tạo Video Audition AI</h3>
            <p className="text-[13px] text-blue-100 font-medium opacity-90">Video AI • Motion Control mượt mà</p>
          </div>
        </div>

        {/* 3 Tools Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div
            data-tour-id="mobile.home.feature.ai_image_tool"
            onClick={() => openFeature('ai_image_tool', '/tools/ai-image')}
            className={`bg-white dark:bg-[#18181B] rounded-[24px] p-4 flex flex-col items-center justify-center text-center gap-3 border border-gray-100 dark:border-zinc-800 shadow-sm transition-all duration-150 group relative overflow-hidden ${isLocked('ai_image_tool') ? 'cursor-not-allowed opacity-55' : 'active:translate-y-1 cursor-pointer'}`}
          >
            {isLocked('ai_image_tool') && lockBadge}
            <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-cyan-50/50 to-transparent pointer-events-none"></div>
            <div className="w-11 h-11 bg-gradient-to-br from-cyan-100 via-cyan-50 to-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),0_4px_8px_rgba(6,182,212,0.15)] ring-1 ring-cyan-100">
              <ImageIcon className="w-[22px] h-[22px] text-cyan-500 drop-shadow-sm" />
            </div>
            <div className="relative z-10 mt-0.5">
              <h4 className="text-[11px] font-extrabold text-gray-900 dark:text-white leading-tight">Tạo Ảnh<br /><span className="text-cyan-500">AI</span></h4>
            </div>
          </div>
          {/* Chỉnh sửa Ảnh */}
          <div
            data-tour-id="mobile.home.feature.magic_editor_pro"
            onClick={() => openFeature('magic_editor_pro', '/tools/edit')}
            className={`flex-1 bg-white dark:bg-[#18181B] rounded-[24px] p-4 flex flex-col items-center justify-center text-center gap-3 border border-gray-100 dark:border-zinc-800 shadow-sm transition-all duration-150 group relative overflow-hidden ${isLocked('magic_editor_pro') ? 'cursor-not-allowed opacity-55' : 'active:translate-y-1 cursor-pointer'}`}
          >
            {isLocked('magic_editor_pro') && lockBadge}
            {/* Soft inner glow */}
            <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-purple-50/50 to-transparent pointer-events-none"></div>

            <div className="w-11 h-11 bg-gradient-to-br from-purple-100 via-purple-50 to-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),0_4px_8px_rgba(168,85,247,0.15)] ring-1 ring-purple-100">
              <Wand2 className="w-[22px] h-[22px] text-purple-500 drop-shadow-sm" />
            </div>
            <div className="relative z-10 mt-0.5">
              <h4 className="text-[11px] font-extrabold text-gray-900 dark:text-white leading-tight">Chỉnh sửa<br /><span className="text-purple-500">Ảnh AI</span></h4>
            </div>
          </div>

          {/* Tách Nền */}
          <div
            data-tour-id="mobile.home.feature.remove_bg_pro"
            onClick={() => openFeature('remove_bg_pro', '/tools/remove-bg')}
            className={`flex-1 bg-white dark:bg-[#18181B] rounded-[24px] p-4 flex flex-col items-center justify-center text-center gap-3 border border-gray-100 dark:border-zinc-800 shadow-sm transition-all duration-150 group relative overflow-hidden ${isLocked('remove_bg_pro') ? 'cursor-not-allowed opacity-55' : 'active:translate-y-1 cursor-pointer'}`}
          >
            {isLocked('remove_bg_pro') && lockBadge}
            {/* Soft inner glow */}
            <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-emerald-50/50 to-transparent pointer-events-none"></div>

            <div className="w-11 h-11 bg-gradient-to-br from-emerald-100 via-emerald-50 to-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),0_4px_8px_rgba(16,185,129,0.15)] ring-1 ring-emerald-100">
              <Scissors className="w-[22px] h-[22px] text-emerald-500 drop-shadow-sm" />
            </div>
            <div className="relative z-10 mt-0.5">
              <h4 className="text-[11px] font-extrabold text-gray-900 dark:text-white leading-tight">Tách Nền<br /><span className="text-emerald-500">Ảnh AI</span></h4>
            </div>
          </div>

          {/* Làm Nét */}
          <div
            data-tour-id="mobile.home.feature.sharpen_upscale"
            onClick={() => openFeature('sharpen_upscale', '/tools/enhance')}
            className={`flex-1 bg-white dark:bg-[#18181B] rounded-[24px] p-4 flex flex-col items-center justify-center text-center gap-3 border border-gray-100 dark:border-zinc-800 shadow-sm transition-all duration-150 group relative overflow-hidden ${isLocked('sharpen_upscale') ? 'cursor-not-allowed opacity-55' : 'active:translate-y-1 cursor-pointer'}`}
          >
            {isLocked('sharpen_upscale') && lockBadge}
            {/* Soft inner glow */}
            <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-amber-50/50 to-transparent pointer-events-none"></div>

            <div className="w-11 h-11 bg-gradient-to-br from-amber-100 via-amber-50 to-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),0_4px_8px_rgba(245,158,11,0.15)] ring-1 ring-amber-100">
              <Sparkles className="w-[22px] h-[22px] text-amber-500 drop-shadow-sm" />
            </div>
            <div className="relative z-10 mt-0.5">
              <h4 className="text-[11px] font-extrabold text-gray-900 dark:text-white leading-tight">Làm Nét<br /><span className="text-amber-500">Ảnh AI</span></h4>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Gallery */}
      {recentItems.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Đã tạo gần đây</h3>
            <button onClick={() => navigate('/gallery')} className="text-xs font-bold text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:text-white transition-colors">
              Xem tất cả →
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto hide-scrollbar snap-x pb-1">
            {recentItems.map((item) => {
              const isVideo = item.assetType === 'video' || item.toolId?.includes('video') || item.toolId?.includes('motion');
              return (
                <div
                  key={item.id}
                  onClick={() => navigate('/gallery')}
                  className="w-28 h-28 shrink-0 rounded-2xl overflow-hidden snap-start bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-800 relative cursor-pointer active:scale-[0.96] transition-transform"
                >
                  {item.url ? (
                    isVideo
                      ? <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                      : <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : item.status === 'processing' || item.status === 'queued' ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : item.status === 'failed' ? (
                    <div className="w-full h-full flex items-center justify-center bg-red-50 dark:bg-red-500/10">
                      <span className="text-[10px] text-red-400">Lỗi</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-gray-500 dark:text-zinc-400" />
                    </div>
                  )}
                  {/* Status indicator */}
                  {(item.status === 'processing' || item.status === 'queued') && (
                    <div className="absolute bottom-1 right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                      <span className="text-[7px] font-bold text-white">{Math.round(item.progress || 0)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCheckin && (
        <DailyCheckin
          lang="vi"
          onClose={() => setShowCheckin(false)}
          onSuccess={() => { }}
        />
      )}
    </div>
  );
}
