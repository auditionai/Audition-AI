export const GA_MEASUREMENT_ID = 'G-32R3PLY2JT';

type GtagCommand = 'config' | 'event' | 'js' | 'set';
type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: GtagCommand, target: string | Date | AnalyticsParams, params?: AnalyticsParams) => void;
  }
}

const isBrowser = () => typeof window !== 'undefined';

const cleanParams = (params: AnalyticsParams = {}) => {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
};

export const trackEvent = (eventName: string, params: AnalyticsParams = {}) => {
  if (!isBrowser() || typeof window.gtag !== 'function') return;

  try {
    window.gtag('event', eventName, {
      app_name: 'audition_ai',
      ...cleanParams(params),
    });
  } catch (error) {
    console.warn('[Analytics] Failed to track event', eventName, error);
  }
};

export const trackPageView = (path?: string, title?: string) => {
  if (!isBrowser() || typeof window.gtag !== 'function') return;

  try {
    window.gtag('event', 'page_view', {
      page_path: path || `${window.location.pathname}${window.location.search}`,
      page_location: window.location.href,
      page_title: title || document.title,
      app_name: 'audition_ai',
    });
  } catch (error) {
    console.warn('[Analytics] Failed to track page view', error);
  }
};

export const setAnalyticsUser = (userId?: string | null) => {
  if (!isBrowser() || typeof window.gtag !== 'function') return;

  try {
    window.gtag('set', { user_id: userId || null });
  } catch (error) {
    console.warn('[Analytics] Failed to set user id', error);
  }
};
