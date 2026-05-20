import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { user } = await requireAuthenticatedUser(event);
    const admin = getServiceRoleClient();
    const { data: requester, error: requesterError } = await admin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (requesterError) throw requesterError;
    if (!requester?.is_admin) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Forbidden' }),
      };
    }

    const [{ data: lastReportRow, error: lastReportError }, liveReportResult] = await Promise.all([
      admin
        .from('system_settings')
        .select('value, updated_at')
        .eq('key', 'queue_watchdog_last_health_report')
        .maybeSingle(),
      admin.rpc('get_generated_queue_health_report'),
    ]);

    if (lastReportError) throw lastReportError;

    const liveError = liveReportResult.error;
    const liveDbReport = liveError
      ? {
          error: liveError.message || 'get_generated_queue_health_report failed',
          code: liveError.code,
        }
      : liveReportResult.data;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        lastWatchdogReport: lastReportRow?.value || null,
        lastWatchdogReportUpdatedAt: lastReportRow?.updated_at || null,
        liveDbReport,
      }),
    };
  } catch (error: any) {
    console.error('[admin-queue-health-report] failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
