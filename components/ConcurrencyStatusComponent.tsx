import React from 'react';
import { useConcurrency } from '../services/concurrencyService';
import { Icons } from './Icons';

export const ConcurrencyStatusComponent: React.FC = () => {
    const { activeJobs, userId } = useConcurrency();

    // Global limits
    const MAX_GLOBAL_IMAGE = 2;
    const MAX_GLOBAL_VIDEO = 2;
    const MAX_GLOBAL_QUEUE = 5;

    // User limits
    const MAX_USER_PROCESSING = 1;
    const MAX_USER_QUEUE = 1;

    // Calculate global stats
    const globalImageProcessing = activeJobs.filter(j => j.type === 'image' && j.status === 'processing').length;
    const globalVideoProcessing = activeJobs.filter(j => j.type === 'video' && j.status === 'processing').length;
    const globalQueued = activeJobs.filter(j => j.status === 'queued').length;

    // Calculate user stats
    const myJobs = activeJobs.filter(j => j.userId === userId);
    const myProcessing = myJobs.filter(j => j.status === 'processing').length;
    const myQueued = myJobs.filter(j => j.status === 'queued').length;

    const isGlobalQueueFull = globalQueued >= MAX_GLOBAL_QUEUE;
    const isMyProcessingFull = myProcessing >= MAX_USER_PROCESSING;
    const isMyQueueFull = myQueued >= MAX_USER_QUEUE;

    return (
        <div className="w-full mb-6 animate-fade-in">
            <div className="bg-[#0a0a14]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    
                    {/* Left: User Status */}
                    <div className="flex-1 w-full">
                        <div className="flex items-center gap-2 mb-2">
                            <Icons.User className="w-4 h-4 text-audi-cyan" />
                            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Luồng Của Bạn</span>
                        </div>
                        <div className="flex items-center gap-4 bg-black/40 rounded-xl p-3 border border-white/5">
                            <div className="flex-1">
                                <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
                                    <span>ĐANG XỬ LÝ</span>
                                    <span className={isMyProcessingFull ? 'text-audi-pink' : 'text-audi-cyan'}>{myProcessing}/{MAX_USER_PROCESSING}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-500 ${myProcessing > 0 ? 'bg-audi-cyan shadow-[0_0_10px_#21D4FD] animate-pulse' : 'bg-transparent'}`}
                                        style={{ width: `${(myProcessing / MAX_USER_PROCESSING) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                            <div className="w-px h-6 bg-white/10"></div>
                            <div className="flex-1">
                                <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
                                    <span>HÀNG CHỜ</span>
                                    <span className={isMyQueueFull ? 'text-audi-yellow' : 'text-slate-300'}>{myQueued}/{MAX_USER_QUEUE}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-500 ${myQueued > 0 ? 'bg-audi-yellow shadow-[0_0_10px_#FBDA61] animate-pulse' : 'bg-transparent'}`}
                                        style={{ width: `${(myQueued / MAX_USER_QUEUE) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Global Status */}
                    <div className="flex-1 w-full">
                        <div className="flex items-center gap-2 mb-2">
                            <Icons.Globe className="w-4 h-4 text-audi-purple" />
                            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Trạng Thái Hệ Thống</span>
                        </div>
                        <div className="flex items-center gap-3 bg-black/40 rounded-xl p-3 border border-white/5">
                            <div className="flex-1 flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                        <Icons.Image className="w-3 h-3" /> ẢNH
                                    </span>
                                    <div className="flex gap-1">
                                        {Array.from({ length: MAX_GLOBAL_IMAGE }).map((_, i) => (
                                            <div key={i} className={`w-2 h-2 rounded-full ${i < globalImageProcessing ? 'bg-audi-purple shadow-[0_0_8px_#B721FF] animate-pulse' : 'bg-slate-700'}`}></div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                        <Icons.Video className="w-3 h-3" /> VIDEO
                                    </span>
                                    <div className="flex gap-1">
                                        {Array.from({ length: MAX_GLOBAL_VIDEO }).map((_, i) => (
                                            <div key={i} className={`w-2 h-2 rounded-full ${i < globalVideoProcessing ? 'bg-audi-pink shadow-[0_0_8px_#FF0099] animate-pulse' : 'bg-slate-700'}`}></div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="w-px h-8 bg-white/10"></div>
                            <div className="flex-1">
                                <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
                                    <span>HÀNG CHỜ CHUNG</span>
                                    <span className={isGlobalQueueFull ? 'text-red-500' : 'text-slate-300'}>{globalQueued}/{MAX_GLOBAL_QUEUE}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-500 ${globalQueued > 0 ? (isGlobalQueueFull ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-slate-400') : 'bg-transparent'}`}
                                        style={{ width: `${(globalQueued / MAX_GLOBAL_QUEUE) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Warnings */}
                {(isMyProcessingFull && isMyQueueFull) ? (
                    <div className="mt-3 text-[10px] md:text-xs text-audi-yellow flex items-center gap-2 bg-audi-yellow/10 p-2 rounded-lg border border-audi-yellow/20">
                        <Icons.AlertTriangle className="w-4 h-4" />
                        <span>Bạn đã đạt giới hạn luồng. Vui lòng chờ ảnh đang xử lý hoàn tất trước khi tạo thêm.</span>
                    </div>
                ) : isGlobalQueueFull ? (
                    <div className="mt-3 text-[10px] md:text-xs text-red-400 flex items-center gap-2 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                        <Icons.AlertTriangle className="w-4 h-4" />
                        <span>Hàng chờ hệ thống đang đầy. Vui lòng thử lại sau ít phút.</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
};
