# UX Sprint — Complete Experience Overhaul

## Research Summary (2026 Best Practices)
1. **Micro-interactions**: Every action should have visible feedback — button press, toggle, save, delete
2. **Predictive UI**: Forms auto-fill, smart defaults, progressive disclosure
3. **Gesture-based**: Swipe actions, pull-to-refresh, bottom sheets instead of modals
4. **Loading states**: Skeleton screens, not spinners. Content should feel instant
5. **Empty states**: Beautiful illustrations/messages, not just "no data"
6. **Haptic feedback**: Subtle animations on interactions
7. **Reduced cognitive load**: Show only what's needed, hide complexity

## Files to Rewrite

### Priority 1: Core Layout (affects every page)
1. **BottomNav.tsx** — iOS tab bar with pill indicator, active state with scale
2. **TopBar.tsx** — Minimal, search centered, avatar right, clean
3. **Sidebar.tsx** — Linear-style dark, collapsible, icon+text

### Priority 2: High-traffic Pages
4. **LoginPage.tsx** — Clean, modern, single-column, biometric ready
5. **DashboardPage.tsx** — Hero stat, activity feed with avatars, quick actions
6. **SchedulingPage.tsx** — Clean card list, filters, board view

### Priority 3: Common Components
7. **Button styles** (index.css) — Consistent sizes, hover/active states
8. **Card styles** — Unified borders, shadows, hover
9. **Input styles** — Clean focus, labels, validation

## Design Specs

### Bottom Nav (iOS-style)
- Height: 52px + safe area
- 5 items max
- Active: filled icon + label + subtle pill background
- Inactive: outline icon, no label (or very small)
- Background: frosted glass
- No thick border-top — use subtle shadow instead

### TopBar
- Height: 48px
- Left: hamburger (mobile) or logo
- Center: page title (semibold, 16px)
- Right: notification bell + avatar
- Background: transparent/glass, blends with content

### Cards
- Border: 1px solid border/30
- Radius: 12px
- Shadow: none by default, subtle on hover
- Padding: 14px 16px
- Background: card color (very subtle)
- Hover: slight border brightening + tiny shadow

### Buttons
- Primary: bg-primary, text-white, rounded-lg, h-10, font-medium
- Secondary: border border-border/50, bg-transparent, rounded-lg
- Ghost: bg-transparent, hover:bg-muted
- Sizes: sm(h-8), md(h-10), lg(h-12)
- All: transition-all 150ms, active:scale-[0.97]

### Inputs
- Height: 40px
- Border: 1px solid border/50
- Focus: border-primary/50, ring 3px primary/10
- Radius: 8px
- Label: 13px, font-medium, muted-foreground, mb-1.5
- Error: border-red/50, text-red-500 below

### Loading/Empty States
- Skeleton: animate-pulse, rounded shapes matching content
- Empty: centered icon + text + action button
- Transition: content fades in when loaded
