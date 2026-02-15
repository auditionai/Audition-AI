
export const handler = async (event, context) => {
  // Chỉ chấp nhận GET
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { url } = event.queryStringParameters;

  if (!url) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing url parameter" }) };
  }

  try {
    // Fetch image from the external URL (R2/Supabase)
    // Server-to-Server fetch is not subject to Browser CORS policies
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*', // Allow all domains to call this proxy
        'Cache-Control': 'public, max-age=31536000, immutable'
      },
      body: base64,
      isBase64Encoded: true
    };

  } catch (error) {
    console.error("Proxy Download Error:", error);
    return { 
        statusCode: 500, 
        body: JSON.stringify({ error: error.message }) 
    };
  }
};
