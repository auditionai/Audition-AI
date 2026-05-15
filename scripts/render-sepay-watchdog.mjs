import 'dotenv/config';

import { runSePayPendingReconcile } from '../netlify/functions/sepay-reconcile-pending.ts';

const main = async () => {
  const summary = await runSePayPendingReconcile();
  console.log('[sepay-watchdog]', JSON.stringify(summary));
};

main().catch((error) => {
  console.error('[sepay-watchdog] Fatal error:', error);
  process.exitCode = 1;
});
