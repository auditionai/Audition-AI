import crypto from 'crypto';

const stringifyValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((item) => (item && typeof item === 'object' ? sortObject(item as Record<string, unknown>) : item)),
    );
  }

  if (value === null || value === undefined || value === 'undefined' || value === 'null') {
    return '';
  }

  return String(value);
};

const sortObject = (input: Record<string, unknown>) =>
  Object.keys(input)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = input[key];
      return acc;
    }, {});

export const signPayOSData = (data: Record<string, unknown>, checksumKey: string) => {
  const sorted = sortObject(data);
  const query = Object.keys(sorted)
    .map((key) => `${key}=${stringifyValue(sorted[key])}`)
    .join('&');

  return crypto.createHmac('sha256', checksumKey).update(query).digest('hex');
};

export const verifyPayOSWebhook = (payload: any, checksumKey: string) => {
  if (!payload?.data || !payload?.signature) return false;
  const signature = signPayOSData(payload.data, checksumKey);
  return signature === payload.signature;
};

export const getPayOSEnv = () => {
  const clientId = process.env.PAYOS_CLIENT_ID || '';
  const apiKey = process.env.PAYOS_API_KEY || '';
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY || '';

  if (!clientId || !apiKey || !checksumKey) {
    throw new Error('Missing PayOS environment variables');
  }

  return { clientId, apiKey, checksumKey };
};
