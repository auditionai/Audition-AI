# Cloudflare Workers production cutover

The Cloudflare implementation is split by failure domain instead of placing all
provider work in one Worker:

| Worker/config | Responsibility |
| --- | --- |
| `queue-gpti2.wrangler.jsonc` | GPTi2 image/edit queue consumer. |
| `queue-tst.wrangler.jsonc` | TST image/video/edit queue consumer with delayed polling. |
| `queue-router.wrangler.jsonc` | Authenticated producer/wake endpoint routing jobs to either queue. |
| `../wrangler.jsonc` | Legacy unified queue stub; do not deploy. |
| `direct-edit.wrangler.jsonc` | Nano direct-image-edit lane and idempotent refund on terminal failure. |
| `video-script.wrangler.jsonc` | Image-to-script director worker. |
| `operations.wrangler.jsonc` | Queue stale-job recovery/refund and history cleanup. |
| `api.wrangler.jsonc` | Public `/api/*` edge routes: SePay checkout/IPN/reconciliation, video script submit/status, TST upload proxies, R2 upload/delete, safe download proxy and bounded admin R2 cleanup. |

## Production sequence

1. Apply every migration in `../supabase/migrations`, including the three
   `20260914*cloudflare*` migrations. The recovery/refund RPC is intentionally
   database-atomic, so a retrying Worker cannot credit a job twice.
2. Create the Queues `auditionai-gpti2-jobs-v2` and
   `auditionai-tst-jobs-v2`, and bind the existing R2 bucket
   `audition-ai-images` (the committed Wrangler configs name these resources).
3. Set Worker secrets using `wrangler secret put`, never `vars`:

   - GPTi2 queue worker: `SUPABASE_SERVICE_ROLE_KEY`, `GPTI2_API_KEY`, `QUEUE_WORKER_SECRET`
   - TST queue worker: `SUPABASE_SERVICE_ROLE_KEY`, `TST_API_KEY`, `QUEUE_WORKER_SECRET`
   - Queue router: `QUEUE_WORKER_SECRET` (must exactly match Netlify's
     `CLOUDFLARE_QUEUE_WORKER_SECRET`). The router authenticates wake requests
     with this value; it does not access Supabase.
   - Direct edit: `SUPABASE_SERVICE_ROLE_KEY`, `GPTI2_API_KEY`, `DIRECT_EDIT_WORKER_SECRET`
   - Video script: `SUPABASE_SERVICE_ROLE_KEY`, `VIDEO_SCRIPT_WORKER_SECRET`; `CLAUDE_API_KEY` is optional because the Worker uses the active `[CLAUDE]` key in Supabase when present.
   - Operations: `SUPABASE_SERVICE_ROLE_KEY`, `OPERATIONS_WORKER_SECRET`
   - API: `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TST_API_KEY`, `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY`, `SEPAY_API_TOKEN`, `SEPAY_RECONCILE_SECRET`, `OPERATIONS_WORKER_SECRET`, `VIDEO_SCRIPT_WORKER_SECRET`, `VIDEO_SCRIPT_WORKER_URL`

4. Deploy each config with its own `wrangler deploy --config ...` command.
   The API Worker has a fixed `NETLIFY_API_ORIGIN` compatibility fallback:
   edge-native routes stay on Cloudflare while unported `/api/*` requests proxy
   to Netlify. It is therefore safe to bind the Worker to
   `https://<production-host>/api/*` without breaking the existing frontend.
   Set SePay's IPN URL to
   `https://<production-host>/api/sepay-ipn` and its checkout return URLs to
   the same production host.
5. SePay remains deliberately disabled until its three production secrets
   (`SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY`, and `SEPAY_API_TOKEN`) are set on
   `auditionai-api-worker`. The queue watchdog continues independently while
   this payment lane is staged.
6. Only after the route is live, disable the matching Netlify scheduled
   functions. Keep Netlify routes as rollback until a SePay checkout and a
   small authenticated R2 upload have passed in production.

`api-worker.js` rejects unauthenticated user/admin operations, restricts R2
keys to the authenticated user's prefix, bounds administrative deletion to an
explicit prefix/date range, and does not follow provider redirects to private
or local HTTP targets. Workers Logs and Traces are enabled in all production
configs.

# Cloudflare Telegram Notify Worker

This worker receives job events from Netlify Functions and forwards them to Telegram.

## What it sends

- queued jobs
- completed jobs
- failed jobs
- user name, email, job id
- tool name, mode, resolution, speed, server, vcoin
- input media preview when available
- output media on success
- error message on failure

## 1. Create the Telegram bot

1. Open `@BotFather` in Telegram.
2. Run `/newbot`.
3. Save the bot token.
4. Add the bot to your private group or channel.
5. Send one test message in that chat.

## 2. Get the Telegram chat id

Open this in your browser after replacing the token:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

Look for `chat.id`.

- Private chat ids are usually positive numbers.
- Group ids are usually negative numbers like `-100...`.

## 3. Create the Cloudflare Worker

1. Go to Cloudflare Dashboard.
2. Open `Workers & Pages`.
3. Create a new Worker.
4. Replace the default code with [`telegram-notify-worker.js`](./telegram-notify-worker.js).
5. Deploy it once.

## 4. Add Worker secrets

In the Worker settings, add:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_WEBHOOK_SECRET`

Optional:

- `TELEGRAM_MESSAGE_THREAD_ID`

Use `TELEGRAM_MESSAGE_THREAD_ID` only if you send into a Telegram topic.

## 5. Add Netlify env vars

In Netlify, set:

- `TELEGRAM_NOTIFY_WEBHOOK_URL`
- `TELEGRAM_NOTIFY_WEBHOOK_SECRET`

Example:

```text
TELEGRAM_NOTIFY_WEBHOOK_URL=https://your-worker.your-subdomain.workers.dev
TELEGRAM_NOTIFY_WEBHOOK_SECRET=your-long-random-secret
```

The secret in Netlify and Cloudflare must match exactly.

## 6. Deploy the app

After Netlify redeploys, new queue events will start posting to the worker.

This repo already has a scheduled Netlify function in [`queue-cron.ts`](../netlify/functions/queue-cron.ts) that runs every minute, so queue progress can continue without your computer being on.

## Notes

- The worker only attaches media if the URL is public HTTP/HTTPS.
- If an input is still a local data URL or a private file, the text alert still works but the media will be skipped.
- If Telegram cannot fetch a media URL, the worker falls back to sending the URL as text.
