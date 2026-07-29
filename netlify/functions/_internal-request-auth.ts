import { createHmac, timingSafeEqual } from 'node:crypto';

const INTERNAL_REQUEST_MAX_AGE_MS = 5 * 60 * 1000;
const TIMESTAMP_HEADER = 'x-audition-internal-timestamp';
const SIGNATURE_HEADER = 'x-audition-internal-signature';

const getSigningSecret = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const sign = (scope: string, timestamp: string, body: string) => {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for internal request signing');
  }

  return createHmac('sha256', secret)
    .update(`${scope}:${timestamp}:${body}`)
    .digest('hex');
};

export const createInternalRequestHeaders = (scope: string, body = '') => {
  const timestamp = String(Date.now());
  return {
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: sign(scope, timestamp, body),
  };
};

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const verifyInternalRequest = (
  scope: string,
  body: string,
  getHeader: (name: string) => string | null | undefined,
) => {
  const timestamp = String(getHeader(TIMESTAMP_HEADER) || '').trim();
  const signature = String(getHeader(SIGNATURE_HEADER) || '').trim();
  const timestampMs = Number(timestamp);

  if (
    !timestamp ||
    !signature ||
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > INTERNAL_REQUEST_MAX_AGE_MS
  ) {
    return false;
  }

  try {
    return safeEqual(signature, sign(scope, timestamp, body));
  } catch {
    return false;
  }
};
