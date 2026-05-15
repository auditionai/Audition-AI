import type { Handler } from '@netlify/functions';
import { getServiceRoleClient } from './_supabase';
import { createSePayCheckoutFields, encodeSePayCheckoutPayload } from './_sepay';

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

const buildRedirectUrl = (
  preferredBaseUrl: string | undefined,
  clientUrl: string | undefined,
  status: string,
  orderCode: string | number,
) => {
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
  resolvedBaseUrl.searchParams.set('gateway', 'sepay');
  return resolvedBaseUrl.toString();
};

const createSePayPayment = async (event: Parameters<Handler>[0], input: any) => {
  const successUrl = buildRedirectUrl(process.env.SEPAY_SUCCESS_URL, input.clientReturnUrl, 'PAID', input.orderCode);
  const errorUrl = buildRedirectUrl(process.env.SEPAY_ERROR_URL || process.env.SEPAY_CANCEL_URL, input.clientCancelUrl, 'FAILED', input.orderCode);
  const cancelUrl = buildRedirectUrl(process.env.SEPAY_CANCEL_URL, input.clientCancelUrl, 'CANCELLED', input.orderCode);

  const checkout = createSePayCheckoutFields({
    amount: input.amount,
    orderCode: input.orderCode,
    description: input.description,
    customerId: input.buyerEmail || input.buyerName,
    successUrl,
    errorUrl,
    cancelUrl,
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

const persistPaymentGatewayMetadata = async (input: any, data: any) => {
  try {
    const admin = getServiceRoleClient();
    const transactionId = String(input.transactionId || '').trim();
    const orderCode = String(input.orderCode || '').trim();
    const providerOrderCode = Number(input.orderCode);
    const updatePayload = {
      checkout_url: data.checkoutUrl || data.checkout_url || null,
      provider_payment_link_id: data.paymentLinkId || data.payment_link_id || null,
      provider_payload: {
        gateway: 'sepay',
        sepay_order_code: orderCode || null,
        sepay_order_description: String(input.description || '').trim() || null,
        checkout_created_at: new Date().toISOString(),
      },
      payment_method: 'sepay',
      updated_at: new Date().toISOString(),
    };

    if (transactionId) {
      const { error } = await admin
        .from('payment_transactions')
        .update(updatePayload)
        .eq('id', transactionId);
      if (error) throw error;
      return;
    }

    const query = admin
      .from('payment_transactions')
      .update(updatePayload);

    if (Number.isFinite(providerOrderCode)) {
      const { error } = await query.or(`provider_order_code.eq.${providerOrderCode},order_code.eq.${orderCode}`);
      if (error) throw error;
      return;
    }

    const { error } = await query.eq('order_code', orderCode);
    if (error) throw error;
  } catch (error) {
    console.warn('[create-payment] Failed to persist payment gateway metadata:', error);
  }
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
      transactionId,
    } = body;

    if (!Number.isFinite(Number(amount)) || !orderCode || !description) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing amount, description, or orderCode' }),
      };
    }

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
      transactionId,
    };

    const data = await createSePayPayment(event, input);
    await persistPaymentGatewayMetadata(input, data);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    console.error('[create-payment] SePay checkout error:', error?.payload || error);
    return {
      statusCode: error?.status || 500,
      headers,
      body: JSON.stringify(error?.payload || { error: error?.message || 'Internal Server Error' }),
    };
  }
};
