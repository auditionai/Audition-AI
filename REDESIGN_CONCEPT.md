# 🎨 Modern Neumorphism Redesign Concept

## 🎯 Mục tiêu thiết kế

Thiết kế lại giao diện **SAU KHI ĐĂNG NHẬP** với phong cách:
- ✨ **Neumorphism** hiện đại (soft shadows, embossed effects)
- 🚀 **Tech-forward** - phù hợp giới trẻ công nghệ
- 🎮 **Gaming aesthetics** - giữ tinh thần game Audition nhưng refined hơn
- 📱 **Clean & Minimal** - không quá nhiều elements

**⚠️ Giữ nguyên:** Landing page (views/Landing.tsx)
**🔄 Redesign:** Layout.tsx + Home.tsx + components sau khi đăng nhập

---

## 🎨 Design System - Modern Neumorphism

### Color Palette

#### Base (Neumorphic Background)
```css
--base-bg: #E8ECF0;           /* Light gray-blue base */
--base-surface: #F0F4F8;      /* Slightly lighter surface */
--shadow-light: #FFFFFF;       /* White highlight */
--shadow-dark: rgba(174, 188, 206, 0.4);  /* Soft shadow */
```

#### Accent Colors (Gaming spirit)
```css
--primary: #667EEA;           /* Modern purple-blue */
--primary-light: #818CF8;
--primary-dark: #5B68CC;

--secondary: #F59E0B;         /* Vibrant amber */
--secondary-light: #FBBF24;

--accent-cyan: #06B6D4;       /* Tech cyan */
--accent-pink: #EC4899;       /* Energetic pink */
--accent-green: #10B981;      /* Success green */
```

#### Text Colors
```css
--text-primary: #1E293B;      /* Dark slate */
--text-secondary: #64748B;    /* Medium slate */
--text-muted: #94A3B8;        /* Light slate */
```

### Typography

```css
/* Primary Font: Inter (modern, clean) */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

/* Accent Font: Space Grotesk (tech vibe) */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap');

--font-primary: 'Inter', sans-serif;
--font-accent: 'Space Grotesk', sans-serif;
```

### Neumorphic Effects

```css
/* Soft raised element */
.neomorph-raised {
  background: var(--base-surface);
  box-shadow: 
    8px 8px 16px var(--shadow-dark),
    -8px -8px 16px var(--shadow-light);
  border-radius: 20px;
}

/* Pressed/inset element */
.neomorph-inset {
  background: var(--base-bg);
  box-shadow: 
    inset 6px 6px 12px var(--shadow-dark),
    inset -6px -6px 12px var(--shadow-light);
  border-radius: 20px;
}

/* Floating card */
.neomorph-float {
  background: var(--base-surface);
  box-shadow: 
    12px 12px 24px var(--shadow-dark),
    -12px -12px 24px var(--shadow-light);
  border-radius: 24px;
}

/* Flat element */
.neomorph-flat {
  background: var(--base-surface);
  box-shadow: 
    4px 4px 8px var(--shadow-dark),
    -4px -4px 8px var(--shadow-light);
  border-radius: 16px;
}
```

---

## 🏗️ Layout Components

### 1. Header (Top Bar)

**Style:**
- Fixed top, neomorph-flat
- Height: 64px
- Background: base-surface with subtle shadow

**Structure:**
```
┌─────────────────────────────────────────────────────┐
│  [Logo] AUDITION AI         [🔍] [🔔]  [VN] [👤]  │
└─────────────────────────────────────────────────────┘
```

**Elements:**
- Logo: Neomorph circle với gradient icon
- Search: Inset neomorph input (khi click)
- Notifications: Raised button với badge
- Language switcher: Flat neomorph
- Avatar: Raised circle với border gradient

### 2. Dock Navigation (Bottom)

**Style:**
- Fixed bottom, neomorph-float
- Glassmorphism overlay subtle
- Height: 72px
- Rounded: 36px (pill shape)

**Structure:**
```
┌───────────────────────────────────────────────────┐
│  [🏠]  [🎨]  [🛠️]  [📊]  ┃  [💎 999]  [👤]     │
│  Home  Create Tools Stats ┃  VCoin    Profile    │
└───────────────────────────────────────────────────┘
```

**Interactions:**
- Active state: Inset neomorph
- Inactive: Flat neomorph
- Hover: Raised neomorph với color tint
- Icon animation: Scale + soft bounce

### 3. Background

**Style:**
- Base color: --base-bg
- Subtle gradient overlay
- Minimal noise texture (1-2% opacity)
- No flashy animations

**Pattern:**
```css
background: 
  linear-gradient(135deg, #E8ECF0 0%, #F0F4F8 100%),
  url('noise-texture.png');
background-blend-mode: overlay;
```

---

## 🏠 Home Dashboard Redesign

### Hero Section (Top)

**Style:** Neomorph-raised, compact

```
┌─────────────────────────────────────────────────────────┐
│  👋 Xin chào, Creator                    [⚡ Quick Start] │
│  Hệ thống sẵn sàng. Chọn công cụ bên dưới.              │
│                                                          │
│  [📊 Stats Today]                                        │
│  🎨 12 ảnh   📹 3 video   ⏱️ 24 phút                    │
└─────────────────────────────────────────────────────────┘
```

### Feature Cards

**Style:** Neomorph-float hover → neomorph-raised

**Layout:** Grid 4 columns (desktop), 2 cols (tablet), 1 col (mobile)

**Card structure:**
```
┌─────────────────────────────┐
│  [Icon]              [Tag]  │
│                             │
│  Feature Name               │
│  Short description...       │
│                             │
│  ──────────────────────     │
│  Engine     [→]             │
└─────────────────────────────┘
```

**Elements:**
- Icon container: Neomorph-inset circle, gradient fill
- Tag (HOT/NEW/VIP): Flat neomorph với vibrant color
- Title: Space Grotesk bold
- Description: Inter regular, muted text
- Divider: Subtle embossed line
- Action button: Neomorph-flat, hover → raised

**Color coding:**
- **Generation tools:** Primary purple-blue gradient
- **Video tools:** Amber-orange gradient
- **Editing tools:** Cyan-green gradient

### Sections

**1. STUDIO AI**
- Header: Flat neomorph bar, icon + title
- Grid: 5 cards (generation features)
- Badge: "Powered by Gemini 3.0" (subtle)

**2. VIDEO LAB**
- Header: Amber accent
- Grid: 2 cards (video features)
- Badge: "TST Video Suite"

**3. TOOLS**
- Header: Cyan accent
- Grid: 4 cards (editing features)
- Badge: "AI Enhancement"

---

## 🎨 Component Styles

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: white;
  padding: 12px 24px;
  border-radius: 16px;
  box-shadow: 
    4px 4px 12px rgba(102, 126, 234, 0.3),
    -2px -2px 8px rgba(255, 255, 255, 0.8);
  font-weight: 600;
  transition: all 0.3s ease;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 
    6px 6px 16px rgba(102, 126, 234, 0.4),
    -3px -3px 10px rgba(255, 255, 255, 0.9);
}

/* Neomorph Button */
.btn-neomorph {
  background: var(--base-surface);
  box-shadow: 
    6px 6px 12px var(--shadow-dark),
    -6px -6px 12px var(--shadow-light);
  border-radius: 16px;
  padding: 12px 24px;
}

.btn-neomorph:active {
  box-shadow: 
    inset 4px 4px 8px var(--shadow-dark),
    inset -4px -4px 8px var(--shadow-light);
}
```

### Input Fields

```css
.input-neomorph {
  background: var(--base-bg);
  box-shadow: 
    inset 4px 4px 8px var(--shadow-dark),
    inset -4px -4px 8px var(--shadow-light);
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  color: var(--text-primary);
  font-family: var(--font-primary);
}

.input-neomorph:focus {
  outline: none;
  box-shadow: 
    inset 6px 6px 12px var(--shadow-dark),
    inset -6px -6px 12px var(--shadow-light),
    0 0 0 2px var(--primary);
}
```

### Cards

```css
.card-feature {
  background: var(--base-surface);
  box-shadow: 
    10px 10px 20px var(--shadow-dark),
    -10px -10px 20px var(--shadow-light);
  border-radius: 24px;
  padding: 24px;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.card-feature:hover {
  transform: translateY(-4px);
  box-shadow: 
    14px 14px 28px var(--shadow-dark),
    -14px -14px 28px var(--shadow-light);
}
```

---

## 🎯 Interactive States

### Hover Effects
- **Subtle lift:** translateY(-2px to -4px)
- **Shadow grows:** Stronger contrast
- **Color tint:** Primary color overlay (5-10% opacity)

### Active/Pressed
- **Inset shadow:** Element appears pressed
- **Scale:** 0.98
- **No translateY**

### Loading
- **Skeleton:** Animated gradient shimmer
- **Pulse:** Subtle opacity animation
- **No spinners:** Use progress bars

---

## 📱 Responsive Breakpoints

```css
/* Mobile: 320px - 767px */
- Single column layout
- Larger touch targets (min 48px)
- Bottom nav sticky

/* Tablet: 768px - 1023px */
- 2 column grid
- Dock menu adapts

/* Desktop: 1024px+ */
- 4 column grid
- Full dock with all features
- Side spacing: max 1400px container
```

---

## ✨ Animations

### Micro-interactions
```css
@keyframes softBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@keyframes gentlePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

**Apply to:**
- Card hover: softBounce
- Loading states: shimmer
- New badges: gentlePulse (subtle)

---

## 🎨 Dark Mode Support

```css
/* Dark Base */
--base-bg-dark: #1A202C;
--base-surface-dark: #2D3748;
--shadow-light-dark: rgba(255, 255, 255, 0.03);
--shadow-dark-dark: rgba(0, 0, 0, 0.5);

/* Invert neomorph shadows */
.dark .neomorph-raised {
  box-shadow: 
    8px 8px 16px var(--shadow-dark-dark),
    -8px -8px 16px var(--shadow-light-dark);
}
```

---

## 🚀 Implementation Priority

### Phase 1: Core Layout
1. ✅ Update color variables in index.html
2. ✅ Redesign Layout.tsx (header + dock)
3. ✅ New background style

### Phase 2: Components
1. ✅ Feature cards neomorph style
2. ✅ Button components
3. ✅ Input fields

### Phase 3: Home Dashboard
1. ✅ Hero section
2. ✅ Feature grid
3. ✅ Section headers

### Phase 4: Polish
1. ✅ Hover states
2. ✅ Loading states
3. ✅ Responsive adjustments

---

## 📊 Accessibility

- ✅ Contrast ratio: WCAG AAA (7:1+)
- ✅ Focus indicators: Visible outline
- ✅ Touch targets: Min 48x48px
- ✅ Keyboard navigation: Full support
- ✅ Screen reader: Semantic HTML

---

**Bắt đầu implementation?** 🚀
