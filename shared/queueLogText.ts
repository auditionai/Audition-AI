import type { QueueProgressLogEntry } from './queueRecipes';

const SUSPICIOUS_MOJIBAKE_PATTERN = /(?:Ã|Ä|Â|â€|áº|á»)/;
const utf8Decoder = new TextDecoder('utf-8');

const mojibakeScore = (value: string) => (value.match(/(?:Ã|Ä|Â|â€|áº|á»)/g) || []).length;

const decodeLatin1AsUtf8 = (value: string) => {
  const bytes = new Uint8Array(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
  return utf8Decoder.decode(bytes);
};

export const repairVietnameseMojibake = (value?: string | null) => {
  if (typeof value !== 'string' || value.length === 0 || !SUSPICIOUS_MOJIBAKE_PATTERN.test(value)) {
    return value || '';
  }

  let repaired = value;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!SUSPICIOUS_MOJIBAKE_PATTERN.test(repaired)) {
      break;
    }

    const decoded = decodeLatin1AsUtf8(repaired);
    if (!decoded || decoded === repaired || mojibakeScore(decoded) > mojibakeScore(repaired)) {
      break;
    }

    repaired = decoded;
  }

  return repaired;
};

export const normalizeQueueProgressLogs = (
  logs: QueueProgressLogEntry[] | null | undefined,
): QueueProgressLogEntry[] => (logs || []).map((entry) => ({
  ...entry,
  message: repairVietnameseMojibake(entry.message),
}));

