import 'dotenv/config';

import { runQueueWatchdog } from '../netlify/functions/_queue-watchdog.ts';

const main = async () => {
  const summary = await runQueueWatchdog({ runWorkerAfterRescue: true });
  console.log('[queue-watchdog]', JSON.stringify(summary));
};

main().catch((error) => {
  console.error('[queue-watchdog] Fatal error:', error);
  process.exitCode = 1;
});
