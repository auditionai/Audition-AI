import crypto from 'crypto';

export type SePayEnv = {
  env: 'sandbox' | 'production';
  merchantId: string;
  secretKey: string;
  paymentMethod: 'BANK_TRANSFER' | 'NAPAS_BANK_TRANSFER';
};

const SIGNED_FIELDS = [
  'order_amount',
  'merchant',
  'currency',
  'operation',
  'order_description',
  'order_invoice_number',
  'customer_id',
  'payment_method',
  'success_url',
  'error_url',
  'cancel_url',
  'env',
  'agreement_id',
  'agreement_name',
  'agreement_type',
  'agreement_payment_frequency',
  'agreement_amount_per_payment',
  'order_id',
];

export const getSePayEnv = (): SePayEnv => {
  const merchantId = process.env.SEPAY_MERCHANT_ID || '';
  const secretKey = process.env.SEPAY_SECRET_KEY || '';
  const env = process.env.SEPAY_ENV === 'sandbox' ? 'sandbox' : 'production';
  const rawPaymentMethod = process.env.SEPAY_PAYMENT_METHOD || 'BANK_TRANSFER';
  const paymentMethod = rawPaymentMethod === 'NAPAS_BANK_TRANSFER' ? 'NAPAS_BANK_TRANSFER' : 'BANK_TRANSFER';

  if (!merchantId || !secretKey) {
    throw new Error('Missing SePay environment variables');
  }

  return { env, merchantId, secretKey, paymentMethod };
};

export const getSePayCheckoutUrl = (env: SePayEnv['env']) =>
  env === 'sandbox' ? 'https://pay-sandbox.sepay.vn/v1/checkout/init' : 'https://pay.sepay.vn/v1/checkout/init';

export const getSePayApiBaseUrl = (env: SePayEnv['env']) =>
  env === 'sandbox' ? 'https://pgapi-sandbox.sepay.vn/v1' : 'https://pgapi.sepay.vn/v1';

export const signSePayFields = (fields: Record<string, unknown>, secretKey: string) => {
  const signed = SIGNED_FIELDS
    .filter((field) => fields[field] !== undefined)
    .map((field) => `${field}=${fields[field] ?? ''}`);

  return crypto.createHmac('sha256', secretKey).update(signed.join(',')).digest('base64');
};

export const createSePayCheckoutFields = (
  input: {
    amount: number;
    orderCode: string | number;
    description: string;
    customerId?: string;
    successUrl: string;
    errorUrl: string;
    cancelUrl: string;
    customData?: string;
  },
  config = getSePayEnv(),
) => {
  const fields: Record<string, string | number> = {
    merchant: config.merchantId,
    operation: 'PURCHASE',
    payment_method: config.paymentMethod,
    order_invoice_number: String(input.orderCode),
    order_amount: Number(input.amount),
    currency: 'VND',
    order_description: input.description,
    ...(input.customerId ? { customer_id: input.customerId } : {}),
    success_url: input.successUrl,
    error_url: input.errorUrl,
    cancel_url: input.cancelUrl,
    ...(input.customData ? { custom_data: input.customData } : {}),
  };

  return {
    fields: {
      ...fields,
      signature: signSePayFields(fields, config.secretKey),
    },
    checkoutUrl: getSePayCheckoutUrl(config.env),
    env: config.env,
  };
};

export const encodeSePayCheckoutPayload = (payload: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

export const decodeSePayCheckoutPayload = (payload: string) =>
  JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

export const retrieveSePayOrder = async (orderCode: string | number, config = getSePayEnv()) => {
  const response = await fetch(`${getSePayApiBaseUrl(config.env)}/order/detail/${encodeURIComponent(String(orderCode))}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${config.merchantId}:${config.secretKey}`).toString('base64')}`,
    },
    signal: AbortSignal.timeout(30000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, payload };
  }

  return { ok: true, status: response.status, payload };
};

export const normalizeSePayOrderStatus = (payload: any) => {
  const rawStatus = String(
    payload?.data?.order_status ||
      payload?.data?.status ||
      payload?.data?.payment_status ||
      payload?.data?.transaction_status ||
      payload?.order_status ||
      payload?.status ||
      payload?.transaction_status ||
      payload?.transaction?.transaction_status ||
      '',
  ).toUpperCase();

  if (['PAID', 'SUCCESS', 'SUCCEEDED', 'COMPLETED', 'APPROVED', 'CAPTURED', 'SETTLED', 'AUTHORIZED'].includes(rawStatus)) {
    return 'PAID';
  }
  if (['CANCELLED', 'CANCELED', 'VOIDED'].includes(rawStatus)) {
    return 'CANCELLED';
  }
  if (['FAILED', 'ERROR', 'EXPIRED', 'REJECTED'].includes(rawStatus)) {
    return 'FAILED';
  }

  return rawStatus || 'PENDING';
};

export const parseSePayCustomData = (value: any) => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseSePayCustomData(item);
      if (parsed) return parsed;
    }
  }
  return null;
};

export const extractSePayOrderCode = (payload: any) => {
  const customData = parseSePayCustomData(payload?.order?.custom_data || payload?.custom_data || payload?.data?.custom_data);
  return String(
    payload?.order?.order_invoice_number ||
      payload?.order_invoice_number ||
      payload?.data?.order_invoice_number ||
      customData?.orderCode ||
      customData?.order_code ||
      '',
  ).trim();
};

export const extractSePayPaidAmount = (payload: any) => {
  const raw =
    payload?.order?.order_amount ||
    payload?.transaction?.transaction_amount ||
    payload?.data?.order_amount ||
    payload?.data?.transaction_amount ||
    payload?.amount ||
    null;
  if (raw == null || raw === '') return null;
  const amount = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
};
