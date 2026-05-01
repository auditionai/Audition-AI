# Models & Pricing

All models available via the API. Credits are deducted per generation.

> Auto-generated from `model_server_config` DB.
> Run `python scripts/generate_api_docs.py` to regenerate.

## Image Models

| Model | Display Name | Servers | Resolution | Speed | Credits |
|-------|-------------|---------|-----------|-------|---------|
| `flux-2-pro` | Flux 2 Pro | fast, vip1 | 1k, 2k | fast, slow | 10–30 |
| `grok-image` | Grok Image | fast | default | fast | 20 |
| `image-4.0` | Imagen 4.0 | fast | default | fast | 4 |
| `image-gpt` | Chat GPT Image | vip1 | default | fast, slow | 8–40 |
| `image-gpt-2` | GPT Image 2 | fast | 1k, 2k, 4k | fast | 20–60 |
| `imagen-4` | Imagen 4 | fast | default | fast | 20 |
| `imagen-4-fast` | Imagen 4 Fast | fast | default | fast | 20 |
| `imagen-4-ultra` | Imagen 4 Ultra | fast | default | fast | 30 |
| `kling-o1-image` | Kling O1 Image | vip1 | 1k, 2k | fast, slow | 12–35 |
| `nano-banana` | Nano Banana | fast, vip1 | default | fast, slow | 1–20 |
| `nano-banana-2` | Nano Banana 2 | fast | 1k, 2k, 4k | fast | 20–40 |
| `nano-banana-pro` | Nano Banana PRO | fast, vip1 | 1k, 2k, 4k | fast, slow | 12–70 |
| `nano-banana-pro-cheap` | Nano Banana PRO Cheap | fast | default | fast | 10 |
| `seedream-4.5` | Seedream 4.5 | fast, vip1 | 2k, 4k | fast, slow | 15–70 |

## Video Models

| Model | Display Name | Servers | Resolution | Duration | Aspect Ratio | Audio | Credits |
|-------|-------------|---------|-----------|----------|-------------|-------|---------|
| `kling-2.5-turbo` | Kling 2.5 Turbo | fast, vip1, vip2 | 1080p, 720p | 5s, 10s | — | No | 10–300 |
| `kling-2.6` | Kling 2.6 | fast, vip1, vip2 | 1080p, 720p | 5s, 10s | 16:9, 9:16, 1:1 | Yes | 15–640 |
| `kling-3.0-video` | Kling 3.0 Video | fast, vip1 | 1080p, 720p | 3s, 5s, 10s, 15s | 16:9, 9:16, 1:1 | Yes | 15–720 |
| `kling-o1-video` | Kling O1 Video | vip2 | 1080p, 720p | 5s, 10s | 16:9, 9:16, 1:1 | No | 60–600 |
| `sora-2.0` | Sora 2.0 | vip1 | — | 10s, 15s, 25s | 16:9, 9:16 | No | 20–50 |
| `veo3.1-low` | Veo 3.1 LOW | fast | — | 8s | 16:9, 9:16 | No | 10 |

## Motion Control Models

| Model | Display Name | Servers | Resolution | Credits |
|-------|-------------|---------|-----------|---------|
| `motion-control-2.6` | Motion Control 2.6 | vip2 | 1080p, 720p | 60–90 |
| `motion-control-3.0` | Motion Control 3.0 | Cheap, vip2 | 1080p, 720p | 12–120 |

## KOL AI Models

| Model | Display Name | Servers | Pricing | Credits |
|-------|-------------|---------|---------|---------|
| `kling-avatar` | Kling Avatars 2.0 | vip1 | per-second | 5–10 |

## Server Tiers

| Server | Description |
|--------|-------------|
| `vip1` | Premium — fastest, highest priority |
| `vip2` | Standard — reliable, moderate speed |
| `fast` | Economy — lower cost, may be slightly slower |
| `Cheap` | Budget — lowest cost (motion control only) |

When `server_id` is not specified, the system auto-selects the best available server.
