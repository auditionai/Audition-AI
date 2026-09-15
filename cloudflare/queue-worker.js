// Legacy placeholder. Deploy queue-gpti2-worker.js and queue-tst-worker.js instead.
import { json } from './_queue-shared.js';

export default {
  async fetch() { return json({ ok: false, deprecated: true, worker: 'queue-worker-legacy-stub' }, 410); },
  async queue(batch) { for (const message of batch.messages) message.ack(); },
};
