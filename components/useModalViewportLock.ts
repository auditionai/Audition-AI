import { useEffect } from 'react';

/** Keeps the app's scroll position stable while a modal is open. */
export const useModalViewportLock = (open: boolean) => {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;

    const scrollRoots = Array.from(
      document.querySelectorAll<HTMLElement>('main.custom-scrollbar, [data-app-scroll-root]')
    );
    const documentRoot = document.scrollingElement as HTMLElement | null;
    if (documentRoot && !scrollRoots.includes(documentRoot)) scrollRoots.push(documentRoot);

    const snapshots = scrollRoots.map((root) => ({
      root,
      top: root.scrollTop,
      left: root.scrollLeft,
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
    }));

    snapshots.forEach(({ root }) => {
      root.style.overflow = 'hidden';
      root.style.overscrollBehavior = 'none';
    });

    return () => {
      snapshots.forEach(({ root, top, left, overflow, overscrollBehavior }) => {
        root.style.overflow = overflow;
        root.style.overscrollBehavior = overscrollBehavior;
        root.scrollTop = top;
        root.scrollLeft = left;
      });
    };
  }, [open]);
};
