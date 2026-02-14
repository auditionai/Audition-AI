import crypto from 'crypto';

export const handler = async (event, context) => {
  // Chỉ chấp nhận POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { amount, description, orderCode, returnUrl: clientReturnUrl, cancelUrl: clientCancelUrl } = JSON.parse(event.body);
    
    // Lấy Env Vars từ Netlify
    const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
    const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
    const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;
    
    // Lấy URL cấu hình từ Server (Ưu tiên dùng cái này để bảo mật/cố định domain)
    const ENV_RETURN_URL = process.env.PAYOS_RETURN_URL;
    const ENV_CANCEL_URL = process.env.PAYOS_CANCEL_URL;

    if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
      console.error("Missing PayOS Env Vars");
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Server misconfiguration: Missing PayOS keys' }) 
      };
    }

    // Xử lý Logic URL:
    // Nếu có biến môi trường PAYOS_RETURN_URL, ta dùng nó làm base và nối query string vào.
    // Nếu không (ví dụ localhost), ta dùng URL do client gửi lên.
    let finalReturnUrl = clientReturnUrl;
    let finalCancelUrl = clientCancelUrl;

    if (ENV_RETURN_URL && ENV_RETURN_URL.startsWith('http')) {
        // Loại bỏ slash cuối nếu có để tránh double slash
        const baseUrl = ENV_RETURN_URL.replace(/\/$/, "");
        finalReturnUrl = `${baseUrl}/?status=PAID&orderCode=${orderCode}`;
    }

    if (ENV_CANCEL_URL && ENV_CANCEL_URL.startsWith('http')) {
        const baseUrl = ENV_CANCEL_URL.replace(/\/$/, "");
        finalCancelUrl = `${baseUrl}/?status=CANCELLED&orderCode=${orderCode}`;
    }

    // Tạo chữ ký (Signature)
    // PayOS yêu cầu sắp xếp key theo alphabet
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

    // Body gửi sang PayOS
    const requestBody = { ...signatureData, signature };

    console.log("Creating PayOS Link with returnUrl:", finalReturnUrl);

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