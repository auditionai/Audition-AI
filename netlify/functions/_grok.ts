import OpenAI from 'openai';
import { getServiceRoleClient } from './_supabase';

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = 'https://sub.digishop.work/v1';
export const OPENAI_COMPATIBLE_BASE_URL = (process.env.OPENAI_COMPATIBLE_BASE_URL || DEFAULT_OPENAI_COMPATIBLE_BASE_URL)
  .trim()
  .replace(/\/+$/, '');
export const GROK_MODEL = process.env.GROK_MODEL?.trim() || 'grok-4.5';
export const GROK_DEFAULT_TIMEOUT_MS = Number(process.env.GROK_REQUEST_TIMEOUT_MS || 120_000);
const parseBoundedTimeout = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(600_000, Math.max(30_000, Math.round(parsed)));
};
// Queue workers can wait longer than browser-facing functions. Keep a finite
// ceiling so an unavailable upstream cannot occupy a worker indefinitely.
export const GROK_BACKGROUND_TIMEOUT_MS = parseBoundedTimeout(process.env.GROK_BACKGROUND_TIMEOUT_MS, 300_000);
// The gateway issues its own OpenAI-compatible keys, so xAI's `xai-` prefix is not required.
export const isGrokApiKey = (value: unknown) => {
  const key = String(value || '').trim();
  return key.length >= 8 && !/\s/.test(key) && !key.startsWith('{');
};

export const createGrokClient = (apiKey: string) => new OpenAI({
  apiKey,
  baseURL: OPENAI_COMPATIBLE_BASE_URL,
  timeout: Number.isFinite(GROK_DEFAULT_TIMEOUT_MS) && GROK_DEFAULT_TIMEOUT_MS > 0 ? GROK_DEFAULT_TIMEOUT_MS : 120_000,
  maxRetries: 0,
});

const extractJson = (value: string) => {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  const start = candidate.search(/[\[{]/);
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  return start >= 0 && end >= start ? candidate.slice(start, end + 1) : candidate;
};

export const getGrokApiKey = async () => {
  const environmentKey = String(process.env.OPENAI_COMPATIBLE_API_KEY || process.env.GROK_API_KEY || '').trim();
  if (environmentKey) {
    if (!isGrokApiKey(environmentKey)) throw new Error('GROK_NOT_CONFIGURED: The OpenAI-compatible API key is invalid.');
    return environmentKey;
  }

  const { data, error } = await getServiceRoleClient()
    .from('api_keys')
    .select('id, key_value, last_used_at')
    .eq('status', 'active')
    .ilike('name', '[GROK]%')
    .order('last_used_at', { ascending: true, nullsFirst: true });
  if (error) throw error;
  const row = (data || []).find((candidate) => isGrokApiKey(candidate.key_value));
  const key = String(row?.key_value || '').trim();
  if (!key) throw new Error('GROK_NOT_CONFIGURED: Add an active [GROK] OpenAI-compatible API key in Admin Settings or set OPENAI_COMPATIBLE_API_KEY.');
  if (row?.id) void getServiceRoleClient().from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);
  return key;
};

export const grokJson = async <T>(
  instruction: string,
  images: Array<{ mimeType: string; data: string }> = [],
  maxTokens = 2048,
  options: { timeoutMs?: number } = {},
): Promise<T> => {
  const apiKey = await getGrokApiKey();
  const client = createGrokClient(apiKey);
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: instruction }];
  for (const image of images) {
    content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  }
  const response = await client.chat.completions.create({
    model: GROK_MODEL,
    messages: [{ role: 'user', content }],
    temperature: 0,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  }, options.timeoutMs ? { timeout: options.timeoutMs } : undefined);
  const text = String(response.choices[0]?.message?.content || '').trim();
  if (!text) throw new Error('Grok returned an empty response.');
  return JSON.parse(extractJson(text)) as T;
};

export const grokText = async (
  instruction: string,
  images: Array<{ mimeType: string; data: string }> = [],
  maxTokens = 4096,
  options: { timeoutMs?: number } = {},
) => {
  const apiKey = await getGrokApiKey();
  const client = createGrokClient(apiKey);
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: instruction }];
  for (const image of images) content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  const response = await client.chat.completions.create({
    model: GROK_MODEL,
    messages: [{ role: 'user', content }],
    temperature: 0.2,
    max_tokens: maxTokens,
  }, options.timeoutMs ? { timeout: options.timeoutMs } : undefined);
  const text = String(response.choices[0]?.message?.content || '').trim();
  if (!text) throw new Error('Grok returned an empty response.');
  return text;
};
