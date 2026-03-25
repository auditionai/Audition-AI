# Supabase New Project Checklist

Checklist này dành cho việc dựng lại project Supabase mới cho Audition AI, nối lại app, bật Google login, rồi test end-to-end.

## 1. Tạo Project Supabase Mới

- Tạo project mới trong Supabase.
- Ghi lại:
  - `Project URL`
  - `anon public key`
  - `service_role key`
  - `project ref` dạng `xxxxxxxxxxxx`

## 2. Chạy SQL Bootstrap

- Mở SQL Editor trong Supabase.
- Chạy file:
  - [scripts/supabase_bootstrap_fresh_project.sql](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/scripts/supabase_bootstrap_fresh_project.sql)
- Sau đó chạy file seed:
  - [scripts/supabase_seed_fresh_project.sql](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/scripts/supabase_seed_fresh_project.sql)

## 3. Tạo Tài Khoản Admin Đầu Tiên

- Đăng ký một tài khoản bằng email hoặc Google.
- Chạy câu SQL sau để set admin:

```sql
update public.users
set is_admin = true
where email = 'your-email@example.com';
```

## 4. Cập Nhật Environment Variables

### Frontend / local

- `VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<your-anon-key>`

### Netlify Functions / server

- `SUPABASE_URL=https://<your-project-ref>.supabase.co`
- `SUPABASE_ANON_KEY=<your-anon-key>`
- `SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>`

## 5. Bật Google Login Nhanh

Code hiện tại đã có nút login Google qua Supabase ở:
- [services/supabaseClient.ts](C:/Users/cuong/OneDrive/Documents/GitHub/Audition-AI/services/supabaseClient.ts)

Nó đang gọi:

```ts
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: window.location.origin,
    queryParams: { access_type: 'offline', prompt: 'consent' },
  },
})
```

### Trong Google Cloud Console

- Tạo hoặc chọn project Google Cloud.
- Vào `APIs & Services` -> `Credentials`.
- Tạo `OAuth 2.0 Client ID`.
- Chọn loại `Web application`.
- Ở `Authorized redirect URIs`, thêm đúng URI callback của Supabase:

```text
https://<your-project-ref>.supabase.co/auth/v1/callback
```

Lưu ý:
- Callback của Google phải là callback Supabase, không phải domain app.
- Nếu đổi project Supabase, callback URI cũng đổi theo.

### Trong Supabase Dashboard

- Vào `Authentication` -> `Providers` -> `Google`
- Enable provider
- Dán:
  - `Client ID`
  - `Client Secret`

### Trong Supabase Auth URL Configuration

- Vào `Authentication` -> `URL Configuration`
- Set `Site URL` là domain chính của app, ví dụ:

```text
https://your-main-domain.com
```

- Add thêm `Redirect URLs`:

```text
http://localhost:5173/**
http://localhost:8888/**
https://your-main-domain.com/**
https://**--your-site.netlify.app/**
```

Gợi ý:
- `5173` cho Vite local
- `8888` cho `netlify dev`
- wildcard Netlify preview giúp build preview login được luôn

## 6. Điền API Keys Thật

- Vào Admin UI hoặc SQL Editor
- Thay các placeholder seeded trong `public.api_keys` bằng key thật
- Với Vertex service account JSON:
  - dán nguyên JSON vào cột `key_value`
  - đổi `status` thành `active`

Ví dụ:

```sql
update public.api_keys
set
  key_value = '{"type":"service_account","project_id":"..."}',
  status = 'active'
where name = '[VERTEX] Placeholder 1';
```

## 7. Kiểm Tra Dữ Liệu Seed

Chạy nhanh các query sau:

```sql
select count(*) from public.users;
select count(*) from public.credit_packages;
select count(*) from public.system_settings;
select count(*) from public.api_keys;
select count(*) from public.generated_images;
```

Mong đợi:
- `credit_packages` > 0
- `system_settings` > 0
- `api_keys` > 0

## 8. Redeploy App

- Update env local / Netlify
- Redeploy frontend + functions
- Hard refresh trình duyệt sau deploy

## 9. Test End-to-End

### Auth

- Đăng ký email/password
- Login bằng email/password
- Login bằng Google
- Kiểm tra sau login có row trong `public.users`

Query kiểm tra:

```sql
select id, email, display_name, is_admin, created_at
from public.users
order by created_at desc
limit 10;
```

### Admin

- Vào trang Admin bằng tài khoản admin
- Kiểm tra đọc được:
  - packages
  - giftcodes
  - system settings
  - api keys
  - user list

### Economy

- Tạo payment transaction thử
- Kiểm tra row trong `public.payment_transactions`
- Kiểm tra `settle_payment_transaction_by_id` chạy được

### Queue / generation

- Tạo 1 ảnh đơn
- Tạo 1 ảnh couple
- Tạo 1 ảnh nhóm 3
- Kiểm tra log queue có chạy
- Kiểm tra row trong `public.generated_images`

### Gallery

- Kiểm tra lịch sử tạo hiển thị được
- Kiểm tra asset completed không bị nhảy ngược thành processing

## 10. Nếu Google Login Không Chạy

Kiểm tra lần lượt:

- `Authentication -> Providers -> Google` đã bật chưa
- `Client ID / Secret` đúng chưa
- `Authorized redirect URI` trong Google Cloud có đúng:

```text
https://<your-project-ref>.supabase.co/auth/v1/callback
```

- `Site URL` và `Redirect URLs` trong Supabase có đúng domain local/deploy không
- Browser console có báo lỗi redirect mismatch không

## Tài Liệu Chính Thức

- Redirect URLs:
  - https://supabase.com/docs/guides/auth/redirect-urls
- Implicit flow:
  - https://supabase.com/docs/guides/auth/sessions/implicit-flow

## Ghi Chú

- Project Supabase cũ đã xóa thì auth users, lịch sử giao dịch, queue data cũ không tự quay lại.
- Hai file SQL ở trên sẽ dựng lại schema + seed mặc định, nhưng không khôi phục dữ liệu lịch sử đã mất.
