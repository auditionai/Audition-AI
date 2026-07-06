import { runQueueWorker, type QueueWorkerLane, type QueueWorkerOptions } from './_queue-worker';

type QueueWorkerSummary = Awaited<ReturnType<typeof runQueueWorker>>;

export type QueueDaemonSummary = QueueWorkerSummary & {
  iterations: number;
  runtimeMs: number;
  exitedIdle: boolean;
};

type QueueDaemonOptions = {
  lane?: QueueWorkerLane;
  maxRuntimeMs?: number;
  idleIterationsToStop?: number;
  activeDelayMs?: number;
  idleDelayMs?: number;
};

const DEFAULT_MAX_RUNTIME_MS = 45_000;
const DEFAULT_IDLE_ITERATIONS_TO_STOP = 8;
const DEFAULT_ACTIVE_DELAY_MS = 250;
const DEFAULT_IDLE_DELAY_MS = 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createSummary = (): QueueDaemonSummary => ({
  claimedForDispatch: 0,
  submitted: 0,
  claimedForPoll: 0,
  completed: 0,
  failed: 0,
  requeued: 0,
  iterations: 0,
  runtimeMs: 0,
  exitedIdle: false,
});

const mergeSummary = (target: QueueDaemonSummary, source: QueueWorkerSummary) => {
  target.claimedForDispatch += Number(source.claimedForDispatch || 0);
  target.submitted += Number(source.submitted || 0);
  target.claimedForPoll += Number(source.claimedForPoll || 0);
  target.completed += Number(source.completed || 0);
  target.failed += Number(source.failed || 0);
  target.requeued += Number(source.requeued || 0);
};

const hasWorkerActivity = (summary: QueueWorkerSummary) =>
  Number(summary.claimedForDispatch || 0) > 0 ||
  Number(summary.submitted || 0) > 0 ||
  Number(summary.claimedForPoll || 0) > 0 ||
  Number(summary.completed || 0) > 0 ||
  Number(summary.failed || 0) > 0 ||
  Number(summary.requeued || 0) > 0;

export const runQueueDaemon = async (options: QueueDaemonOptions = {}): Promise<QueueDaemonSummary> => {
  const {
    lane = 'all',
    maxRuntimeMs = DEFAULT_MAX_RUNTIME_MS,
    idleIterationsToStop = DEFAULT_IDLE_ITERATIONS_TO_STOP,
    activeDelayMs = DEFAULT_ACTIVE_DELAY_MS,
    idleDelayMs = DEFAULT_IDLE_DELAY_MS,
  } = options;

  const startedAt = Date.now();
  const aggregate = createSummary();
  let idleIterations = 0;

  while (Date.now() - startedAt < maxRuntimeMs) {
    const workerOptions: QueueWorkerOptions = { lane };
    const summary = await runQueueWorker(workerOptions);
    aggregate.iterations += 1;
    mergeSummary(aggregate, summary);

    if (hasWorkerActivity(summary)) {
      idleIterations = 0;
      await sleep(activeDelayMs);
      continue;
    }

    idleIterations += 1;
    if (idleIterations >= idleIterationsToStop) {
      aggregate.exitedIdle = true;
      break;
    }

    await sleep(idleDelayMs);
  }

  aggregate.runtimeMs = Date.now() - startedAt;
  return aggregate;
};
