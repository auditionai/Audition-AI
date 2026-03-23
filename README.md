# Tramsangtao API

Base URL: `https://api.tramsangtao.com/v1`

## Authentication

All requests require a Bearer token:

```
Authorization: Bearer <YOUR_API_KEY>
```

Get your API key at [tramsangtao.com/api-keys](https://tramsangtao.com/api-keys).

## Quickstart

### Generate an image

```bash
curl -X POST https://api.tramsangtao.com/v1/image/generate \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A futuristic city at sunset", "model": "nano-banana-pro"}'
```

Response:
```json
{
  "job_id": "abc-123",
  "status": "pending",
  "cost": 30,
  "balance_remaining": 970
}
```

### Poll for result

```bash
curl https://api.tramsangtao.com/v1/jobs/abc-123 \
  -H "Authorization: Bearer YOUR_KEY"
```

Response (when completed):
```json
{
  "status": "completed",
  "result": "https://cdn.tramsangtao.com/.../image.jpg",
  "progress": 100
}
```

## Workflows

### Text-to-Image (T2I)

1. `POST /image/generate` with `prompt` + `model` -> get `job_id`
2. `GET /jobs/{job_id}` -> poll until `status: "completed"` -> get `result` URL

### Image-to-Image (I2I)

1. `POST /image/generate` with `prompt` + `model` + `input_image` (file) or `img_url` -> get `job_id`
2. `GET /jobs/{job_id}` -> poll until completed

### Text-to-Video (T2V)

1. `POST /video/generate` with `prompt` + `model` + `duration` -> get `job_id`
2. `GET /jobs/{job_id}` -> poll until completed (~30-120s)

### Image-to-Video (I2V) — All models

1. `POST /files/upload/image` with `file` -> get `url`
2. `POST /video/generate` with `prompt` + `model` + `img_url` (from step 1) + `duration` -> get `job_id`
3. `GET /jobs/{job_id}` -> poll until completed

Works with all video models (Kling, Veo, etc.) — backend handles provider-specific re-upload automatically.

### Motion Control

1. `POST /files/upload/image` with character image -> get `url` (character_image_url)
2. `POST /files/upload/video` with motion video -> get `url` (motion_video_url)
3. `POST /motion/generate` with `character_image_url` + `motion_video_url` + `mode` -> get `job_id`
4. `GET /jobs/{job_id}` -> poll until completed

### KOL AI (Avatar Video)

1. `POST /files/upload/audio` with audio file -> get `audio_id`, `duration`, `costs`
2. `POST /files/upload/image` with character image -> get `url` (image_url)
3. `POST /kol-ai/generate` with `audio_id` + `image_url` + `quality` -> get `job_id`
4. `GET /jobs/{job_id}` -> poll until completed

### Download / Extract (Free)

```bash
curl -X POST https://api.tramsangtao.com/v1/download/extract \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://tiktok.com/..."}'
```

No credits charged. Supported: TikTok, Douyin, YouTube, Facebook, Instagram, X/Twitter.

## Rate Limits

| Resource | Limit |
|----------|-------|
| Total concurrent jobs | 5 |
| Image concurrent | 3 |
| Video concurrent | 3 |
| Queue slots | 3 |

Limits vary by subscription plan. Check your limits: `GET /limits`.

## Content Format

All endpoints accept both `application/json` and `multipart/form-data`.
Use `multipart/form-data` when uploading files.

## Docs

- [Models & Pricing](models.md) — Available models, capabilities, credit costs
- [Errors](errors.md) — Error codes and troubleshooting
- Endpoints:
  - [Image Generation](endpoints/image.md)
  - [Video Generation](endpoints/video.md)
  - [Motion Control](endpoints/motion.md)
  - [KOL AI](endpoints/kol-ai.md)
  - [Jobs](endpoints/jobs.md)
  - [Files](endpoints/files.md)
  - [Account](endpoints/account.md)
  - [Download](endpoints/download.md)
