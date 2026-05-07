export type VideoScriptDirectorOptions = {
  style?: string;
  theme?: string;
  soundMood?: string;
  voiceDialogue?: boolean;
  targetModel?: string;
};

export const generateVideoScriptWithVertex = async ({
  imageSource,
  durationSeconds,
  userPrompt,
  scriptOptions,
}: {
  imageSource: string;
  durationSeconds: number | string;
  userPrompt?: string;
  scriptOptions?: VideoScriptDirectorOptions;
}) => {
  const requestBody = JSON.stringify({
    imageSource,
    durationSeconds,
    userPrompt: userPrompt || '',
    scriptOptions: scriptOptions || {},
  });

  const endpoints = ['/api/video-script-director', '/.netlify/functions/video-script-director'];
  let response: Response | null = null;
  let payload: any = {};

  for (const endpoint of endpoints) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });

    payload = await response.json().catch(() => ({}));

    if (response.status === 404 && endpoint !== endpoints[endpoints.length - 1]) {
      continue;
    }

    break;
  }

  if (!response?.ok) {
    throw new Error(payload?.error || 'Không thể tạo kịch bản video bằng Vertex AI.');
  }

  const script = typeof payload?.script === 'string' ? payload.script.trim() : '';
  if (!script) {
    throw new Error('Vertex AI không trả về kịch bản video.');
  }

  return script;
};
