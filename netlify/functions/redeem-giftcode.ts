import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const normalizeIp = (value?: string | null) => String(value || '').trim();

const stripIpPort = (value: string) => {
  const trimmed = normalizeIp(value);
  if (!trimmed) return '';

  const bracketedIpv6 = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketedIpv6?.[1]) {
    return bracketedIpv6[1];
  }

  const ipv4WithPort = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort?.[1]) {
    return ipv4WithPort[1];
  }

  return trimmed;
};

const isBlockedProxyLikeIp = (ip: string) => {
  const normalized = stripIpPort(ip).toLowerCase();
  if (!normalized) return true;

  if (normalized === '::1' || normalized === '127.0.0.1' || normalized === 'localhost') {
    return true;
  }

  if (normalized.startsWith('10.')) return true;
  if (normalized.startsWith('192.168.')) return true;
  if (normalized.startsWith('172.16.') || normalized.startsWith('172.17.') || normalized.startsWith('172.18.') || normalized.startsWith('172.19.')) return true;
  if (normalized.startsWith('172.2') || normalized.startsWith('172.30.') || normalized.startsWith('172.31.')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // Cloudflare/edge-private ranges that showed up in live giftcode logs.
  if (normalized.startsWith('172.68.') || normalized.startsWith('172.69.') || normalized.startsWith('172.70.') || normalized.startsWith('172.71.')) {
    return true;
  }
  if (normalized.startsWith('162.158.')) {
    return true;
  }

  return false;
};

const getIpsFromHeader = (raw?: string | null) =>
  normalizeIp(raw)
    .split(',')
    .map((entry) => stripIpPort(entry))
    .filter((entry) => Boolean(entry) && isIP(entry));

const normalizeIpv6Network = (ip: string) => {
  const [head] = ip.split('%', 2);
  const source = head.toLowerCase();
  const hasCompression = source.includes('::');
  const [leftRaw, rightRaw = ''] = source.split('::', 2);
  const left = leftRaw ? leftRaw.split(':').filter(Boolean) : [];
  const right = hasCompression ? (rightRaw ? rightRaw.split(':').filter(Boolean) : []) : [];
  const missing = Math.max(0, 8 - (left.length + right.length));
  const full = hasCompression
    ? [...left, ...Array.from({ length: missing }, () => '0'), ...right]
    : source.split(':').filter(Boolean);

  if (full.length !== 8) {
    return source;
  }

  const normalized = full.map((segment) => segment.padStart(4, '0'));
  return `${normalized.slice(0, 4).join(':')}::/64`;
};

const toNetworkKey = (ip: string) => {
  const family = isIP(ip);
  if (family === 6) {
    return `ipv6:${normalizeIpv6Network(ip)}`;
  }
  if (family === 4) {
    const parts = ip.split('.');
    return `ipv4:${parts.slice(0, 3).join('.')}.0/24`;
  }
  return ip;
};

const getClientIp = (event: Parameters<Handler>[0]) => {
  const candidates = [
    event.headers['cf-connecting-ip'],
    event.headers['x-real-ip'],
    event.headers['x-forwarded-for'],
    event.headers['x-nf-client-connection-ip'],
    event.headers['client-ip'],
  ];

  const fallbackIps: string[] = [];
  for (const candidate of candidates) {
    const ips = getIpsFromHeader(candidate);
    for (const ip of ips) {
      if (!isBlockedProxyLikeIp(ip)) {
        return ip;
      }
      fallbackIps.push(ip);
    }
  }

  return fallbackIps[0] || '';
};

const hashIp = (ip: string) => createHash('sha256').update(ip).digest('hex');
const hashUserAgent = (value?: string | null) => {
  const normalized = String(value || '').trim().slice(0, 500);
  return normalized ? createHash('sha256').update(normalized).digest('hex') : '';
};
const normalizeCampaignKey = (value?: string | null, fallback = '') =>
  String(value || fallback || '')
    .trim()
    .toUpperCase();

const mapGiftcodeError = (message: string) => {
  if (/GIFT_CODE_ALREADY_USED_BY_IP/i.test(message)) {
    return 'Địa chỉ IP này đã dùng giftcode trong chiến dịch này rồi.';
  }
  if (/GIFT_CODE_ALREADY_USED_BY_USER/i.test(message)) {
    return 'Bạn đã nhập giftcode trong chiến dịch này rồi.';
  }
  if (/GIFT_CODE_ALREADY_USED_BY_EMAIL_CLUSTER/i.test(message)) {
    return 'Cụm email này đã dùng giftcode trong chiến dịch này rồi.';
  }
  if (/GIFT_CODE_ALREADY_USED_BY_BROWSER/i.test(message)) {
    return 'Tr\u00ecnh duy\u1ec7t/thi\u1ebft b\u1ecb n\u00e0y \u0111\u00e3 d\u00f9ng giftcode trong chi\u1ebfn d\u1ecbch n\u00e0y r\u1ed3i.';
  }
  if (/GIFT_CODE_ALREADY_REDEEMED/i.test(message)) {
    return 'Lượt nhập giftcode này đã được xử lý trước đó.';
  }
  if (/ACCOUNT_LOCKED|AccountLocked/i.test(message)) {
    return 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.';
  }
  if (/GIFT_CODE_LIMIT_REACHED/i.test(message)) {
    return 'Mã đã hết lượt sử dụng.';
  }
  if (/GIFT_CODE_EXPIRED/i.test(message)) {
    return 'Mã đã hết hạn.';
  }
  if (/GIFT_CODE_INVALID/i.test(message)) {
    return 'Mã không hợp lệ hoặc đã bị vô hiệu hóa.';
  }
  if (/IP_REQUIRED/i.test(message)) {
    return 'Không xác định được địa chỉ IP để kiểm tra giftcode.';
  }
  if (/GIFTCODE_REQUIRED/i.test(message)) {
    return 'Vui lòng nhập giftcode.';
  }
  if (/USER_REQUIRED/i.test(message)) {
    return 'Không xác định được người dùng.';
  }
  return message || 'Không thể sử dụng giftcode.';
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { user, browserKeyHash } = await requireAuthenticatedUser(event);
    const body = JSON.parse(event.body || '{}');
    const code = String(body?.code || '').trim().toUpperCase();
    const ipAddress = getClientIp(event);
    const ipNetworkKey = ipAddress ? toNetworkKey(ipAddress) : '';
    const ipHash = ipNetworkKey ? hashIp(ipNetworkKey) : '';
    const userAgentHash = hashUserAgent(event.headers['user-agent']);

    const admin = getServiceRoleClient();
    if (ipHash) {
      let campaignKey = normalizeCampaignKey(code);
      let campaignGiftCodeIds: string[] = [];

      try {
        const { data: giftCodeRow, error: giftCodeRowError } = await admin
          .from('gift_codes')
          .select('id, campaign_key')
          .eq('code', code)
          .maybeSingle();

        if (giftCodeRowError) {
          throw giftCodeRowError;
        }

        campaignKey = normalizeCampaignKey(giftCodeRow?.campaign_key, code);

        const { data: campaignRows, error: campaignRowsError } = await admin
          .from('gift_codes')
          .select('id')
          .eq('campaign_key', campaignKey);

        if (campaignRowsError) {
          throw campaignRowsError;
        }

        campaignGiftCodeIds = (campaignRows || [])
          .map((row: any) => String(row?.id || '').trim())
          .filter(Boolean);
      } catch {
        const { data: fallbackGiftCodeRow, error: fallbackGiftCodeError } = await admin
          .from('gift_codes')
          .select('id')
          .eq('code', code)
          .maybeSingle();

        if (fallbackGiftCodeError) {
          throw fallbackGiftCodeError;
        }

        campaignGiftCodeIds = fallbackGiftCodeRow?.id ? [String(fallbackGiftCodeRow.id)] : [];
      }

      if (campaignGiftCodeIds.length > 0) {
        const { data: existingIpUsage, error: existingIpUsageError } = await admin
          .from('gift_code_usages')
          .select('id, ip_address, ip_hash')
          .in('gift_code_id', campaignGiftCodeIds)
          .limit(200);

        if (existingIpUsageError) {
          throw existingIpUsageError;
        }

        const hasMatchingCampaignIp = (existingIpUsage || []).some((row: any) => {
          const existingHash = String(row?.ip_hash || '').trim();
          const existingNetworkKey = row?.ip_address ? toNetworkKey(String(row.ip_address)) : '';
          return existingHash === ipHash || (existingNetworkKey && existingNetworkKey === ipNetworkKey);
        });

        if (hasMatchingCampaignIp) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              reward: 0,
              message: mapGiftcodeError('GIFT_CODE_ALREADY_USED_BY_IP'),
            }),
          };
        }
      } else if (!campaignKey) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            reward: 0,
            message: mapGiftcodeError('GIFT_CODE_INVALID'),
          }),
        };
      }
    }

    const { data, error } = await admin.rpc('redeem_giftcode', {
      p_user_id: user.id,
      p_code: code,
      p_ip_hash: ipHash,
      p_ip_address: ipAddress || null,
      p_user_agent_hash: userAgentHash || null,
      p_browser_key_hash: browserKeyHash || null,
    });

    if (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          reward: 0,
          message: mapGiftcodeError(error.message || 'Không thể sử dụng giftcode.'),
        }),
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const success = Boolean(row?.success);
    const resultMessage = String(row?.message || '');
    return {
      statusCode: success ? 200 : 400,
      headers,
      body: JSON.stringify({
        success,
        reward: Number(row?.reward || 0),
        message: success
          ? (resultMessage === 'SUCCESS' ? 'Success' : mapGiftcodeError(resultMessage))
          : mapGiftcodeError(resultMessage || 'Không thể sử dụng giftcode.'),
      }),
    };
  } catch (error: any) {
    return {
      statusCode: error?.message === 'Unauthorized' ? 401 : error?.message === 'AccountLocked' ? 403 : 500,
      headers,
      body: JSON.stringify({
        success: false,
        reward: 0,
        message: error?.message === 'Unauthorized' ? 'Unauthorized' : mapGiftcodeError(error?.message || 'Internal Server Error'),
      }),
    };
  }
};
