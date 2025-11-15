import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../../common/Modal';
import { useTranslation } from '../../../hooks/useTranslation';
import { PromptLibraryItem } from '../../../types';

interface PromptLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
  category: string;
}

const PromptLibraryModal: React.FC<PromptLibraryModalProps> = ({ isOpen, onClose, onSelectPrompt, category }) => {
    const { t } = useTranslation();
    const [prompts, setPrompts] = useState<PromptLibraryItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const fetchPrompts = useCallback(async (pageNum: number) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/.netlify/functions/fetch-prompts?category=${category}&page=${pageNum}&limit=20`);
            if (!res.ok) throw new Error(t('modals.promptLibrary.error'));
            const data: PromptLibraryItem[] = await res.json();
            
            setPrompts(prev => pageNum === 1 ? data : [...prev, ...data]);
            setHasMore(data.length === 20);
            setPage(pageNum + 1);
        } catch (error: any) {
            console.error(error.message);
        } finally {
            setIsLoading(false);
        }
    }, [category, isLoading, t]);

    useEffect(() => {
        if (isOpen) {
            // Reset state when modal is opened
            setPrompts([]);
            setPage(1);
            setHasMore(true);
            // Fetch initial data
            fetchPrompts(1);
        }
    }, [isOpen]); // Dependency array simplified

    const handleSelect = (prompt: string) => {
        onSelectPrompt(prompt);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('modals.promptLibrary.title')}>
            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                {prompts.length === 0 && !isLoading && (
                    <div className="text-center py-12 text-skin-muted">
                        <i className="ph-fill ph-scroll text-5xl mb-4"></i>
                        <p>{t('modals.promptLibrary.empty')}</p>
                    </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {prompts.map((item, index) => (
                        <div
                            key={index}
                            className="group relative aspect-[3/4] rounded-lg overflow-hidden cursor-pointer bg-skin-fill-secondary border border-skin-border"
                            onClick={() => handleSelect(item.prompt)}
                        >
                            <img src={item.image_url} alt="Prompt inspiration" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" loading="lazy" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent p-2 flex flex-col justify-end">
                                <p className="text-xs text-white/80 line-clamp-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">{item.prompt}</p>
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <span className="px-3 py-1.5 text-xs font-bold bg-skin-accent text-skin-accent-text rounded-full">{t('modals.promptLibrary.usePrompt')}</span>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-6 text-center">
                    {isLoading && (
                         <div className="h-10 flex justify-center items-center">
                            <div className="w-6 h-6 border-2 border-skin-border border-t-skin-accent rounded-full animate-spin"></div>
                        </div>
                    )}
                    {!isLoading && hasMore && (
                        <button onClick={() => fetchPrompts(page)} className="themed-button-secondary px-6 py-2">
                            {t('modals.promptLibrary.loadMore')}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default PromptLibraryModal;