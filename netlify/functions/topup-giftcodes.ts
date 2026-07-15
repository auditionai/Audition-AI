import type { Handler } from '@netlify/functions';
import { randomInt } from 'node:crypto';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const buildRandomTopupGiftcode = (discountPercent: number) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const suffix = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return suffix;
};

const FIRST_TOPUP_GIFTCODE_ELIGIBLE_FROM_MS = Date.parse('2026-06-01T00:00:00+07:00');

const isFirstTopupEligibleCreatedAt = (createdAt?: string | null) => {
  if (!createdAt) return false;
  const createdAtMs = new Date(createdAt).getTime();
  return Number.isFinite(createdAtMs) && createdAtMs >= FIRST_TOPUP_GIFTCODE_ELIGIBLE_FROM_MS;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { user } = await requireAuthenticatedUser(event, { checkAccountStatus: false });
    const admin = getServiceRoleClient();
    const nowIso = new Date().toISOString();
    const [templateResult, concreteResult, profileResult] = await Promise.all([
      admin.rpc('get_topup_giftcode_template_availability', { p_user_id: user.id }),
      admin.rpc('get_available_topup_giftcodes', { p_user_id: user.id }),
      admin.from('users').select('created_at, account_status').eq('id', user.id).maybeSingle(),
    ]);

    if (templateResult.error) throw templateResult.error;

    const { data, error } = concreteResult;

    const rpcUnavailable = Boolean(error && /get_available_topup_giftcodes|function|schema|campaign_key|structure|topup_gift/i.test(error.message || ''));
    if (error && !rpcUnavailable) throw error;

    if (profileResult.error) throw profileResult.error;
    const profile = profileResult.data;

    if (profile?.account_status === 'locked') {
      throw new Error('AccountLocked');
    }

    const firstTopupEligibleByCreatedAt = isFirstTopupEligibleCreatedAt(profile?.created_at);

    const concreteCodes = !rpcUnavailable && Array.isArray(data) ? data : [];
    const concreteCampaigns = new Set(
      concreteCodes
        .filter((row: any) => String(row.status || '') === 'available')
        .map((row: any) => String(row.campaign_key || '').trim().toUpperCase())
        .filter(Boolean),
    );

    const syntheticGiftcodes = [];
    for (const template of templateResult.data || []) {
      const prefix = String(template.code || '').trim().toUpperCase();
      const isGeneratedConcreteShape = /^.+-[A-Z0-9]{5,8}$/.test(prefix);
      if (isGeneratedConcreteShape && template.auto_generate_per_user !== true) continue;
      const campaignKey = String(template.campaign_key || prefix).trim().toUpperCase();
      if (!prefix || concreteCampaigns.has(campaignKey)) continue;
      if (template.expires_at && template.expires_at < nowIso) continue;
      if (template.audience === 'new_user_first_topup' && !firstTopupEligibleByCreatedAt) continue;

      const usedCount = Number(template.total_used || 0);

      if (Number(usedCount || 0) >= Number(template.total_limit || 0)) continue;

      const userUsedCount = Number(template.user_used || 0);

      const maxPerUser = Math.max(1, Number(template.max_per_user || 1));
      const remainingPerUser = Math.max(0, maxPerUser - Number(userUsedCount || 0));
      if (remainingPerUser <= 0) continue;

      const candidate = `${prefix}-${buildRandomTopupGiftcode(Number(template.discount_percent || 0))}`;

      syntheticGiftcodes.push({
        id: `template:${template.id}:${candidate}`,
        code: candidate,
        discountPercent: Number(template.discount_percent || 0),
        totalLimit: Number(template.total_limit || 0),
        usedCount,
        remainingCount: Math.max(0, Number(template.total_limit || 0) - Number(usedCount || 0)),
        maxPerUser,
        userUsedCount,
        remainingPerUser,
        audience: template.audience || 'all',
        expiresAt: template.expires_at || null,
        status: 'available',
        lastUsedAt: null,
        isGeneratedPreview: true,
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        giftcodes: [
          ...syntheticGiftcodes,
          ...concreteCodes.map((row: any) => ({
          id: row.id,
          code: row.code,
          discountPercent: Number(row.discount_percent || 0),
          totalLimit: Number(row.total_limit || 0),
          usedCount: Number(row.used_count || 0),
          remainingCount: Number(row.remaining_count || 0),
          maxPerUser: Number(row.max_per_user || 1),
          userUsedCount: Number(row.user_used_count || 0),
          remainingPerUser: Math.max(0, Number(row.max_per_user || 1) - Number(row.user_used_count || 0)),
          audience: row.audience || 'all',
          expiresAt: row.expires_at || null,
          status: row.status || 'unavailable',
          lastUsedAt: row.last_used_at || null,
        })),
        ],
      }),
    };
  } catch (error: any) {
    return {
      statusCode: error?.message === 'Unauthorized' ? 401 : error?.message === 'AccountLocked' ? 403 : 500,
      headers,
      body: JSON.stringify({ success: false, error: error?.message || 'Internal Server Error' }),
    };
  }
};
