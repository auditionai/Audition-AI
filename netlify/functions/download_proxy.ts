import { stream, type StreamingHandler } from '@netlify/functions';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const sanitizeFilename = (value?: string | null) => {
  const fallback = 'download';
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;

  return trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 180) || fallback;
};

const getFilenameFromUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    const lastSegment = parsedUrl.pathname.split('/').filter(Boolean).pop();
    return sanitizeFilename(lastSegment);
  } catch {
    return 'download';
  }
};

const buildAttachmentHeaders = (response: Response, filename: string) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
    'Cache-Control': 'private, no-store',
  };

  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    headers['Content-Length'] = contentLength;
  }

  return headers;
};

const handlerImpl: StreamingHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...jsonHeaders,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const url = event.queryStringParameters?.url;
  const requestedFilename = event.queryStringParameters?.filename;

  if (!url) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Missing url parameter' }),
    };
  }

  try {
    const upstreamResponse = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(120000),
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return {
        statusCode: upstreamResponse.status || 502,
        headers: jsonHeaders,
        body: JSON.stringify({ error: `Failed to fetch asset: ${upstreamResponse.status} ${upstreamResponse.statusText}` }),
      };
    }

    const filename = sanitizeFilename(requestedFilename) || getFilenameFromUrl(url);

    return {
      statusCode: 200,
      headers: buildAttachmentHeaders(upstreamResponse, filename),
      body: upstreamResponse.body,
    };
  } catch (error: any) {
    console.error('Proxy Download Error:', error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: error?.message || 'Download proxy failed' }),
    };
  }
};

export const handler = stream(handlerImpl);
