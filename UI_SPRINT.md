# UI/UX Sprint — Shavtzak Complete Redesign

## Design Reference
Inspired by: Linear, Notion, modern SaaS apps
Vibe: Clean, minimal, professional, military-modern
Both light and dark modes

## Color Palette — IDF Khaki/Olive Theme

### Primary Colors
- **Primary (Olive/Khaki)**: `#6B7F3B` (IDF olive green, slightly muted)
- **Primary Hover**: `#5A6B32`
- **Primary Light**: `#8FA458` (for badges, backgrounds)
- **Primary Foreground**: `#FFFFFF` (white text on primary)

### Primary Scale (HSL for Tailwind)
```
--primary-50:  85 30% 95%    /* #F4F7EE */
--primary-100: 85 28% 88%    /* #E4EBCF */
--primary-200: 85 25% 75%    /* #C5D29E */
--primary-300: 85 25% 60%    /* #8FA458 */
--primary-400: 82 35% 45%    /* #7A9340 */
--primary-500: 80 36% 36%    /* #6B7F3B (MAIN) */
--primary-600: 80 38% 30%    /* #5A6B32 */
--primary-700: 80 40% 24%    /* #485627 */
--primary-800: 80 42% 18%    /* #36411D */
--primary-900: 80 45% 12%    /* #242C13 */
--primary-950: 80 50% 7%     /* #151A0A */
```

### Neutral Scale (Warm gray with olive tint — Linear-inspired)
```
Light mode:
--background:    60 10% 98%    /* #FAFAF7 warm white */
--foreground:    80 10% 10%    /* #1A1C17 */
--card:          60 8% 97%     /* #F7F7F4 */
--card-foreground: 80 10% 10%
--muted:         60 8% 93%     /* #EDEDEA */
--muted-foreground: 60 5% 45%
--border:        60 8% 88%     /* #E0E0DB */
--input:         60 8% 90%
--ring:          80 36% 36%    /* same as primary */

Dark mode:
--background:    80 10% 7%     /* #111310 deep olive-black */
--foreground:    60 5% 88%     /* #E0E0DD */
--card:          80 8% 10%     /* #191B17 */
--card-foreground: 60 5% 88%
--muted:         80 6% 15%     /* #262824 */
--muted-foreground: 60 4% 55%
--border:        80 6% 18%     /* #2D2F2A */
--input:         80 6% 15%
--ring:          80 36% 40%
```

### Accent / Status Colors (muted military tones)
```
--success:   120 35% 40%   /* #3D8C40 — muted green */
--warning:   38  75% 50%   /* #D4940A — sand/amber */
--danger:    0   60% 45%   /* #B83030 — muted red */
--info:      200 50% 40%   /* #336B8A — steel blue */
```

### Semantic Colors
```
--active:    green badge — mission in progress
--draft:     gray badge — draft/inactive
--approved:  olive-green — approved state
--pending:   amber/sand — waiting for action
--cancelled: muted-red — cancelled/rejected
```

## Typography
- Font: `Inter, system-ui, -apple-system, sans-serif`
- Headings: `font-semibold` (not bold — more elegant)
- Body: `text-sm` (14px) baseline
- Small: `text-xs` (12px)
- Mobile: slightly larger base for readability

## Spacing System
- Cards padding: `p-3 sm:p-4` (12px mobile, 16px desktop)
- Card gap: `gap-2 sm:gap-3` (8px mobile, 12px desktop)
- Section gap: `space-y-4 sm:space-y-6`
- Button height: 36px mobile, 40px desktop
- Input height: 36px mobile, 40px desktop
- Touch targets: minimum 36px (not 44px — that was too bloated)

## Component Design Principles
1. **Cards**: Subtle border, no heavy shadows. Hover: subtle lift
2. **Buttons**: Rounded-lg (8px radius), not rounded-xl. Compact padding
3. **Badges**: Pill-shaped, muted colors, small text (11px)
4. **Toggles**: iOS-style, 51×31px (already fixed)
5. **Inputs**: Clean border, no inner shadow, focus ring = primary color
6. **Tables**: No card wrapper on mobile — use subtle separators
7. **Icons**: Lucide, 16-18px size, muted color
8. **Sidebar**: Linear-style — dark, minimal, icon + text
9. **TopBar**: Clean, matches background, search centered
10. **Bottom Nav (mobile)**: iOS tab bar style, 5 items max

## Pages to Redesign (priority order)
1. **index.css** — Complete CSS variables rewrite
2. **Sidebar.tsx** — Linear-style dark sidebar
3. **TopBar.tsx** — Clean, minimal
4. **BottomNav.tsx** — iOS tab bar
5. **DashboardPage.tsx** — Clean stat cards, activity feed
6. **SchedulingPage.tsx** — Mission cards, filters
7. **EmployeesPage.tsx** — Clean table/list
8. **RulesPage.tsx** — Compact rule cards
9. **SettingsPage.tsx** — Clean settings layout
10. **LoginPage.tsx** — Modern login screen
11. **MySchedulePage.tsx** — Soldier portal
12. All other pages
