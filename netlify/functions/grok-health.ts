import type { Handler } from '@netlify/functions';
import { createClaudeClient, getClaudeApiKey, isClaudeApiKey } from './_grok';
import { requireAdminUser } from './_supabase';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    await requireAdminUser(event);
    const suppliedKey = String(JSON.parse(event.body || '{}')?.key || '').trim();
    if (suppliedKey && !isClaudeApiKey(suppliedKey)) throw new Error('A valid Claude API key is required.');
    const apiKey = suppliedKey || await getClaudeApiKey();
    // Listing models validates the same gateway and bearer key without waiting for
    // a Grok inference request, which can exceed the admin health-check budget.
    await createClaudeClient(apiKey).models.list({ timeout: 15_000 });
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }) };
  }
};
