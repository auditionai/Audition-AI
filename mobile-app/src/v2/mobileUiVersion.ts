import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export type MobileUiVersion = 'v1' | 'v2';

const STORAGE_KEY = 'auditionai:mobile-ui-preview';

const readStoredVersion = (): MobileUiVersion => {
  if (typeof window === 'undefined') return 'v1';
  return window.sessionStorage.getItem(STORAGE_KEY) === 'v2' ? 'v2' : 'v1';
};

export function useMobileUiVersion(): MobileUiVersion {
  const location = useLocation();
  const requestedVersion = new URLSearchParams(location.search).get('mobile-ui');
  const version: MobileUiVersion = requestedVersion === 'v2'
    ? 'v2'
    : requestedVersion === 'v1'
      ? 'v1'
      : readStoredVersion();

  useEffect(() => {
    if (requestedVersion === 'v2') {
      window.sessionStorage.setItem(STORAGE_KEY, 'v2');
    } else if (requestedVersion === 'v1') {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [requestedVersion]);

  return version;
}
