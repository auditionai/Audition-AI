export const generateVideoScriptWithVertex = async ({
  imageSource,
  durationSeconds,
  userPrompt,
}: {
  imageSource: string;
  durationSeconds: number | string;
  userPrompt?: string;
}) => {
  const response = await fetch('/api/video-script-director', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageSource,
      durationSeconds,
      userPrompt: userPrompt || '',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Không thể tạo kịch bản video bằng Vertex AI.');
  }

  const script = typeof payload?.script === 'string' ? payload.script.trim() : '';
  if (!script) {
    throw new Error('Vertex AI không trả về kịch bản video.');
  }

  return script;
};

