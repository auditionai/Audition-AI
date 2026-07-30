type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export const scheduleDeferredBrowserTask = (task: () => void, timeout = 1_500) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const idleWindow = window as IdleWindow;
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(task, { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(task, Math.min(timeout, 300));
  return () => window.clearTimeout(handle);
};
