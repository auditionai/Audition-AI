import type { HandlerEvent } from '@netlify/functions';
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const getEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return '';
};

const supabaseUrl = getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

const assertEnv = (value: string, label: string) => {
  if (!value) {
    throw new Error(`Missing ${label} environment variable`);
  }
  return value;
};

const AUTH_PROFILE_CHECK_TIMEOUT_MS = 2_500;

const getAbortSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
};

export const getServiceRoleClient = (): SupabaseClient => {
  return createClient(
    assertEnv(supabaseUrl, 'SUPABASE_URL'),
    assertEnv(supabaseServiceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
};

export const getUserClient = (authorizationHeader?: string | null): SupabaseClient => {
  const client = createClient(
    assertEnv(supabaseUrl, 'SUPABASE_URL'),
    assertEnv(supabaseAnonKey, 'SUPABASE_ANON_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: authorizationHeader
        ? {
            headers: {
              Authorization: authorizationHeader,
            },
          }
        : undefined,
    },
  );

  return client;
};

export const requireAuthenticatedUser = async (
  event: HandlerEvent,
): Promise<{ user: User; userClient: SupabaseClient; browserKeyHash: string }> => {
  const authorization = event.headers.authorization || event.headers.Authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const userClient = getUserClient(authorization);
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized');
  }

  const rawBrowserKey = String(
    event.headers['x-audition-device-key'] ||
      event.headers['X-Audition-Device-Key'] ||
      '',
  ).trim();
  const browserKeyHash = rawBrowserKey
    ? createHash('sha256').update(rawBrowserKey).digest('hex')
    : '';

  const admin = getServiceRoleClient();
  if (browserKeyHash) {
    const { error: bindError } = await admin.rpc('bind_user_browser_key', {
      p_user_id: user.id,
      p_browser_key_hash: browserKeyHash,
    });
    if (bindError && !/bind_user_browser_key|function|schema|browser/i.test(bindError.message || '')) {
      throw bindError;
    }
  }

  try {
    const timeout = getAbortSignal(AUTH_PROFILE_CHECK_TIMEOUT_MS);
    const { data: profile, error: profileError } = await admin
      .from('users')
      .select('account_status')
      .eq('id', user.id)
      .maybeSingle()
      .abortSignal(timeout.signal);
    timeout.clear();

    if (profileError && !/account_status|column/i.test(profileError.message || '')) {
      throw profileError;
    }

    if (profile?.account_status === 'locked') {
      throw new Error('AccountLocked');
    }
  } catch (profileCheckError: any) {
    if (profileCheckError?.message === 'AccountLocked') {
      throw profileCheckError;
    }
    console.warn('[auth] skipped account status check after profile read failure:', profileCheckError?.message || profileCheckError);
  }

  return { user, userClient, browserKeyHash };
};
