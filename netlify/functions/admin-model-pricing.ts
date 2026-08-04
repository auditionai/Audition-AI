import type { Handler } from '@netlify/functions';
import { getAuthenticatedRequestErrorStatus, getServiceRoleClient, requireAdminUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PricingInput = {
  model_id?: unknown;
  option_id?: unknown;
  tst_price_credits?: unknown;
  audition_price_vcoin?: unknown;
};

const normalizePricingRow = (input: PricingInput) => {
  const modelId = String(input?.model_id || '').trim();
  const optionId = String(input?.option_id || '').trim();
  const providerCredits = Number(input?.tst_price_credits || 0);
  const auditionPrice = Number(input?.audition_price_vcoin);

  if (!modelId || modelId.length > 160) throw new Error('MODEL_ID_INVALID');
  if (!optionId || optionId.length > 300) throw new Error('OPTION_ID_INVALID');
  if (!Number.isFinite(providerCredits) || providerCredits < 0) throw new Error('PROVIDER_PRICE_INVALID');
  if (!Number.isFinite(auditionPrice) || auditionPrice <= 0) throw new Error('AUDITION_PRICE_INVALID');

  return {
    model_id: modelId,
    option_id: optionId,
    tst_price_credits: providerCredits,
    audition_price_vcoin: auditionPrice,
    updated_at: new Date().toISOString(),
  };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) };
  }

  try {
    await requireAdminUser(event);
    const body = JSON.parse(event.body || '{}');
    const rawRows = Array.isArray(body?.rows) ? body.rows : body?.pricing ? [body.pricing] : [];
    if (!rawRows.length) throw new Error('PRICING_ROWS_REQUIRED');
    if (rawRows.length > 1000) throw new Error('TOO_MANY_PRICING_ROWS');

    const rows = rawRows.map(normalizePricingRow);
    const admin = getServiceRoleClient();
    const { data, error } = await admin
      .from('model_pricing')
      .upsert(rows, { onConflict: 'model_id,option_id' })
      .select('id, model_id, option_id, tst_price_credits, audition_price_vcoin, updated_at');

    if (error) throw error;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, saved: data?.length || rows.length, data: data || [] }),
    };
  } catch (error: any) {
    const message = error?.message || 'Internal Server Error';
    const validationError = /^(MODEL_ID|OPTION_ID|PROVIDER_PRICE|AUDITION_PRICE|PRICING_ROWS|TOO_MANY)/.test(message);
    return {
      statusCode: validationError ? 400 : getAuthenticatedRequestErrorStatus(error, message === 'Forbidden' ? 403 : 500),
      headers,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
