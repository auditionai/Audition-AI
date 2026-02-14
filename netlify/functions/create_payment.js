import crypto from 'crypto';

export const handler = async (event, context) => {
  // Chỉ chấp nhận POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { amount, description, orderCode, returnUrl, cancelUrl } = JSON.parse(event.body);
    
    // Lấy Env Vars từ Netlify
    const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
    const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
    const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

    if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
      console.error("Missing PayOS Env Vars");
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Server misconfiguration: Missing PayOS keys' }) 
      };
    }

    // Tạo chữ ký (Signature)
    // PayOS yêu cầu sắp xếp key theo alphabet
    const signatureData = {
        amount,
        cancelUrl,
        description,
        orderCode,
        returnUrl
    };

    const sortedKeys = Object.keys(signatureData).sort();
    const signString = sortedKeys.map(key => {
        const val = signatureData[key];
        return `${key}=${val === null || val === undefined ? '' : val}`;
    }).join('&');

    const signature = crypto.createHmac('sha256', PAYOS_CHECKSUM_KEY)
      .update(signString)
      .digest('hex');

    // Body gửi sang PayOS
    const requestBody = { ...signatureData, signature };

    // Gọi API PayOS
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

    // Trả về checkoutUrl
    return {
      statusCode: 200,
      body: JSON.stringify(resData.data) 
    };

  } catch (error) {
    console.error("Function Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};