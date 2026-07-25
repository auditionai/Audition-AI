# 🔍 Giải pháp: Tại sao Dock Menu không hiển thị?

## ❌ Vấn đề

Menu dock ở dưới cùng không hiển thị khi mở `http://localhost:5173/home`

## ✅ Nguyên nhân

Trong `App.tsx`, dock menu chỉ được render khi người dùng **ĐÃ ĐĂNG NHẬP**:

```tsx
if (!isAuthenticated) {
  return <Landing onEnter={handleLogin} />;  // ❌ Không có dock
}

return (
  <Layout ...>  // ✅ Có dock menu
    {children}
  </Layout>
);
```

**Landing page** không có dock menu. Chỉ khi đăng nhập thành công, app mới render `<Layout>` component - nơi chứa dock menu.

## 🎯 Giải pháp: Đăng nhập để thấy dock

### Cách 1: Đăng nhập với tài khoản Admin Test

1. Mở browser tại `http://localhost:5173/`
2. Click button **"LOGIN"** (góc phải trên)
3. Trong modal đăng nhập, chọn tab **"Đăng nhập"**
4. Nhập thông tin:
   ```
   📧 Email: đặt qua biến môi trường `E2E_ADMIN_EMAIL`
   🔑 Password: đặt qua biến môi trường `E2E_ADMIN_PASSWORD`
   ```
5. Click **"Đăng nhập"**
6. ✅ Sau khi đăng nhập thành công, bạn sẽ thấy:
   - Dock menu ở dưới cùng với 4 icons: Home, Prompt mẫu, Tools, Gallery
   - VCoin balance: 999,999
   - Avatar góc phải

### Cách 2: Đăng nhập với Google OAuth

1. Click button **"LOGIN"**
2. Click **"Đăng nhập với Google"** (icon Google)
3. Chọn tài khoản Google
4. Cho phép quyền truy cập
5. ✅ Tự động chuyển về home với dock menu

### Cách 3: Đăng ký tài khoản mới

1. Click button **"LOGIN"**
2. Chọn tab **"Đăng ký"**
3. Nhập:
   - Tên hiển thị
   - Email
   - Mật khẩu
4. Click **"Đăng ký"**
5. ✅ Tự động đăng nhập và thấy dock

## 📸 Screenshots để so sánh

### ❌ TRƯỚC khi đăng nhập (Landing Page)
- Không có dock menu
- Chỉ có nút "LOGIN" góc phải
- Hero section: "THÀNH PHỐ VŨ HỘI AI"
- File: `screenshots/03-landing-before-login.png`

### ✅ SAU khi đăng nhập (Home Dashboard)
- **Có dock menu ở dưới cùng** với:
  - 🏠 Home
  - 🔥 Prompt mẫu (có badge HOT)
  - 🛠️ Tools
  - 🖼️ Gallery
  - 💎 VCoin balance
  - 👤 Avatar
- Nội dung: STUDIO AI, VIDEO LAB, TOOLS sections
- File: sẽ có sau khi đăng nhập thành công

## 🎨 Chi tiết Dock Menu

Khi đã đăng nhập, dock sẽ xuất hiện với style:

```
┌─────────────────────────────────────────────┐
│  🏠   🔥   🛠️   🖼️  │  💎 999,999 │  👤  │
│                      Prompt                 │
│ Home      Tools  Gallery   VCOIN    Avatar │
└─────────────────────────────────────────────┘
```

**Vị trí:** `fixed bottom-6 left-1/2 -translate-x-1/2 z-50`
**Style:** 
- Background: blur với border gradient
- Rounded: 2.5rem (rất tròn)
- Shadow: 0 10px 40px rgba(0,0,0,0.8)
- Glow effect: gradient aura xung quanh

## 🧪 Test sau khi đăng nhập

Sau khi đăng nhập thành công, test các chức năng:

1. **Click từng icon trong dock:**
   - 🏠 Home → Dashboard
   - 🔥 Prompt mẫu → Library prompts có sẵn
   - 🛠️ Tools → Workspace (chọn tool để dùng)
   - 🖼️ Gallery → Lịch sử ảnh đã tạo

2. **Click VCoin balance:**
   - Mở trang nạp tiền
   - Xem các gói VCoin

3. **Click Avatar:**
   - Mở Settings
   - Xem profile, logout, etc.

4. **Admin features (với tài khoản admin kiểm thử):**
   - Icon Shield xuất hiện trong header menu
   - Click để vào Admin Panel
   - Xem user stats, transactions, queue status

## 🐛 Nếu vẫn không thấy dock sau khi đăng nhập

Mở DevTools Console (F12) và check:

```javascript
// Check authentication state
localStorage.getItem('supabase.auth.token')

// Check if Layout is rendered
document.querySelector('[data-tour-id="desktop.layout.dock"]')

// Check dock styles
const dock = document.querySelector('[data-tour-id="desktop.layout.dock"]');
if (dock) {
  console.log(window.getComputedStyle(dock));
}
```

Nếu dock element tồn tại nhưng không nhìn thấy:
- Check `z-index`: phải là 50
- Check `position`: phải là `fixed`
- Check `bottom`: phải là `1.5rem` (24px)
- Check `opacity`: phải là 1
- Check `display`: phải là `flex`

## 📝 Summary

**TL;DR:** Dock menu chỉ hiển thị sau khi đăng nhập. Hãy đăng nhập bằng:
- Email/password: cấu hình bằng `E2E_ADMIN_EMAIL` và `E2E_ADMIN_PASSWORD`
- Hoặc Google OAuth
- Hoặc đăng ký tài khoản mới

Sau đó dock sẽ xuất hiện ở dưới cùng màn hình với đầy đủ navigation icons! 🎉
