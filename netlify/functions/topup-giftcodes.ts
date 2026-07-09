import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const buildRandomTopupGiftcode = (discountPercent: number) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `AUAI-${Math.max(1, Math.min(100, Math.floor(discountPercent || 0)))}-${suffix}`;
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
    const { data: templates, error: templatesError } = await admin
      .from('gift_codes')
      .select('id, campaign_key, reward, discount_percent, audience, total_limit, max_per_user, expires_at, is_active')
      .eq('code_type', 'topup_discount')
      .eq('auto_generate_per_user', true)
      .is('assigned_user_id', null)
      .eq('is_active', true);

    if (templatesError && !/auto_generate_per_user|assigned_user_id|code_type|column/i.test(templatesError.message || '')) {
      throw templatesError;
    }

    for (const template of templates || []) {
      if (template.expires_at && new Date(template.expires_at).getTime() < Date.now()) {
        continue;
      }

      const { data: existingPersonalCode, error: existingError } = await admin
        .from('gift_codes')
        .select('id')
        .eq('code_type', 'topup_discount')
        .eq('assigned_user_id', user.id)
        .eq('campaign_key', template.campaign_key || template.id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existingPersonalCode?.id) continue;

      let code = buildRandomTopupGiftcode(Number(template.discount_percent || 0));
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { error: insertError } = await admin
          .from('gift_codes')
          .insert({
            code,
            code_type: 'topup_discount',
            campaign_key: template.campaign_key || template.id,
            reward: 0,
            discount_percent: template.discount_percent,
            audience: 'specific_user',
            assigned_user_id: user.id,
            auto_generate_per_user: false,
            total_limit: 1,
            max_per_user: 1,
            expires_at: template.expires_at || null,
            is_active: true,
          });

        if (!insertError) break;
        if (!/duplicate|unique/i.test(insertError.message || '') || attempt === 4) {
          throw insertError;
        }
        code = buildRandomTopupGiftcode(Number(template.discount_percent || 0));
      }
    }

    const { data, error } = await admin.rpc('get_available_topup_giftcodes', {
      p_user_id: user.id,
    });

    if (error) throw error;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        giftcodes: (data || []).map((row: any) => ({
          id: row.id,
          code: row.code,
          discountPercent: Number(row.discount_percent || 0),
          totalLimit: Number(row.total_limit || 0),
          usedCount: Number(row.used_count || 0),
          remainingCount: Number(row.remaining_count || 0),
          maxPerUser: Number(row.max_per_user || 1),
          audience: row.audience || 'all',
          expiresAt: row.expires_at || null,
          status: row.status || 'unavailable',
          lastUsedAt: row.last_used_at || null,
        })),
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
