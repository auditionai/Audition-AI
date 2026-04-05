import type { Handler } from '@netlify/functions';
import { requireAuthenticatedUser } from './_supabase';
import { reviewCharacterImage } from './_vertex-character-image-review';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ReviewCharacterImageBody = {
  image?: string;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    await requireAuthenticatedUser(event);
    const body = JSON.parse(event.body || '{}') as ReviewCharacterImageBody;
    const image = String(body.image || '').trim();

    if (!image) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing image payload' }),
      };
    }

    const review = await reviewCharacterImage(image);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(review),
    };
  } catch (error: any) {
    const message = error?.message || 'Internal Server Error';
    const statusCode = /Unauthorized/i.test(message) ? 401 : 500;
    return {
      statusCode,
      headers,
      body: JSON.stringify({ error: message }),
    };
  }
};
