const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PROMPT_CHARS = 12000;
const VIDEO_SCRIPT_TIMEOUT_MS = 295000;
const ALLOWED_STATUSES = new Set(['queued', 'processing']);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const envText = (env, key) => String(env?.[key] || '').trim();
const serviceHeaders = (env, extra = {}) => ({
  apikey: envText(env, 'SUPABASE_SERVICE_ROLE_KEY'),
  Authorization: `Bearer ${envText(env, 'SUPABASE_SERVICE_ROLE_KEY')}`,
  'content-type': 'application/json',
  ...extra,
});

const db = (env, path, init = {}) => fetch(`${envText(env, 'SUPABASE_URL')}/rest/v1/${path}`, {
  ...init,
  headers: serviceHeaders(env, init.headers || {}),
});

const isAuthorized = (request, env) => {
  const expected = envText(env, 'VIDEO_SCRIPT_WORKER_SECRET');
  if (!expected) return false;
  const bearer = request.headers.get('authorization') || '';
  const supplied = request.headers.get('x-worker-secret') || '';
  return bearer === `Bearer ${expected}` || supplied === expected;
};

const publicR2Url = (env) => envText(env, 'R2_PUBLIC_URL').replace(/\/+$/, '');

const assertAllowedImageSource = (env, value) => {
  const source = String(value || '').trim();
  if (!/^https:\/\//i.test(source)) throw new Error('Reference image must be an HTTPS URL');
  const configuredR2 = publicR2Url(env);
  if (configuredR2 && !source.startsWith(`${configuredR2}/`)) {
    throw new Error('Reference image source is not an approved R2 asset');
  }
  const url = new URL(source);
  if (url.username || url.password || url.port && url.port !== '443') {
    throw new Error('Reference image URL is not allowed');
  }
  return source;
};

const imageToDataUrl = async (env, source) => {
  const url = assertAllowedImageSource(env, source);
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Reference image could not be retrieved (${response.status})`);
  const contentType = String(response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error('Reference source is not an image');
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) throw new Error('Reference image is too large');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Reference image is empty or too large');
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
};

const clampDuration = (value) => {
  const parsed = Number(String(value || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(30, Math.max(3, Math.round(parsed)));
};

const option = (value, fallback) => String(value || '').trim() || fallback;

const buildDirectorInstruction = (payload) => {
  const duration = clampDuration(payload.durationSeconds);
  const options = payload.scriptOptions && typeof payload.scriptOptions === 'object' ? payload.scriptOptions : {};
  const trendEdit = Boolean(options.trendEdit);
  const textOverlay = Boolean(options.textOverlay);
  const voiceDialogue = Boolean(options.voiceDialogue);
  const userPrompt = String(payload.userPrompt || '').trim().slice(0, MAX_PROMPT_CHARS);
  return [
    'Bạn là đạo diễn video AI chuyên nghiệp cho pipeline image-to-video.',
    'Hãy nhìn trực tiếp ảnh tham chiếu được đính kèm trước, sau đó viết kịch bản hoàn chỉnh bằng tiếng Việt.',
    `Thời lượng mục tiêu: ${duration} giây. Luôn viết đúng 7 cảnh master (Cảnh 1 đến Cảnh 7), không bỏ cảnh theo thời lượng.`,
    `Phong cách nội bộ: ${option(options.style, 'cinematic')}. Chủ đề nội bộ: ${option(options.theme, 'bám theo ảnh tham chiếu')}.`,
    `Nhạc nền: ${option(options.soundMood, 'phù hợp với bối cảnh')}; phải có thể loại, năng lượng/BPM, nhạc cụ, diễn biến intro-build-peak-outro và điểm đồng bộ chuyển cảnh.`,
    trendEdit ? 'Có thể dùng nhịp dựng hiện đại, speed ramp, match cut và beat-sync khi phù hợp.' : 'Dùng chuyển động điện ảnh tự nhiên, tiết chế, phù hợp với ảnh.',
    textOverlay ? 'Chỉ thêm chữ trên hình khi thực sự hữu ích và đặt xa khuôn mặt.' : 'Không thêm chữ, tiêu đề, phụ đề hay typography vào video.',
    voiceDialogue ? 'Có thể thêm lời thoại hoặc voice-over tiếng Việt ngắn nếu hợp cảnh.' : 'Không dùng lời thoại, voice-over hay lời dẫn; chỉ dùng hình ảnh, âm nhạc và hiệu ứng âm thanh.',
    userPrompt ? `Ý tưởng người dùng cần tích hợp: ${userPrompt}` : '',
    '',
    'BẮT BUỘC PHÂN TÍCH ẢNH:',
    'Mở đầu bằng đúng các tiêu đề: Quan sát ảnh tham chiếu:, Loại chủ thể:, Khóa đồng nhất tham chiếu:.',
    'Nêu ít nhất 6 chi tiết nhìn thấy thật: số chủ thể, màu sắc, trang phục, phụ kiện, tư thế, biểu cảm, bố cục, ánh sáng, nền và góc máy.',
    'Nếu là nhân vật 3D/game avatar thì phải gọi đúng là nhân vật 3D/avatar, không gọi là búp bê hay người thật.',
    'Khóa chính xác số chủ thể, khuôn mặt, tóc, biểu cảm, trang phục, màu sắc, phụ kiện, tỷ lệ cơ thể, quan hệ tư thế và bối cảnh. Phải nói rõ "không tạo nhân vật mới" và "giữ nguyên".',
    'Mỗi cảnh phải có góc máy, chuyển động máy/chủ thể, hành động, chuyển cảnh và cue âm thanh/nhạc; mỗi cảnh phải dùng lại ít nhất một chi tiết nhìn thấy trong ảnh.',
    'Kết thúc bằng chỉ dẫn âm bản ngăn biến dạng khuôn mặt/cơ thể/trang phục, tay chân thừa và thay đổi danh tính.',
    'Không in cấu hình nội bộ, không JSON, không markdown fence, không giải thích ngoài kịch bản.',
  ].filter(Boolean).join('\n');
};

const getClaudeApiKey = async (env) => {
  const configured = envText(env, 'CLAUDE_API_KEY') || envText(env, 'OPENAI_COMPATIBLE_API_KEY');
  if (configured) return configured;
  const response = await db(env, 'api_keys?select=id,key_value,last_used_at&status=eq.active&name=ilike.%5BCLAUDE%5D%25&order=last_used_at.asc.nullsfirst');
  if (!response.ok) throw new Error(`Claude key lookup failed (${response.status})`);
  const rows = await response.json();
  const row = (Array.isArray(rows) ? rows : []).find((candidate) => {
    const key = String(candidate?.key_value || '').trim();
    return key.length >= 8 && !/\s/.test(key) && !key.startsWith('{');
  });
  const key = String(row?.key_value || '').trim();
  if (!key) throw new Error('CLAUDE_NOT_CONFIGURED: Add an active [CLAUDE] API key in Admin Settings or set CLAUDE_API_KEY.');
  if (row?.id) {
    void db(env, `api_keys?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }).catch(() => {});
  }
  return key;
};

const callClaude = async (env, payload, imageDataUrl) => {
  const baseUrl = envText(env, 'OPENAI_COMPATIBLE_BASE_URL') || 'https://sub.digishop.work/v1';
  const apiKey = await getClaudeApiKey(env);
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: envText(env, 'CLAUDE_MODEL') || 'claude-sonnet-4-6',
      temperature: 0.2,
      max_tokens: 12000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: buildDirectorInstruction(payload) },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(VIDEO_SCRIPT_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Video script provider failed (${response.status}): ${String(data?.error?.message || data?.message || '').slice(0, 500)}`);
  const script = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!script) throw new Error('Video script provider returned an empty response');
  return script.slice(0, 48000);
};

const updateJob = async (env, jobId, patch, statusGuard) => {
  const filters = [`id=eq.${encodeURIComponent(jobId)}`];
  if (statusGuard) filters.push(`status=eq.${encodeURIComponent(statusGuard)}`);
  const response = await db(env, `video_script_jobs?${filters.join('&')}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Video script job update failed (${response.status})`);
  return response.json().catch(() => []);
};

const processJob = async (env, jobId) => {
  const response = await db(env, `video_script_jobs?id=eq.${encodeURIComponent(jobId)}&select=id,status,request_payload`);
  if (!response.ok) throw new Error('Video script job lookup failed');
  const rows = await response.json();
  const job = rows?.[0];
  if (!job) throw new Error('Video script job not found');
  if (!ALLOWED_STATUSES.has(String(job.status || '').toLowerCase())) return { skipped: true, status: job.status };

  const claimed = await updateJob(env, jobId, { status: 'processing', error_message: null }, 'queued');
  if (!Array.isArray(claimed) || claimed.length === 0) return { skipped: true, status: 'processing' };

  try {
    const payload = job.request_payload && typeof job.request_payload === 'object' ? job.request_payload : {};
    const imageDataUrl = await imageToDataUrl(env, payload.imageSource);
    const script = await callClaude(env, payload, imageDataUrl);
    await updateJob(env, jobId, { status: 'completed', script, completed_at: new Date().toISOString(), error_message: null }, 'processing');
    return { completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJob(env, jobId, { status: 'failed', error_message: message.slice(0, 2000) }, 'processing');
    throw error;
  }
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET') return json({ ok: true, worker: 'auditionai-video-script-worker' });
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const jobId = String(body?.jobId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: 'Missing or invalid jobId' }, 400);
    ctx.waitUntil(processJob(env, jobId).catch((error) => console.error('[video-script-worker]', error)));
    return json({ accepted: true, jobId }, 202);
  },
};
