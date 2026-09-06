import OpenAI from 'openai';
import { getServiceRoleClient } from './_supabase';

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = 'https://sub.digishop.work/v1';
export const OPENAI_COMPATIBLE_BASE_URL = (process.env.OPENAI_COMPATIBLE_BASE_URL || DEFAULT_OPENAI_COMPATIBLE_BASE_URL)
  .trim()
  .replace(/\/+$/, '');
export const GROK_MODEL = process.env.CLAUDE_MODEL?.trim() || 'claude-sonnet-4-6';
export const GROK_DEFAULT_TIMEOUT_MS = Number(process.env.CLAUDE_REQUEST_TIMEOUT_MS || process.env.GROK_REQUEST_TIMEOUT_MS || 120_000);
const parseBoundedTimeout = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(600_000, Math.max(30_000, Math.round(parsed)));
};
// Queue workers can wait longer than browser-facing functions. Keep a finite
// ceiling so an unavailable upstream cannot occupy a worker indefinitely.
export const GROK_BACKGROUND_TIMEOUT_MS = parseBoundedTimeout(process.env.CLAUDE_BACKGROUND_TIMEOUT_MS || process.env.GROK_BACKGROUND_TIMEOUT_MS, 300_000);
export type GrokImageInput = {
  mimeType?: string;
  data?: string;
  url?: string;
};
const MAX_VISION_IMAGE_BYTES = 8 * 1024 * 1024;
type GrokRequestOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};
// The gateway issues its own OpenAI-compatible keys; Claude keys use the same
// transport and do not require an Anthropic-specific prefix.
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

const toVisionDataUrl = async (image: GrokImageInput) => {
  const direct = String(image.data || '').trim();
  if (direct) return `data:${image.mimeType || 'image/jpeg'};base64,${direct.replace(/^data:[^,]+,/, '')}`;
  const source = String(image.url || '').trim();
  if (!source) throw new Error('CLAUDE_VISION_IMAGE_MISSING: Reference image is empty.');
  const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`CLAUDE_VISION_IMAGE_FETCH_FAILED: ${response.status}`);
  const contentType = String(response.headers.get('content-type') || 'image/jpeg').split(';', 1)[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error('CLAUDE_VISION_IMAGE_INVALID: Source is not an image.');
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_VISION_IMAGE_BYTES) throw new Error('CLAUDE_VISION_IMAGE_TOO_LARGE: Maximum size is 8 MB.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_VISION_IMAGE_BYTES) throw new Error('CLAUDE_VISION_IMAGE_INVALID: Image is empty or too large.');
  return `data:${contentType};base64,${bytes.toString('base64')}`;
};

export const getGrokApiKey = async () => {
  const environmentKey = String(process.env.CLAUDE_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY || '').trim();
  if (environmentKey) {
    if (!isGrokApiKey(environmentKey)) throw new Error('CLAUDE_NOT_CONFIGURED: The Claude API key is invalid.');
    return environmentKey;
  }

  const { data, error } = await getServiceRoleClient()
    .from('api_keys')
    .select('id, key_value, last_used_at')
    .eq('status', 'active')
    .ilike('name', '[CLAUDE]%')
    .order('last_used_at', { ascending: true, nullsFirst: true });
  if (error) throw error;
  const row = (data || []).find((candidate) => isGrokApiKey(candidate.key_value));
  const key = String(row?.key_value || '').trim();
  if (!key) throw new Error('CLAUDE_NOT_CONFIGURED: Add an active [CLAUDE] API key in Admin Settings or set CLAUDE_API_KEY.');
  if (row?.id) void getServiceRoleClient().from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);
  return key;
};

export const grokJson = async <T>(
  instruction: string,
  images: GrokImageInput[] = [],
  maxTokens = 2048,
  options: GrokRequestOptions = {},
): Promise<T> => {
  const apiKey = await getGrokApiKey();
  const client = createGrokClient(apiKey);
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: instruction }];
  for (const url of await Promise.all(images.map(toVisionDataUrl))) {
    content.push({ type: 'image_url', image_url: { url } });
  }
  const response = await client.chat.completions.create({
    model: GROK_MODEL,
    messages: [{ role: 'user', content }],
    temperature: 0,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  }, options.timeoutMs || options.signal ? { timeout: options.timeoutMs, signal: options.signal } : undefined);
  const text = String(response.choices[0]?.message?.content || '').trim();
  if (!text) throw new Error('Grok returned an empty response.');
  return JSON.parse(extractJson(text)) as T;
};

export const grokText = async (
  instruction: string,
  images: GrokImageInput[] = [],
  maxTokens = 4096,
  options: GrokRequestOptions = {},
) => {
  const apiKey = await getGrokApiKey();
  const client = createGrokClient(apiKey);
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: instruction }];
  for (const url of await Promise.all(images.map(toVisionDataUrl))) {
    content.push({ type: 'image_url', image_url: { url } });
  }
  const response = await client.chat.completions.create({
    model: GROK_MODEL,
    messages: [{ role: 'user', content }],
    temperature: 0.2,
    max_tokens: maxTokens,
  }, options.timeoutMs || options.signal ? { timeout: options.timeoutMs, signal: options.signal } : undefined);
  const text = String(response.choices[0]?.message?.content || '').trim();
  if (!text) throw new Error('Grok returned an empty response.');
  return text;
};
