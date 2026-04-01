# Supabase Cloud -> Local Sync

Tài liệu này dành cho việc kéo database từ Supabase cloud hiện tại của app về Supabase local chạy bằng Docker.

## 1. Chuẩn bị

- Cài Docker Desktop và mở sẵn.
- Cài Node.js.
- Cài PostgreSQL client để có lệnh `psql`.
- Repo đã ở thư mục:
  - [Audition-AI](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI)

## 2. Chạy Supabase local

```powershell
npx supabase start
npx supabase status
```

Ghi lại:

- `API URL`, thường là `http://127.0.0.1:54321`
- `DB URL`, thường là `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- `anon key`
- `service_role key`

## 3. Lấy connection string cloud

Vào Supabase Dashboard của project đang dùng trên web:

1. Mở project.
2. Bấm `Connect`.
3. Copy Postgres connection string.

Ví dụ PowerShell:

```powershell
$REMOTE_DB_URL = "postgresql://postgres.xxxxx:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
```

## 4. Chạy script sync

Script của repo:

- [scripts/sync-supabase-cloud-to-local.ps1](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/scripts/sync-supabase-cloud-to-local.ps1)

Chạy full dump + restore:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-supabase-cloud-to-local.ps1 -RemoteDbUrl $REMOTE_DB_URL
```

Nếu local DB của bạn khác mặc định:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-supabase-cloud-to-local.ps1 -RemoteDbUrl $REMOTE_DB_URL -LocalDbUrl "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

Nếu chỉ muốn dump mà chưa restore:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-supabase-cloud-to-local.ps1 -RemoteDbUrl $REMOTE_DB_URL -SkipRestore
```

## 5. Dump sẽ nằm ở đâu

Script sẽ tạo:

- [supabase/cloud-sync/roles.sql](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/supabase/cloud-sync/roles.sql)
- [supabase/cloud-sync/schema.sql](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/supabase/cloud-sync/schema.sql)
- [supabase/cloud-sync/data.sql](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/supabase/cloud-sync/data.sql)

## 6. Trỏ app sang local Supabase

Dùng file mẫu:

- [.env.local.local-supabase.example](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/.env.local.local-supabase.example)

Copy các giá trị local từ `npx supabase status` sang [`.env.local`](/c:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/.env.local):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 7. Kiểm tra sau khi restore

Mở `psql`:

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

Chạy:

```sql
select count(*) from auth.users;
select count(*) from public.users;
select count(*) from public.generated_images;
select count(*) from public.vcoin_transactions;
```

## 8. Lỗi hay gặp

### `SET transaction_timeout = 0`

Cloud có thể mới hơn local Postgres. Nếu restore lỗi vì dòng này, sửa file:

- [supabase/cloud-sync/data.sql](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/supabase/cloud-sync/data.sql)

PowerShell:

```powershell
(Get-Content .\supabase\cloud-sync\data.sql) -replace '^SET transaction_timeout', '-- SET transaction_timeout' | Set-Content .\supabase\cloud-sync\data.sql
```

### Lỗi `COPY` vào bảng không tồn tại

Comment nguyên block `COPY ... FROM stdin;` bị lỗi và dòng kết thúc `\.` trong `data.sql`, rồi chạy restore lại.

## 9. Lưu ý riêng cho repo này

- App hiện dùng Cloudflare R2 làm nơi chứa media chính trong:
  - [services/storageService.ts](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/services/storageService.ts)
- Vì vậy sync Supabase local chủ yếu là:
  - database
  - auth
  - metadata
- Ảnh/video thật có thể vẫn nằm ở R2, không nằm trong dump database.
