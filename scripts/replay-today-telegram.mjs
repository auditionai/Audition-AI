import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const limitArg = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.slice(8) || 3);
const limit = Math.max(1, Math.min(10, Number.isFinite(limitArg) ? limitArg : 3));
const since = process.env.TELEGRAM_REPLAY_SINCE || '2026-09-15T17:00:00.000Z';
const webhookUrl = String(process.env.TELEGRAM_NOTIFY_WEBHOOK_URL || '').trim();
const webhookSecret = String(process.env.TELEGRAM_NOTIFY_WEBHOOK_SECRET || '').trim();
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!webhookUrl || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Telegram or Supabase service-role configuration.');
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin
  .from('generated_images')
  .select('id,user_id,user_name,image_url,provider,job_id,prompt,asset_type,tool_id,tool_name,model_used,queue_kind,cost_vcoin,created_at,finished_at,queue_payload')
  .gte('created_at', since)
  .eq('status', 'completed')
  .order('created_at');

if (error) throw error;

const rows = (data || [])
  .filter((row) => !row.queue_payload?.__telegramBackfill20260916)
  .slice(0, limit);

for (const row of rows) {
  const { data: user } = await admin
    .from('users')
    .select('display_name,email')
    .eq('id', row.user_id)
    .maybeSingle();
  const rawPayload = row.queue_payload && typeof row.queue_payload === 'object' ? row.queue_payload : {};
  const recipe = rawPayload.__recipePayload && typeof rawPayload.__recipePayload === 'object'
    ? rawPayload.__recipePayload
    : rawPayload;
  const inputMedia = Array.isArray(rawPayload.__notifyInputMedia)
    ? rawPayload.__notifyInputMedia
    : [
      ...(Array.isArray(recipe.characterImages) ? recipe.characterImages.map((url) => ({ url, role: 'character', kind: 'image', userProvided: true })) : []),
      ...(Array.isArray(recipe.referenceImages) ? recipe.referenceImages.map((url) => ({ url, role: 'reference', kind: 'image', userProvided: true })) : []),
      ...(Array.isArray(recipe.characterReferenceGroups) ? recipe.characterReferenceGroups.flatMap((group) => (group?.references || []).map((reference) => ({ url: reference?.source || reference, role: 'character', kind: 'image', userProvided: true }))) : []),
      ...(recipe.sampleImage ? [{ url: recipe.sampleImage, role: 'sample', kind: 'image', userProvided: true }] : []),
      ...(recipe.sourceImage ? [{ url: recipe.sourceImage, role: 'source', kind: 'image', userProvided: true }] : []),
      ...(recipe.keyframeImage ? [{ url: recipe.keyframeImage, role: 'keyframe', kind: 'image', userProvided: true }] : []),
      ...(recipe.motionVideoDataUrl ? [{ url: recipe.motionVideoDataUrl, role: 'motion', kind: 'video', userProvided: true }] : []),
    ];
  const body = {
    eventType: 'completed',
    app: 'Audition AI',
    job: {
      id: row.id,
      providerJobId: row.job_id || null,
      provider: row.provider || row.queue_payload?.__targetProvider || null,
       userId: row.user_id,
       displayName: row.user_name || user?.display_name || null,
       email: user?.email || null,
      prompt: row.prompt || '',
      assetType: row.asset_type || 'image',
      toolId: row.tool_id || null,
      toolName: row.tool_name || null,
      engine: row.model_used || null,
      queueKind: row.queue_kind || null,
      costVcoin: Number(row.cost_vcoin || 0),
      status: 'completed',
      createdAt: row.created_at,
      finishedAt: row.finished_at || null,
       resultUrl: row.image_url || null,
      config: {},
    },
    media: { outputUrl: row.image_url || null, inputMedia },
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-notify-secret': webhookSecret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Telegram replay failed (${response.status}) for ${row.id}`);

  const { error: updateError } = await admin
    .from('generated_images')
    .update({ queue_payload: { ...row.queue_payload, __telegramBackfill20260916: true } })
    .eq('id', row.id);
  if (updateError) throw updateError;
}

console.log(JSON.stringify({ sent: rows.length, ids: rows.map((row) => row.id) }));
