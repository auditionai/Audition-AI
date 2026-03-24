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
