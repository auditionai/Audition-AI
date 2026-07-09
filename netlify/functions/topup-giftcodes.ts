import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const buildRandomTopupGiftcode = (discountPercent: number) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const suffix = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return suffix;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { user } = await requireAuthenticatedUser(event);
    const admin = getServiceRoleClient();
    const nowIso = new Date().toISOString();
    const { data: templates, error: templatesError } = await admin
      .from('gift_codes')
      .select('id, code, campaign_key, reward, discount_percent, audience, total_limit, max_per_user, expires_at, is_active, created_at, auto_generate_per_user')
      .eq('code_type', 'topup_discount')
      .is('assigned_user_id', null)
      .eq('is_active', true);

    if (templatesError && !/auto_generate_per_user|assigned_user_id|code_type|column/i.test(templatesError.message || '')) {
      throw templatesError;
    }

    const { data, error } = await admin.rpc('get_available_topup_giftcodes', {
      p_user_id: user.id,
    });

    const rpcUnavailable = Boolean(error && /get_available_topup_giftcodes|function|schema|campaign_key|structure|topup_gift/i.test(error.message || ''));
    if (error && !rpcUnavailable) throw error;

    const { count: paidTopupCount } = await admin
      .from('payment_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'paid');

    const concreteCodes = !rpcUnavailable && Array.isArray(data) ? data : [];
    const concreteCampaigns = new Set(
      concreteCodes
        .filter((row: any) => String(row.status || '') === 'available')
        .map((row: any) => String(row.campaign_key || '').trim().toUpperCase())
        .filter(Boolean),
    );

    const syntheticGiftcodes = [];
    for (const template of templates || []) {
      const prefix = String(template.code || '').trim().toUpperCase();
      const isGeneratedConcreteShape = /^.+-[A-Z0-9]{5}$/.test(prefix);
      if (isGeneratedConcreteShape && template.auto_generate_per_user !== true) continue;
      const campaignKey = String(template.campaign_key || prefix).trim().toUpperCase();
      if (!prefix || concreteCampaigns.has(campaignKey)) continue;
      if (template.expires_at && template.expires_at < nowIso) continue;
      if (template.audience === 'new_user_first_topup' && Number(paidTopupCount || 0) > 0) continue;

      const { count: usedCount, error: usedCountError } = await admin
        .from('topup_gift_code_usages')
        .select('id, gift_codes!inner(campaign_key)', { count: 'exact', head: true })
        .eq('gift_codes.campaign_key', campaignKey)
        .eq('status', 'applied');

      if (usedCountError && !/topup_gift_code_usages|gift_codes|schema|relation|foreign key/i.test(usedCountError.message || '')) {
        throw usedCountError;
      }

      if (Number(usedCount || 0) >= Number(template.total_limit || 0)) continue;

      const { count: userUsedCount, error: userUsedCountError } = await admin
        .from('topup_gift_code_usages')
        .select('id, gift_codes!inner(campaign_key)', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('gift_codes.campaign_key', campaignKey)
        .eq('status', 'applied');

      if (userUsedCountError && !/topup_gift_code_usages|gift_codes|schema|relation|foreign key/i.test(userUsedCountError.message || '')) {
        throw userUsedCountError;
      }

      const maxPerUser = Math.max(1, Number(template.max_per_user || 1));
      const remainingPerUser = Math.max(0, maxPerUser - Number(userUsedCount || 0));
      if (remainingPerUser <= 0) continue;

      let candidate = `${prefix}-${buildRandomTopupGiftcode(Number(template.discount_percent || 0))}`;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data: existing } = await admin
          .from('gift_codes')
          .select('id')
          .eq('code', candidate)
          .maybeSingle();
        if (!existing?.id) break;
        candidate = `${prefix}-${buildRandomTopupGiftcode(Number(template.discount_percent || 0))}`;
      }

      syntheticGiftcodes.push({
        id: `template:${template.id}:${candidate}`,
        code: candidate,
        discountPercent: Number(template.discount_percent || 0),
        totalLimit: Number(template.total_limit || 0),
        usedCount: Number(usedCount || 0),
        remainingCount: Math.max(0, Number(template.total_limit || 0) - Number(usedCount || 0)),
        maxPerUser,
        userUsedCount: Number(userUsedCount || 0),
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
