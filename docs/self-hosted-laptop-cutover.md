# Self-Hosted Supabase On Laptop Cutover

Muc tieu:
- Khong dung Supabase cloud cu nua
- Chay Supabase self-hosted tren chinh may tinh ca nhan
- Netlify van host frontend/domain
- Render van chay background queue worker
- Sau nay co the chuyen sang VPS ma khong phai doi nhieu code

## Kien truc de xuat

Giai doan 1:
- Frontend: Netlify
- API business logic: Netlify Functions
- Background worker: Render
- Database/Auth/REST: Supabase self-hosted tren laptop

Giai doan 2 tuy chon:
- Chuyen API business logic tu Netlify ve laptop bang `npm run render:web`
- Chuyen queue worker tu Render ve laptop bang `npm run render:queue-worker`

## Hostname nen dung ngay tu dau

Nen dat ten mien on dinh de sau nay doi laptop -> VPS chi can doi dich:

- `https://supabase.auditionai.io.vn` -> Supabase self-hosted tren laptop
- `https://app.auditionai.io.vn` hoac domain chinh -> frontend Netlify
- `https://api.auditionai.io.vn` -> chi can neu sau nay chuyen API ve laptop

## Trang thai repo hien tai

Code hien tai da tach env kha tot:

- Frontend doc Supabase qua `services/supabaseClient.ts`
- Netlify Functions doc Supabase qua `netlify/functions/_supabase.ts`
- Render worker doc Supabase qua env trong `render.yaml`

Dieu nay co nghia la khong can viet lai app. Chi can doi env va endpoint.

## Viec can lam tiep theo

### 1. Expose Supabase local ra internet

Can co HTTPS public URL tro vao local Supabase port `54321`.

Lua chon de xuat:
- Cloudflare Tunnel

Ket qua mong muon:
- `https://supabase.auditionai.io.vn` -> `http://127.0.0.1:54321`

### 2. Chuyen Google OAuth sang hostname moi

Trong Google Cloud:
- Authorized redirect URI:
  - `https://supabase.auditionai.io.vn/auth/v1/callback`

Trong `supabase/config.toml`:
- `site_url` nen la domain frontend public
- `additional_redirect_urls` nen gom:
  - `https://app.auditionai.io.vn/**`
  - `https://auditionai.io.vn/**`
  - `http://localhost:5173/**`
  - `http://localhost:8888/**`

### 3. Doi env tren Netlify

Can doi cac bien:

- `VITE_SUPABASE_URL=https://supabase.auditionai.io.vn`
- `SUPABASE_URL=https://supabase.auditionai.io.vn`
- `VITE_SUPABASE_ANON_KEY=<publishable-key-tu-self-hosted-supabase>`
- `SUPABASE_ANON_KEY=<publishable-key-tu-self-hosted-supabase>`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-key-tu-self-hosted-supabase>`

### 4. Doi env tren Render

Can doi cac bien:

- `SUPABASE_URL=https://supabase.auditionai.io.vn`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-key-tu-self-hosted-supabase>`

Neu web Render van con dung:
- `VITE_SUPABASE_URL=https://supabase.auditionai.io.vn`
- `VITE_SUPABASE_ANON_KEY=<publishable-key-tu-self-hosted-supabase>`

### 5. Test cutover

Can test lai:
- Google login
- Email/password login
- Gallery/history
- Admin queue
- Tao job moi
- Queue worker tren Render
- Telegram notify
- Payment flow neu dang dung

### 6. Chi xoa Supabase cloud cu sau khi on dinh

Khong xoa ngay.

Chi xoa khi:
- da chuyen env tren Netlify va Render
- da test end-to-end
- da co backup local
- da chay on dinh it nhat vai ngay

## Neu muon chuyen ca API ve laptop

Repo da co san script:

- `npm run render:web`
  - chay frontend build + toan bo API `/api/*` bang Express local

- `npm run render:queue-worker`
  - chay background queue worker local

Neu sau nay muon cat bot phu thuoc Netlify Functions/Render:
- expose them bang domain rieng
- doi frontend/API routing sang hostname moi

## Viec van con la phu thuoc ngoai Supabase

Sau khi bo Supabase cloud, app van co the con dung:
- Cloudflare R2
- Google OAuth
- Google/Vertex/TST provider
- PayOS
- Telegram webhook/worker
- Netlify
- Render

Neu muc tieu cua ban chi la bo Supabase cloud thi nhu vay la binh thuong.

## Van de van hanh tren laptop

Can dam bao:
- may tinh bat 24/24
- Docker Desktop auto start
- Supabase stack auto start
- tunnel auto start
- co UPS neu dien khong on dinh
- co backup database dinh ky

## Script local hien co

- `npm run dev:local`
  - chay Vite + local functions server de dev

- `npm run render:web`
  - dung khi muon host web/API dang production-style

- `npm run render:queue-worker`
  - dung khi muon host queue worker local
