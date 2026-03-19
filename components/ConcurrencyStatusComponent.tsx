import React, { useState, useEffect } from 'react';
import { GeneratedImage } from '../types';
import { getAllImagesFromStorage } from '../services/storageService';

interface ConcurrencyStatusProps {}

export const ConcurrencyStatusComponent: React.FC<ConcurrencyStatusProps> = () => {
    const [processing, setProcessing] = useState(0);
    const [pending, setPending] = useState(0);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const images = await getAllImagesFromStorage();
                let proc = 0;
                let pend = 0;
                images.forEach(img => {
                    if (img.status === 'processing') proc++;
                    if (img.status === 'queued') pend++;
                });
                setProcessing(proc);
                setPending(pend);
            } catch (error) {
                console.error("Failed to check concurrency status", error);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 2000);
        return () => clearInterval(interval);
    }, []);

    const total = processing + pending;
    const isFull = total >= 2;

    return (
        <div className="mt-4 p-3 bg-slate-800/50 border border-slate-700 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${processing > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></div>
                    <span className="text-sm text-slate-300">Luồng xử lý: <strong className="text-white">{Math.min(processing, 1)}/1</strong></span>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${pending > 0 ? 'bg-amber-500 animate-pulse' : 'bg-slate-500'}`}></div>
                    <span className="text-sm text-slate-300">Hàng chờ: <strong className="text-white">{Math.min(pending, 1)}/1</strong></span>
                </div>
            </div>
            {isFull && (
                <span className="text-xs text-rose-400 font-medium">Hệ thống đang bận, vui lòng chờ...</span>
            )}
        </div>
    );
};
