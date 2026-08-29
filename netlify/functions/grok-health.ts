import type { Handler } from '@netlify/functions';
import { GROK_MODEL, getGrokApiKey } from './_grok';
import { requireAdminUser } from './_supabase';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    await requireAdminUser(event);
    const suppliedKey = String(JSON.parse(event.body || '{}')?.key || '').trim();
    const apiKey = suppliedKey || await getGrokApiKey();
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GROK_MODEL, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 4, temperature: 0 }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Grok API error ${response.status}: ${(await response.text()).slice(0, 400)}`);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }) };
  }
};
