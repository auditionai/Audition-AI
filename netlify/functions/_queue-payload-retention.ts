type QueuePayload = Record<string, unknown>;

const MAX_PROMPT_LENGTH = 4_000;
const MAX_USER_PROMPT_LENGTH = 2_000;
const MAX_LOG_ENTRIES = 20;

const toPayload = (value: unknown): QueuePayload =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as QueuePayload
    : {};

const truncateText = (value: unknown, limit: number) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : undefined;
};

const keepValue = (payload: QueuePayload, key: string) =>
  payload[key] === undefined || payload[key] === null ? undefined : payload[key];

export const compactTerminalQueuePayload = (value: unknown): QueuePayload => {
  const payload = toPayload(value);
  if (JSON.stringify(payload).length <= 64 * 1024) {
    return { ...payload, __payloadCompacted: true };
  }

  const embeddedRecipe = toPayload(payload.__recipePayload);
  const recipe = Object.keys(embeddedRecipe).length > 0 ? embeddedRecipe : payload;
  const logs = Array.isArray(payload.__logs)
    ? payload.__logs.slice(-MAX_LOG_ENTRIES)
    : undefined;

  const compactRecipe: QueuePayload = {
    recipeType: keepValue(recipe, 'recipeType'),
    userPromptInput: truncateText(recipe.userPromptInput, MAX_USER_PROMPT_LENGTH),
    prompt: truncateText(recipe.prompt, MAX_PROMPT_LENGTH),
    modelId: keepValue(recipe, 'modelId'),
    serverId: keepValue(recipe, 'serverId'),
    aspectRatio: keepValue(recipe, 'aspectRatio'),
    resolution: keepValue(recipe, 'resolution'),
    duration: keepValue(recipe, 'duration'),
  };

  return Object.fromEntries(Object.entries({
    __payloadCompacted: true,
    __stage: keepValue(payload, '__stage'),
    __showInGenerationHistory: keepValue(payload, '__showInGenerationHistory'),
    __clientPlatform: keepValue(payload, '__clientPlatform'),
    __recipePayload: Object.fromEntries(
      Object.entries(compactRecipe).filter(([, entry]) => entry !== undefined),
    ),
    __logs: logs,
    prompt: truncateText(payload.prompt, MAX_PROMPT_LENGTH),
    model: keepValue(payload, 'model'),
    model_id: keepValue(payload, 'model_id'),
    server_id: keepValue(payload, 'server_id'),
    config_key: keepValue(payload, 'config_key'),
  }).filter(([, entry]) => {
    if (entry === undefined || entry === null) return false;
    return !(typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).length === 0);
  }));
};
