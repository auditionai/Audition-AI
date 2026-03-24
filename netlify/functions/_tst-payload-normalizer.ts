const lowerIfString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : value;

export const normalizeTstOutboundPayload = (payload: Record<string, unknown> | null | undefined) => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const normalized: Record<string, unknown> = {
    ...payload,
  };

  if ('model' in normalized) normalized.model = lowerIfString(normalized.model);
  if ('resolution' in normalized) normalized.resolution = lowerIfString(normalized.resolution);
  if ('speed' in normalized) normalized.speed = lowerIfString(normalized.speed);
  if ('duration' in normalized) normalized.duration = lowerIfString(normalized.duration);
  if ('mode' in normalized) normalized.mode = lowerIfString(normalized.mode);
  if ('config_key' in normalized) normalized.config_key = lowerIfString(normalized.config_key);

  return normalized;
};
