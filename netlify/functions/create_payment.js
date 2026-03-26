import crypto from 'crypto';

export const handler = async (event, context) => {
  // Chá»‰ cháº¥p nháº­n POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const {
      amount,
      description,
      orderCode,
      returnUrl: clientReturnUrl,
      cancelUrl: clientCancelUrl,
      buyerName,
      buyerEmail,
      buyerPhone,
      items,
      expiredAt
    } = JSON.parse(event.body);
    
    // Láº¥y Env Vars tá»« Netlify
    const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
    const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
    const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;
    
    // Láº¥y URL cáº¥u hÃ¬nh tá»« Server (Æ¯u tiÃªn dÃ¹ng cÃ¡i nÃ y Ä‘á»ƒ báº£o máº­t/cá»‘ Ä‘á»‹nh domain)
    const ENV_RETURN_URL = process.env.PAYOS_RETURN_URL;
    const ENV_CANCEL_URL = process.env.PAYOS_CANCEL_URL;

    if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
      console.error("Missing PayOS Env Vars");
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Server misconfiguration: Missing PayOS keys' }) 
      };
    }

    const buildRedirectUrl = (preferredBaseUrl, clientUrl, status) => {
      const resolvedBaseUrl = preferredBaseUrl && preferredBaseUrl.startsWith('http')
        ? new URL(preferredBaseUrl)
        : new URL(clientUrl);

      if (clientUrl && clientUrl.startsWith('http')) {
        const parsedClientUrl = new URL(clientUrl);
        if (parsedClientUrl.pathname && parsedClientUrl.pathname !== '/') {
          resolvedBaseUrl.pathname = parsedClientUrl.pathname;
        }

        parsedClientUrl.searchParams.forEach((value, key) => {
          resolvedBaseUrl.searchParams.set(key, value);
        });
      }

      resolvedBaseUrl.searchParams.set('status', status);
      resolvedBaseUrl.searchParams.set('orderCode', String(orderCode));
      return resolvedBaseUrl.toString();
    };

    const finalReturnUrl = buildRedirectUrl(ENV_RETURN_URL, clientReturnUrl, 'PAID');
    const finalCancelUrl = buildRedirectUrl(ENV_CANCEL_URL, clientCancelUrl, 'CANCELLED');

    // Táº¡o chá»¯ kÃ½ (Signature)
    // PayOS yÃªu cáº§u sáº¯p xáº¿p key theo alphabet
    const signatureData = {
        amount,
        cancelUrl: finalCancelUrl,
        description,
        orderCode,
        returnUrl: finalReturnUrl
    };

    const sortedKeys = Object.keys(signatureData).sort();
    const signString = sortedKeys.map(key => {
        const val = signatureData[key];
        return `${key}=${val === null || val === undefined ? '' : val}`;
    }).join('&');

    const signature = crypto.createHmac('sha256', PAYOS_CHECKSUM_KEY)
      .update(signString)
      .digest('hex');

    // Body gá»­i sang PayOS
    const requestBody = {
      ...signatureData,
      signature,
      buyerName,
      buyerEmail,
      buyerPhone,
      items,
      expiredAt
    };

    console.log("Creating PayOS Link with returnUrl:", finalReturnUrl);

    // Gá»i API PayOS
    const response = await fetch('https://api-merchant.payos.vn/v2/payment-requests', {
      method: 'POST',
      headers: {
        'x-client-id': PAYOS_CLIENT_ID,
        'x-api-key': PAYOS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const resData = await response.json();

    if (resData.code !== "00") {
       console.error("PayOS Error:", resData);
       return { statusCode: 400, body: JSON.stringify(resData) };
    }

    // Tráº£ vá» checkoutUrl
    return {
      statusCode: 200,
      body: JSON.stringify(resData.data) 
    };

  } catch (error) {
    console.error("Function Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
