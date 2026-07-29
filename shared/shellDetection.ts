export type AppShell = 'mobile' | 'desktop';

const MOBILE_VIEWPORT_MAX_WIDTH = 767;
const SHELL_OVERRIDE_STORAGE_KEY = 'auditionai:shell-override';
const LEGACY_SHELL_PREFERENCE_STORAGE_KEY = 'auditionai:shell-preference';

const clearPersistedShellPreferences = () => {
  if (typeof window === 'undefined') return;

  try {
    // URL preview flags used to be persisted. That could leave one browser
    // profile permanently stuck on the wrong shell after the URL changed.
    window.localStorage.removeItem(SHELL_OVERRIDE_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_SHELL_PREFERENCE_STORAGE_KEY);
  } catch {
    // Viewport detection still works when storage is unavailable.
  }
};

const getExplicitShell = (): AppShell | null => {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  if (params.get('desktop') === '1') return 'desktop';
  if (params.get('mobile') === '1') return 'mobile';
  return null;
};

const getViewportWidth = () => {
  if (typeof window === 'undefined') return Number.POSITIVE_INFINITY;

  const documentWidth = document.documentElement?.clientWidth;
  if (typeof documentWidth === 'number' && documentWidth > 0) {
    return Math.min(window.innerWidth, documentWidth);
  }

  return window.innerWidth;
};

export const resolveAppShell = (): AppShell => {
  if (typeof window === 'undefined') return 'desktop';

  const explicitShell = getExplicitShell();
  clearPersistedShellPreferences();

  if (explicitShell) return explicitShell;
  return getViewportWidth() <= MOBILE_VIEWPORT_MAX_WIDTH ? 'mobile' : 'desktop';
};

export const shouldUseMobileShell = () => resolveAppShell() === 'mobile';
