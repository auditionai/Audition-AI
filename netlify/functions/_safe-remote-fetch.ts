import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const isPrivateIpv4 = (address: string) => {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const isPrivateIpAddress = (address: string) => {
  const normalized = address.toLowerCase().split('%', 1)[0];
  const version = isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version !== 6) return true;

  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length));
  }

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized)
  );
};

const assertSafeRemoteUrl = async (value: string) => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  if (
    url.protocol !== 'https:' ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password ||
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('Remote asset URL is not allowed');
  }

  if (isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) throw new Error('Private network targets are not allowed');
    return url;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error('Remote asset host resolves to a private network');
  }

  return url;
};

export const fetchSafeRemoteAsset = async (
  initialUrl: string,
  options: { timeoutMs?: number; maxRedirects?: number } = {},
) => {
  const timeoutMs = options.timeoutMs || 120_000;
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = await assertSafeRemoteUrl(initialUrl);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location || redirects === maxRedirects) {
      throw new Error('Remote asset exceeded the redirect limit');
    }

    currentUrl = await assertSafeRemoteUrl(new URL(location, currentUrl).toString());
  }

  throw new Error('Remote asset fetch failed');
};
