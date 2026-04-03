# Design Fixes — Premium UI Sprint

## Critical Issues Found (from UI audit)

### Global
1. Harsh borders (solid colors) → use rgba with low opacity
2. Mixed border-radius (4px/8px/12px) → standardize to 12px
3. No transitions on interactive elements
4. Spacing inconsistent → strict 8px grid
5. Too many accent colors competing
6. Shadows missing or too heavy

### Login Page
- Input borders too harsh (neon glow on focus)
- Buttons all same visual weight — no hierarchy
- "OR" divider plain
- Version badge too flashy

### Dashboard
- "stats.pendingSwaps" — exposed code
- Activity feed shows raw DB actions ("create_setting")
- Stat cards all identical — no hierarchy
- Left colored borders are dated (2015 Bootstrap)
- Numbers same weight as text — no visual importance

### Scheduling
- Badge overload (repeated "archived" badges)
- Active vs archived cards look like different apps
- Icon buttons look like placeholders
- Progress bar tiny and hard to read

### Settings
- Toggle rows slightly generic
- Tab pills could be more refined

## Design System to Implement

### Colors (keep olive palette but refine)
```css
/* Surfaces - very subtle, not harsh */
--surface-0: rgba(255, 255, 255, 0.02);  /* card bg in dark */
--surface-1: rgba(255, 255, 255, 0.04);  /* hover state */
--surface-2: rgba(255, 255, 255, 0.06);  /* active state */

/* Borders - always transparent-ish */
--border-subtle: rgba(255, 255, 255, 0.06);
--border-default: rgba(255, 255, 255, 0.1);
--border-strong: rgba(255, 255, 255, 0.15);

/* Light mode equivalents */
--border-subtle-light: rgba(0, 0, 0, 0.04);
--border-default-light: rgba(0, 0, 0, 0.08);
```

### Typography
- Numbers/KPIs: `text-2xl font-bold tracking-tight`
- Labels/meta: `text-xs text-muted-foreground tracking-wide uppercase`
- Body: `text-sm font-normal`
- Headings: `text-base font-semibold` (not bold)

### Components
- Cards: `rounded-xl border border-border/50 bg-card` — subtle, not harsh
- Buttons primary: `rounded-lg bg-primary text-primary-foreground shadow-sm`
- Buttons secondary: `rounded-lg border border-border/50 bg-transparent`
- Inputs: `rounded-lg border border-border/50 bg-transparent focus:ring-2 focus:ring-primary/20`
- Badges: `rounded-full px-2 py-0.5 text-[11px] font-medium`

### Animations
- All interactive: `transition-all duration-200 ease-out`
- Hover cards: `hover:bg-surface-1 hover:border-border`
- Active press: `active:scale-[0.98]`
