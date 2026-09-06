const durationSecondsFromValue = (value: string | number) => {
  const parsed = Number(String(value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 6;
};

export const targetVideoSceneCount = (duration: string | number) => {
  const seconds = durationSecondsFromValue(duration);
  if (seconds <= 7) return 3;
  if (seconds <= 12) return 5;
  return 7;
};

// Tolerate markdown headings, accented Vietnamese, and legacy unaccented output.
const scenePattern = /^\s*(?:#{1,6}\s*)?(?:c\u1ea3nh|canh)\s+\d+\s*(?:\([^\n]*\))?\s*:\s*/gimu;
const sceneHeading = (index: number) => `C\u1ea3nh ${index + 1}:`;

export const compileVideoScriptForDuration = (masterScript: string, duration: string | number) => {
  const source = String(masterScript || '').trim();
  if (!source) return source;

  const desiredCount = targetVideoSceneCount(duration);
  const matches = Array.from(source.matchAll(scenePattern));
  if (matches.length === 0) return source;

  const firstSceneStart = matches[0].index ?? 0;
  const prefix = source.slice(0, firstSceneStart).trim();
  const scenes = matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? source.length) : source.length;
    return source.slice(start + match[0].length, end).trim();
  });

  // Keep the opening, middle, and closing beats when reducing the master script.
  const selected = scenes.length <= desiredCount
    ? scenes
    : Array.from({ length: desiredCount }, (_, index) => scenes[Math.round(index * (scenes.length - 1) / (desiredCount - 1))]);

  const compiledScenes = selected.map((scene, index) => `${sceneHeading(index)}\n${scene}`.trim());
  const seconds = durationSecondsFromValue(duration);
  const buildNote = `B\u1ea3n d\u1ef1ng cho video ${seconds} gi\u00e2y: s\u1eed d\u1ee5ng \u0111\u00fang ${compiledScenes.length} c\u1ea3nh d\u01b0\u1edbi \u0111\u00e2y, m\u1ed7i c\u1ea3nh kho\u1ea3ng ${Math.max(1, Math.round(seconds / compiledScenes.length))} gi\u00e2y, ph\u1ee7 k\u00edn to\u00e0n b\u1ed9 th\u1eddi l\u01b0\u1ee3ng v\u00e0 kh\u00f4ng k\u1ebft th\u00fac s\u1edbm.`;

  return [prefix, buildNote, compiledScenes.join('\n\n')].filter(Boolean).join('\n\n').trim();
};
