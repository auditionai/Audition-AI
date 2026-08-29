import { getSupabaseAuthHeader } from './supabaseClient';

type ConnectionResult = { success: boolean; message?: string };

const callGrok = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getSupabaseAuthHeader()) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(path === 'grok-health' ? 20_000 : 45_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error || `Grok request failed (${response.status})`));
  return data;
};

// Compatibility filename for existing lazy-loaded Admin code. The service has
// no Google SDK or Vertex request path: all analysis runs server-side on Grok.
export const analyzeStyleImage = async (imageBase64: string): Promise<string> => {
  const data = await callGrok('grok-style-analysis', { image: imageBase64 });
  return String(data?.analysis || '').trim();
};

export const checkConnection = async (key?: string): Promise<ConnectionResult> => {
  try {
    const data = await callGrok('grok-health', key ? { key } : {});
    return { success: data?.success === true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }
};

export const testApiKey = async (): Promise<boolean> => (await checkConnection()).success;
