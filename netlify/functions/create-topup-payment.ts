import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
import { createSePayCheckoutFields, encodeSePayCheckoutPayload } from './_sepay';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
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

const mapTopupGiftcodeError = (message: string) => {
  if (/GIFT_CODE_TOPUP_EXPIRED_OR_LIMIT|GIFT_CODE_LIMIT_REACHED|GIFT_CODE_EXPIRED/i.test(message)) {
    return 'Code đã đạt giới hạn 1000 lần sử dụng trên hệ thống hoặc đã hết hạn sử dụng, vui lòng inbox admin nếu bạn có thắc mắc gì thêm.';
  }
  if (/GIFT_CODE_FIRST_TOPUP_ONLY/i.test(message)) {
    return 'Mã ưu đãi này chỉ áp dụng cho lần nạp đầu tiên.';
  }
  if (/GIFT_CODE_ALREADY_USED_BY_USER|duplicate key/i.test(message)) {
    return 'Bạn đã sử dụng mã ưu đãi này trước đó.';
  }
  if (/GIFT_CODE_INVALID/i.test(message)) {
    return 'Mã ưu đãi không hợp lệ hoặc không áp dụng cho tài khoản này.';
  }
  if (/GIFT_CODE_GENERATED_COLLISION/i.test(message)) {
    return 'Mã ưu đãi vừa tạo đã bị trùng. Vui lòng đóng cửa sổ nạp tiền rồi mở lại để nhận mã mới.';
  }
  if (/GIFTCODE_REQUIRED/i.test(message)) {
    return 'Vui lòng nhập giftcode ưu đãi.';
  }
  return message || 'Không thể áp dụng giftcode ưu đãi.';
};

const ensureGeneratedTopupGiftcode = async (admin: any, userId: string, generatedCode: string) => {
  const code = generatedCode.trim().toUpperCase();
  const { data: exact, error: exactError } = await admin
    .from('gift_codes')
    .select('id')
    .eq('code', code)
    .maybeSingle();

  if (exactError) throw exactError;
  if (exact?.id) return { giftCodeId: exact.id, templateId: null };

  const match = code.match(/^(.+)-([A-Z0-9]{5})$/);
  if (!match) return { giftCodeId: null, templateId: null };

  const prefix = match[1];
  const { data: template, error: templateError } = await admin
    .from('gift_codes')
    .select('id, code, campaign_key, discount_percent, audience, total_limit, max_per_user, expires_at, is_active, auto_generate_per_user')
    .eq('code', prefix)
    .eq('code_type', 'topup_discount')
    .is('assigned_user_id', null)
    .maybeSingle();

  if (templateError) throw templateError;
  if (!template?.id) return { giftCodeId: null, templateId: null };
  if (template.auto_generate_per_user !== true && /^.+-[A-Z0-9]{5}$/.test(String(template.code || '').trim().toUpperCase())) {
    return { giftCodeId: null, templateId: null };
  }
  if (template.is_active !== true || (template.expires_at && new Date(template.expires_at).getTime() < Date.now())) {
    throw new Error('GIFT_CODE_TOPUP_EXPIRED_OR_LIMIT');
  }

  const campaignKey = String(template.campaign_key || template.code || prefix).trim().toUpperCase();
  const { count: usedCount, error: usedCountError } = await admin
    .from('topup_gift_code_usages')
    .select('id, gift_codes!inner(campaign_key)', { count: 'exact', head: true })
    .eq('gift_codes.campaign_key', campaignKey)
    .in('status', ['reserved', 'applied']);
  if (usedCountError && !/topup_gift_code_usages|schema|relation/i.test(usedCountError.message || '')) {
    throw usedCountError;
  }
  if (Number(usedCount || 0) >= Number(template.total_limit || 0)) {
    throw new Error('GIFT_CODE_TOPUP_EXPIRED_OR_LIMIT');
  }

  const { data: inserted, error: insertError } = await admin
    .from('gift_codes')
    .insert({
      code,
      code_type: 'topup_discount',
      campaign_key: campaignKey,
      reward: 0,
      discount_percent: template.discount_percent,
      audience: template.audience || 'all',
      assigned_user_id: userId,
      auto_generate_per_user: false,
      total_limit: 1,
      max_per_user: 1,
      expires_at: template.expires_at || null,
      is_active: true,
    })
    .select('id')
    .single();

  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message || '')) {
      throw new Error('GIFT_CODE_GENERATED_COLLISION');
    }
    throw insertError;
  }

  return { giftCodeId: inserted?.id || null, templateId: template.id };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { user } = await requireAuthenticatedUser(event);
    const body = JSON.parse(event.body || '{}');
    const packageId = String(body?.packageId || '').trim();
    const giftcode = String(body?.giftcode || '').trim().toUpperCase();

    if (!packageId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing packageId' }) };
    }

    const admin = getServiceRoleClient();
    const [{ data: profile, error: profileError }, { data: pkg, error: pkgError }, { data: promo }] = await Promise.all([
      admin.from('users').select('id, email, display_name').eq('id', user.id).maybeSingle(),
      admin
        .from('credit_packages')
        .select('id, name, credits_amount, price_vnd, bonus_credits, is_active')
        .eq('id', packageId)
        .maybeSingle(),
      admin
        .from('promotions')
        .select('bonus_percent')
        .eq('is_active', true)
        .lte('start_time', new Date().toISOString())
        .gte('end_time', new Date().toISOString())
        .order('bonus_percent', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileError) throw profileError;
    if (pkgError) throw pkgError;
    if (!pkg || pkg.is_active === false) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Package not found' }) };
    }

    const baseVcoin = Number(pkg.credits_amount || 0);
    const originalAmount = Number(pkg.price_vnd || 0);
    const bonusPercent = Number(promo?.bonus_percent ?? pkg.bonus_credits ?? 0);
    const totalCoins = baseVcoin + Math.floor(baseVcoin * bonusPercent / 100);
    const providerOrderCode = Date.now();
    const orderCode = `${providerOrderCode}`;

    const { data: tx, error: txError } = await admin
      .from('payment_transactions')
      .insert({
        user_id: user.id,
        package_id: packageId,
        amount_vnd: originalAmount,
        vcoin_received: totalCoins,
        status: 'pending',
        order_code: orderCode,
        provider_order_code: providerOrderCode,
        payment_method: 'sepay',
        provider_payload: {
          topup_giftcode: giftcode || null,
          original_amount_vnd: originalAmount,
          discount_amount_vnd: 0,
          final_amount_vnd: originalAmount,
        },
      })
      .select()
      .single();

    if (txError) throw txError;

    let finalAmount = originalAmount;
    let discountAmount = 0;
    let discountPercent = 0;
    let appliedGiftcode: string | null = null;
    let generatedTemplateId: string | null = null;

    if (giftcode) {
      try {
        const generated = await ensureGeneratedTopupGiftcode(admin, user.id, giftcode);
        generatedTemplateId = generated.templateId;
      } catch (generatedError: any) {
        await admin.from('payment_transactions').update({ status: 'failed' }).eq('id', tx.id);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: mapTopupGiftcodeError(generatedError?.message || '') }),
        };
      }

      const { data: reservedRows, error: reserveError } = await admin.rpc('reserve_topup_giftcode', {
        p_user_id: user.id,
        p_code: giftcode,
        p_payment_transaction_id: tx.id,
        p_original_amount_vnd: originalAmount,
      });

      if (reserveError) {
        await admin.from('payment_transactions').update({ status: 'failed' }).eq('id', tx.id);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: mapTopupGiftcodeError(reserveError.message || '') }),
        };
      }

      const reserved = Array.isArray(reservedRows) ? reservedRows[0] : reservedRows;
      if (!reserved?.success) {
        await admin.from('payment_transactions').update({ status: 'failed' }).eq('id', tx.id);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: mapTopupGiftcodeError(reserved?.message || '') }),
        };
      }

      finalAmount = Number(reserved.final_amount_vnd || originalAmount);
      discountAmount = Number(reserved.discount_amount_vnd || 0);
      discountPercent = Number(reserved.discount_percent || 0);
      appliedGiftcode = String(reserved.code || giftcode);

      if (generatedTemplateId) {
        await admin.rpc('increment_giftcode_usage', { code_id: generatedTemplateId });
      }

      const { error: discountUpdateError } = await admin
        .from('payment_transactions')
        .update({
          amount_vnd: finalAmount,
          provider_payload: {
            topup_giftcode: appliedGiftcode,
            topup_gift_code_id: reserved.gift_code_id,
            original_amount_vnd: originalAmount,
            discount_amount_vnd: discountAmount,
            final_amount_vnd: finalAmount,
            discount_percent: discountPercent,
          },
        })
        .eq('id', tx.id);
      if (discountUpdateError) throw discountUpdateError;
    }

    const { returnUrl, cancelUrl } = {
      returnUrl: String(body?.returnUrl || ''),
      cancelUrl: String(body?.cancelUrl || ''),
    };
    const successUrl = buildRedirectUrl(process.env.SEPAY_SUCCESS_URL, returnUrl, 'PAID', providerOrderCode);
    const errorUrl = buildRedirectUrl(process.env.SEPAY_ERROR_URL || process.env.SEPAY_CANCEL_URL, cancelUrl, 'FAILED', providerOrderCode);
    const cancelCheckoutUrl = buildRedirectUrl(process.env.SEPAY_CANCEL_URL, cancelUrl, 'CANCELLED', providerOrderCode);
    const checkout = createSePayCheckoutFields({
      amount: finalAmount,
      orderCode: providerOrderCode,
      description: `AI${String(providerOrderCode).slice(-7)}`,
      customerId: profile?.email || profile?.display_name || user.email || user.id,
      successUrl,
      errorUrl,
      cancelUrl: cancelCheckoutUrl,
    });
    const payload = encodeSePayCheckoutPayload({
      checkoutUrl: checkout.checkoutUrl,
      fields: checkout.fields,
    });
    const checkoutUrl = `${getOrigin(event)}/api/sepay-checkout?payload=${encodeURIComponent(payload)}`;
    const paymentLinkId = `sepay:${providerOrderCode}`;

    await admin
      .from('payment_transactions')
      .update({
        checkout_url: checkoutUrl,
        provider_payment_link_id: paymentLinkId,
        provider_payload: {
          gateway: 'sepay',
          sepay_order_code: orderCode,
          sepay_order_description: `AI${String(providerOrderCode).slice(-7)}`,
          topup_giftcode: appliedGiftcode,
          original_amount_vnd: originalAmount,
          discount_amount_vnd: discountAmount,
          final_amount_vnd: finalAmount,
          discount_percent: discountPercent,
          checkout_created_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', tx.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        transaction: {
          id: tx.id,
          userId: user.id,
          packageId,
          amount: finalAmount,
          originalAmount,
          discountAmount,
          topupGiftcode: appliedGiftcode,
          vcoin_received: totalCoins,
          status: 'pending',
          createdAt: tx.created_at,
          paymentMethod: 'sepay',
          code: orderCode,
          order_code: orderCode,
          checkoutUrl,
        },
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
