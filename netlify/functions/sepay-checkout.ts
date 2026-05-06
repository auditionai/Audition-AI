import type { Handler } from '@netlify/functions';
import { decodeSePayCheckoutPayload } from './_sepay';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const handler: Handler = async (event) => {
  try {
    const encodedPayload = event.queryStringParameters?.payload || '';
    if (!encodedPayload) {
      return { statusCode: 400, body: 'Missing checkout payload' };
    }

    const payload = decodeSePayCheckoutPayload(encodedPayload);
    const checkoutUrl = String(payload.checkoutUrl || '');
    const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : null;

    if (!checkoutUrl.startsWith('https://pay.sepay.vn/') && !checkoutUrl.startsWith('https://pay-sandbox.sepay.vn/')) {
      return { statusCode: 400, body: 'Invalid SePay checkout URL' };
    }
    if (!fields) {
      return { statusCode: 400, body: 'Invalid SePay checkout fields' };
    }

    const inputs = Object.entries(fields)
      .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
      .join('\n');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Đang chuyển sang SePay...</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080811;color:#fff;font-family:Arial,sans-serif}
      .box{max-width:420px;padding:28px;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:#12121a;text-align:center}
      button{margin-top:18px;padding:12px 18px;border:0;border-radius:12px;background:#10b981;color:#00130c;font-weight:700;cursor:pointer}
      p{color:#b8bdd1}
    </style>
  </head>
  <body>
    <form id="sepayForm" class="box" action="${escapeHtml(checkoutUrl)}" method="POST">
      <h1>Đang chuyển sang SePay</h1>
      <p>Nếu trình duyệt không tự chuyển, hãy bấm nút bên dưới.</p>
      ${inputs}
      <button type="submit">Mở cổng thanh toán SePay</button>
    </form>
    <script>document.getElementById('sepayForm').submit();</script>
  </body>
</html>`,
    };
  } catch (error: any) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error?.message || 'Invalid SePay checkout payload' }),
    };
  }
};
