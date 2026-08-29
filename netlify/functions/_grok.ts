import { getServiceRoleClient } from './_supabase';

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
export const GROK_MODEL = process.env.GROK_MODEL?.trim() || 'grok-4-1-fast-reasoning';

const extractJson = (value: string) => {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  const start = candidate.search(/[\[{]/);
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  return start >= 0 && end >= start ? candidate.slice(start, end + 1) : candidate;
};

export const getGrokApiKey = async () => {
  const environmentKey = String(process.env.GROK_API_KEY || '').trim();
  if (environmentKey) return environmentKey;

  const { data, error } = await getServiceRoleClient()
    .from('api_keys')
    .select('id, key_value')
    .eq('status', 'active')
    .ilike('name', '[GROK]%')
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const key = String(data?.key_value || '').trim();
  if (!key) throw new Error('GROK_NOT_CONFIGURED: Add a Grok API key in Admin Settings or set GROK_API_KEY.');
  if (data?.id) void getServiceRoleClient().from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return key;
};

export const grokJson = async <T>(instruction: string, images: Array<{ mimeType: string; data: string }> = [], maxTokens = 2048): Promise<T> => {
  const apiKey = await getGrokApiKey();
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: instruction }];
  for (const image of images) {
    content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  }
  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROK_MODEL, messages: [{ role: 'user', content }], temperature: 0, max_tokens: maxTokens, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`Grok API error ${response.status}: ${(await response.text()).slice(0, 700)}`);
  const data = await response.json();
  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('Grok returned an empty response.');
  return JSON.parse(extractJson(text)) as T;
};

export const grokText = async (instruction: string, images: Array<{ mimeType: string; data: string }> = [], maxTokens = 4096) => {
  const apiKey = await getGrokApiKey();
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: instruction }];
  for (const image of images) content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  const response = await fetch(GROK_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: GROK_MODEL, messages: [{ role: 'user', content }], temperature: 0.2, max_tokens: maxTokens }), signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Grok API error ${response.status}: ${(await response.text()).slice(0, 700)}`);
  const data = await response.json();
  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('Grok returned an empty response.');
  return text;
};
