import type { Handler } from '@netlify/functions';
import { GROK_MODEL, createGrokClient, getGrokApiKey, isGrokApiKey } from './_grok';
import { requireAdminUser } from './_supabase';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    await requireAdminUser(event);
    const suppliedKey = String(JSON.parse(event.body || '{}')?.key || '').trim();
    if (suppliedKey && !isGrokApiKey(suppliedKey)) throw new Error('A valid OpenAI-compatible API key is required.');
    const apiKey = suppliedKey || await getGrokApiKey();
    await createGrokClient(apiKey).chat.completions.create({
      model: GROK_MODEL,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 4,
      temperature: 0,
    }, { timeout: 15_000 });
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }) };
  }
};
