# ✅ Queue Split Deployment Complete

**Deployment Date:** 2026-09-15  
**Supabase Project:** `wnosrdigcdjlrmofxemd.supabase.co`

---

## 🎯 What Was Deployed

### Cloudflare Workers (✅ LIVE)

| Worker | URL | Queue | Status |
|--------|-----|-------|--------|
| **Router** | `auditionai-queue-router.kaunaxi758.workers.dev` | Producer for both queues | ✅ Deployed |
| **GPTi2** | `auditionai-queue-gpti2.kaunaxi758.workers.dev` | `auditionai-gpti2-jobs-v2` | ✅ Deployed |
| **TST** | `auditionai-queue-tst.kaunaxi758.workers.dev` | `auditionai-tst-jobs-v2` | ✅ Deployed |

### Secrets Configured

**Router:**
- ✅ `QUEUE_WORKER_SECRET`: `d05b14423d3ce9983753cbc8e5d2f6a1bc3955fab9c0430698ee516ba43ad575`

**GPTi2 Worker:**
- ✅ `QUEUE_WORKER_SECRET`
- ✅ `SUPABASE_SERVICE_KEY`
- ✅ `GPTI2_API_KEY`

**TST Worker:**
- ✅ `QUEUE_WORKER_SECRET`
- ✅ `SUPABASE_SERVICE_KEY`
- ✅ `TST_API_KEY`

---

## 🔧 Required Netlify Environment Variables

Bạn cần thêm 2 biến môi trường mới vào Netlify:

```bash
CLOUDFLARE_QUEUE_ROUTER_URL=https://auditionai-queue-router.kaunaxi758.workers.dev
CLOUDFLARE_QUEUE_WORKER_SECRET=d05b14423d3ce9983753cbc8e5d2f6a1bc3955fab9c0430698ee516ba43ad575
```

**Cách thêm:**
1. Vào Netlify Dashboard → Site Settings → Environment Variables
2. Xóa biến cũ `CLOUDFLARE_GPTI2_ROUTER_URL` (nếu có)
3. Thêm 2 biến trên

---

## 📋 Architecture Overview

```
User Request (Netlify)
    ↓
netlify/functions/queue-submit.ts
    ↓
Supabase DB (generated_images table)
    ↓
Wake Router (POST with QUEUE_WORKER_SECRET)
    ↓
auditionai-queue-router.kaunaxi758.workers.dev
    ↓
Route to appropriate queue:
    ├─ GPTi2: auditionai-gpti2-jobs-v2
    └─ TST: auditionai-tst-jobs-v2
    ↓
Consumer workers process jobs
    ├─ auditionai-queue-gpti2 (image/edit)
    └─ auditionai-queue-tst (image/video/edit with polling)
```

---

## 🚨 Legacy Workers (DO NOT USE)

Các workers sau đây chỉ return **410 Gone** - không deploy:
- ❌ `wrangler.jsonc` (root legacy stub)
- ❌ `cloudflare/queue-worker.wrangler.jsonc` (monolith stub)

---

## ✅ Validation Results

**Syntax Check:**
```
✅ queue-gpti2-worker.js
✅ queue-tst-worker.js
✅ queue-router.js
✅ _queue-shared.js
```

**Dry-Run:**
```
✅ Router:  1.51 KiB
✅ GPTi2:  14.50 KiB
✅ TST:    33.01 KiB
```

**Code Inspection:**
- ✅ No legacy `auditionai-queue-worker` references in active code
- ✅ Router uses `ROUTER_QUEUE_GPTI2` + `ROUTER_QUEUE_TST`
- ✅ Netlify function updated to use router URL + secret

---

## 📊 What Changed

### Before (Monolith)
- 1 worker: `auditionai-queue-worker` (506 lines)
- 1 queue: `auditionai-queue-worker`
- Mixed GPTi2 + TST logic
- Cron-based polling

### After (Split)
- 3 workers: Router (22 lines) + GPTi2 (133 lines) + TST (489 lines)
- 2 queues: `auditionai-gpti2-jobs-v2` + `auditionai-tst-jobs-v2`
- Separated concerns
- Self-delayed polling for TST (no cron)

---

## 🎯 Next Steps

1. **Thêm Netlify env vars** (xem phần trên)
2. **Test end-to-end:**
   - Tạo 1 job GPTi2 image → check queue router → check GPTi2 worker logs
   - Tạo 1 job TST video → check queue router → check TST worker logs
3. **Monitor logs:**
   ```bash
   npx wrangler tail --config cloudflare/queue-router.wrangler.jsonc
   npx wrangler tail --config cloudflare/queue-gpti2.wrangler.jsonc
   npx wrangler tail --config cloudflare/queue-tst.wrangler.jsonc
   ```

---

## 🔐 Security Notes

- ✅ Authentication: Router validates `QUEUE_WORKER_SECRET`
- ✅ Secrets: All API keys stored in Cloudflare secrets (not in code)
- ✅ Supabase RLS: Workers use service role key for DB operations

---

**Deployment completed successfully! 🎉**
