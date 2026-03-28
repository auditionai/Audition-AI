const truthyValues = new Set(['1', 'true', 'yes', 'on']);

const normalize = (value?: string | null) => String(value || '').trim().toLowerCase();

export const isDedicatedQueueWorkerMode = () => {
  const queueWorkerMode = normalize(process.env.QUEUE_WORKER_MODE);
  const disableTrigger = normalize(process.env.DISABLE_BACKGROUND_QUEUE_TRIGGER);

  return (
    queueWorkerMode === 'dedicated' ||
    queueWorkerMode === 'render' ||
    truthyValues.has(disableTrigger)
  );
};
