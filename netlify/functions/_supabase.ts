import type { HandlerEvent } from '@netlify/functions';
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
): Promise<{ user: User; userClient: SupabaseClient }> => {
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

  return { user, userClient };
};
