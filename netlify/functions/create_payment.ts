import crypto from 'crypto';
import type { Handler } from '@netlify/functions';
import { getServiceRoleClient } from './_supabase';
import { createSePayCheckoutFields, encodeSePayCheckoutPayload } from './_sepay';

type PaymentGateway = 'sepay' | 'payos';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const getOrigin = (event: Parameters<Handler>[0]) => {
  const host = event.headers.host || event.headers.Host;
  const proto = event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'] || 'https';
  return host ? `${proto}://${host}` : 'https://auditionai.io.vn';
};

const normalizeGateway = (value: unknown): PaymentGateway | null => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'sepay' || raw === 'payos') return raw;
  return null;
};

const getConfiguredPaymentGateway = async (): Promise<PaymentGateway> => {
  try {
    const admin = getServiceRoleClient();
    const { data, error } = await admin
      .from('system_settings')
      .select('value')
      .eq('key', 'payment_gateway')
      .maybeSingle();

    if (error) throw error;
    const configured = normalizeGateway(data?.value?.gateway || data?.value?.activeGateway || data?.value);
    if (configured) return configured;
  } catch (error) {
    console.warn('[create-payment] Failed to read payment_gateway setting, falling back to env/default:', error);
  }

  return normalizeGateway(process.env.PAYMENT_GATEWAY) || 'sepay';
};

const buildRedirectUrl = (preferredBaseUrl: string | undefined, clientUrl: string | undefined, status: string, orderCode: string | number, gateway: PaymentGateway) => {
  const fallbackBase = clientUrl && clientUrl.startsWith('http') ? clientUrl : 'https://auditionai.io.vn/topup';
  const resolvedBaseUrl = preferredBaseUrl && preferredBaseUrl.startsWith('http')
    ? new URL(preferredBaseUrl)
    : new URL(fallbackBase);

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
  resolvedBaseUrl.searchParams.set('gateway', gateway);
  return resolvedBaseUrl.toString();
};

const createPayOSPayment = async (input: any) => {
  const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
  const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
  const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

  if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
    throw new Error('Server misconfiguration: Missing PayOS keys');
  }

  const finalReturnUrl = buildRedirectUrl(process.env.PAYOS_RETURN_URL, input.clientReturnUrl, 'PAID', input.orderCode, 'payos');
  const finalCancelUrl = buildRedirectUrl(process.env.PAYOS_CANCEL_URL, input.clientCancelUrl, 'CANCELLED', input.orderCode, 'payos');

  const signatureData = {
    amount: input.amount,
    cancelUrl: finalCancelUrl,
    description: input.description,
    orderCode: input.orderCode,
    returnUrl: finalReturnUrl,
  };

  const signString = Object.keys(signatureData)
    .sort()
    .map((key) => {
      const val = signatureData[key as keyof typeof signatureData];
      return `${key}=${val === null || val === undefined ? '' : val}`;
    })
    .join('&');

  const signature = crypto.createHmac('sha256', PAYOS_CHECKSUM_KEY).update(signString).digest('hex');

  const response = await fetch('https://api-merchant.payos.vn/v2/payment-requests', {
    method: 'POST',
    headers: {
      'x-client-id': PAYOS_CLIENT_ID,
      'x-api-key': PAYOS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...signatureData,
      signature,
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      buyerPhone: input.buyerPhone,
      items: input.items,
      expiredAt: input.expiredAt,
    }),
  });

  const resData = await response.json();
  if (resData.code !== '00') {
    const error = new Error(resData?.desc || resData?.error || 'PayOS rejected payment request') as Error & { payload?: any; status?: number };
    error.payload = resData;
    error.status = 400;
    throw error;
  }

  return {
    ...resData.data,
    paymentGateway: 'payos',
    paymentMethod: 'payos',
  };
};

const createSePayPayment = async (event: Parameters<Handler>[0], input: any) => {
  const successUrl = buildRedirectUrl(process.env.SEPAY_SUCCESS_URL, input.clientReturnUrl, 'PAID', input.orderCode, 'sepay');
  const errorUrl = buildRedirectUrl(process.env.SEPAY_ERROR_URL || process.env.SEPAY_CANCEL_URL, input.clientCancelUrl, 'FAILED', input.orderCode, 'sepay');
  const cancelUrl = buildRedirectUrl(process.env.SEPAY_CANCEL_URL, input.clientCancelUrl, 'CANCELLED', input.orderCode, 'sepay');

  const checkout = createSePayCheckoutFields({
    amount: input.amount,
    orderCode: input.orderCode,
    description: input.description,
    customerId: input.buyerEmail || input.buyerName,
    successUrl,
    errorUrl,
    cancelUrl,
    customData: JSON.stringify({
      orderCode: String(input.orderCode),
      package: input.items?.[0]?.name || '',
    }),
  });

  const payload = encodeSePayCheckoutPayload({
    checkoutUrl: checkout.checkoutUrl,
    fields: checkout.fields,
  });

  return {
    checkoutUrl: `${getOrigin(event)}/api/sepay-checkout?payload=${encodeURIComponent(payload)}`,
    paymentGateway: 'sepay',
    paymentMethod: 'sepay',
    paymentLinkId: `sepay:${input.orderCode}`,
    orderCode: String(input.orderCode),
    sepayEnv: checkout.env,
  };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
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
      expiredAt,
    } = body;

    if (!Number.isFinite(Number(amount)) || !orderCode || !description) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing amount, description, or orderCode' }),
      };
    }

    const gateway = await getConfiguredPaymentGateway();
    const input = {
      amount: Number(amount),
      description: String(description),
      orderCode,
      clientReturnUrl,
      clientCancelUrl,
      buyerName,
      buyerEmail,
      buyerPhone,
      items,
      expiredAt,
    };

    const data = gateway === 'payos'
      ? await createPayOSPayment(input)
      : await createSePayPayment(event, input);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    console.error('[create-payment] Payment gateway error:', error?.payload || error);
    return {
      statusCode: error?.status || 500,
      headers,
      body: JSON.stringify(error?.payload || { error: error?.message || 'Internal Server Error' }),
    };
  }
};
