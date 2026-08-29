import type { Handler } from '@netlify/functions';
import { grokText } from './_grok';
import { requireAdminUser } from './_supabase';

const parseImage = (source: string) => {
  const match = source.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('A base64 image is required.');
  return { mimeType: match[1], data: match[2] };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    await requireAdminUser(event);
    const image = parseImage(String(JSON.parse(event.body || '{}')?.image || ''));
    const analysis = await grokText('Analyze this image visual style for a 3D character generator. Return concise comma-separated keywords covering lighting, texture, rendering-engine feel, and artistic mood.', [image], 300, { timeoutMs: 30_000 });
    return { statusCode: 200, body: JSON.stringify({ analysis }) };
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) };
  }
};
