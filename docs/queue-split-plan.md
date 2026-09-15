# Queue worker split

The queue path is split into independent failure domains:

- `queue-gpti2-worker.js` consumes `auditionai-gpti2-jobs-v2` for `gpti2_image` and `gpti2_edit`.
- `queue-tst-worker.js` consumes `auditionai-tst-jobs-v2` for `tst_image`, `tst_video`, and `tst_edit`; video polling is self-enqueued with a delay.
- `queue-router.js` authenticates wake requests and routes each lane to its queue binding.
- `_queue-shared.js` contains claim, persistence, logging, and queue-delay helpers.

Deploy with the dedicated configs:

```text
npx wrangler deploy --config cloudflare/queue-gpti2.wrangler.jsonc
npx wrangler deploy --config cloudflare/queue-tst.wrangler.jsonc
npx wrangler deploy --config cloudflare/queue-router.wrangler.jsonc
```

`wrangler.jsonc` and `cloudflare/queue-worker.wrangler.jsonc` are retained as
legacy stubs for rollback/reference and must not be deployed.
