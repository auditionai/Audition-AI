
const GPTI2_BASE = 'https://gpti2.store/v1';
// Match the TST generation timeout. GPTi2 image edits are synchronous and
// must have the same window to finish rendering a valid result.
const GPTI2_TIMEOUT_MS = 295_000;
const MODEL_ALIASES: Record<string, string> = { 'image-gpt-2': 'gpt-image-2' };
const ALLOWED_MODELS = new Set(['gpt-image-2', 'nano-banana-2', 'nano-banana-pro']);

const key = () => String(process.env.GPTI2_API_KEY || '').trim();
const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
const assertConfigured = () => { if (!key()) throw new Error('GPTI2_NOT_CONFIGURED: Missing GPTI2_API_KEY environment variable'); };
const parseError = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  const detail = body?.error?.message || body?.error || body?.message || `${response.status} ${response.statusText}`;
  return typeof detail === 'string' ? detail : JSON.stringify(detail);
};
const request = async (path: string, init: RequestInit = {}) => {
  assertConfigured();
  const response = await fetch(`${GPTI2_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(GPTI2_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GPTI2_ERROR: ${await parseError(response)}`);
  return response.json();
};

const recipe = (payload: Record<string, unknown>) =>
  payload.__recipePayload && typeof payload.__recipePayload === 'object'
    ? payload.__recipePayload as Record<string, unknown>
    : payload;
const modelOf = (payload: Record<string, unknown>) => {
  const requestedModel = normalize(payload.model || payload.modelId || recipe(payload).model || recipe(payload).modelId);
  const model = MODEL_ALIASES[requestedModel] || requestedModel;
  if (!ALLOWED_MODELS.has(model)) throw new Error(`GPTI2_MODEL_UNSUPPORTED: ${model || '(empty)'}`);
  return model;
};
const promptOf = (payload: Record<string, unknown>) => String(payload.prompt || payload.userPromptInput || recipe(payload).prompt || '').trim();
const sourcesOf = (payload: Record<string, unknown>) => {
  const r = recipe(payload);
  const values = r.imageUrls || r.inputUrls || r.image_urls || payload.image_urls || payload.img_url || payload.image_url;
  return (Array.isArray(values) ? values : values ? [values] : []).map((v) => String(v || '').trim()).filter((v) => /^https?:\/\//i.test(v));
};
const qualityOf = (payload: Record<string, unknown>) => String(payload.quality || payload.speed || recipe(payload).quality || 'low');
const ratioOf = (payload: Record<string, unknown>) => String(
  payload.aspect_ratio || payload.aspectRatio || recipe(payload).aspect_ratio || recipe(payload).aspectRatio || '1:1',
);
const SIZE_BY_RESOLUTION_AND_RATIO: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024', '16:9': '1280x720', '9:16': '720x1280', '4:3': '1024x768',
    '3:4': '768x1024', '3:2': '1536x1024', '2:3': '1024x1536', '21:9': '1280x544',
  },
  '2K': {
    '1:1': '1536x1536', '16:9': '2560x1440', '9:16': '1440x2560', '4:3': '2048x1536',
    '3:4': '1536x2048', '3:2': '2400x1600', '2:3': '1600x2400', '21:9': '2560x1088',
  },
  '4K': {
    '1:1': '2048x2048', '16:9': '3840x2160', '9:16': '2160x3840', '4:3': '3200x2400',
    '3:4': '2400x3200', '3:2': '3360x2240', '2:3': '2240x3360', '21:9': '3840x1632',
  },
};
const sizeOf = (payload: Record<string, unknown>) => {
  const value = String(payload.size || payload.resolution || recipe(payload).size || '1K').trim().toUpperCase();
  return SIZE_BY_RESOLUTION_AND_RATIO[value]?.[ratioOf(payload)] || value;
};

const dataUrl = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // GPTi2 returns either b64_json or a temporary HTTPS result URL. Only the
  // former may be wrapped as a data URL; corrupting the latter prevents R2
  // from downloading and publishing an otherwise successful provider result.
  if (raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return raw;
  return `data:image/png;base64,${raw}`;
};
const extractUrl = (data: any) => dataUrl(data?.data?.[0]?.b64_json || data?.data?.[0]?.url || data?.url);

export const isGpti2Configured = () => Boolean(key());
export const isGpti2Model = (modelId: unknown) => ALLOWED_MODELS.has(MODEL_ALIASES[normalize(modelId)] || normalize(modelId));

export const submitGpti2Job = async (queueKind: string, payload: Record<string, unknown>) => {
  const model = modelOf(payload);
  const prompt = promptOf(payload);
  if (!prompt) throw new Error('GPTI2_ERROR: prompt is required');
  const sources = sourcesOf(payload);
  if (model.startsWith('nano-banana')) {
    let init: RequestInit;
    if (sources.length) {
      const form = new FormData(); form.set('prompt', prompt); form.set('model', model); form.set('aspect_ratio', ratioOf(payload));
      for (const [index, source] of sources.entries()) {
        const response = await fetch(source, { signal: AbortSignal.timeout(GPTI2_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`GPTI2_ERROR: Cannot download reference image ${index + 1}`);
        form.append('image', new Blob([await response.arrayBuffer()], { type: response.headers.get('content-type') || 'image/png' }), `reference-${index + 1}.png`);
      }
      init = { method: 'POST', body: form };
    } else {
      init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, model, aspect_ratio: ratioOf(payload) }) };
    }
    const data = await request(sources.length ? '/images/nano/edits' : '/images/nano/generations', init);
    const id = String(data?.id || '').trim();
    if (!id) throw new Error('GPTI2_ERROR: Nano endpoint did not return job id');
    return { jobId: id, provider: 'gpti2' as const, providerStartedAt: new Date().toISOString() };
  }
  if (sources.length) {
    const form = new FormData();
    form.set('prompt', prompt); form.set('model', model); form.set('size', sizeOf(payload)); form.set('quality', qualityOf(payload));
    for (const [index, source] of sources.entries()) {
      const response = await fetch(source, { signal: AbortSignal.timeout(GPTI2_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`GPTI2_ERROR: Cannot download reference image ${index + 1}`);
      form.append('image[]', new Blob([await response.arrayBuffer()], { type: response.headers.get('content-type') || 'image/png' }), `reference-${index + 1}.png`);
    }
    const data = await request('/images/edits', { method: 'POST', body: form });
    const result = extractUrl(data);
    if (!result) throw new Error('GPTI2_ERROR: edit endpoint returned no image');
    return { jobId: 'inline', inlineResult: result, provider: 'gpti2' as const, providerStartedAt: new Date().toISOString() };
  }
  const data = await request('/images/generations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, size: sizeOf(payload), quality: qualityOf(payload), n: 1 }),
  });
  const result = extractUrl(data);
  if (!result) throw new Error('GPTI2_ERROR: generation endpoint returned no image');
  return { jobId: 'inline', inlineResult: result, provider: 'gpti2' as const, providerStartedAt: new Date().toISOString() };
};

export const pollGpti2Job = async (jobId: string, inlineResult?: string) => {
  if (inlineResult) return { status: 'completed', result: inlineResult };
  const data = await request(`/images/nano/${encodeURIComponent(jobId)}`);
  const status = normalize(data?.status);
  const result = data?.data?.[0]?.url || data?.data?.[0]?.taiUrl || data?.data?.[0]?.b64_json;
  if (['succeeded', 'success', 'completed', 'done'].includes(status) && result) return { status: 'completed', result: dataUrl(result), progress: 100 };
  if (['failed', 'error', 'cancelled', 'canceled', 'interrupted'].includes(status)) return { status: 'failed', error: data?.error || 'GPTi2 job failed' };
  return { status: 'processing', progress: status === 'running' ? 70 : 40 };
};

export const cancelGpti2Job = async () => false;
