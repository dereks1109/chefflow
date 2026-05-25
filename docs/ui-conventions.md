# UI Conventions

ChefFlow's UI is optimized for kitchen use: harsh overhead lighting, greasy hands, quick glances. Every decision flows from that constraint.

## Dark mode

Dark mode is the default. The palette uses a neutral dark grey scale, not pure black, to reduce eye strain under fluorescent kitchen lighting.

### Theme initialization

`chefflow/src/ui/theme/useTheme.ts` is imported at the top of `App.tsx` as a side-effect import. This runs `applyTheme(getInitialTheme())` synchronously before the first React render, preventing a flash of unstyled content.

```typescript
// App.tsx
import './ui/theme/useTheme';
```

Theme preference is stored in `localStorage` under the key `chefflow-theme`. Valid values are `'dark'` and `'light'`. Any missing or invalid value defaults to `'dark'`.

The `html` element receives a `dark` class when dark mode is active. Tailwind's `darkMode: 'class'` strategy in `chefflow/tailwind.config.ts` drives all dark-mode variants.

### ThemeToggle component

`chefflow/src/ui/components/ThemeToggle.tsx` renders a Sun (light) or Moon (dark) icon button. It calls `useTheme()` and requires no props.

```tsx
<ThemeToggle />
```

## Surface token system

The surface tokens are the single source of truth for elevation-based backgrounds. They are defined in `chefflow/tailwind.config.ts` and used throughout the component tree.

| Token | Hex | Use |
|-------|-----|-----|
| `surface-0` | `#171717` | Page background (darkest) |
| `surface-1` | `#1F1F1F` | Cards, sheets, dialogs |
| `surface-2` | `#2A2A2A` | Inputs, secondary surfaces |
| `surface-3` | `#363636` | Hover states, tertiary surfaces |

Use these tokens via Tailwind utilities: `bg-surface-0`, `dark:bg-surface-1`, etc.

> **IMPORTANT:** Never use `bg-black` or `bg-neutral-950` for surfaces. The `#171717` base (`surface-0`) is intentionally not pure black.

## Accent color

The primary action color is orange:

| Token | Value | Use |
|-------|-------|-----|
| `accent` (DEFAULT) | `#f97316` | Buttons, active nav, focus rings |
| `accent-dim` / `accent-hover` | `#ea580c` | Hover state |
| `accent-glow` | `rgba(249,115,22,0.18)` | Subtle glow backgrounds |

Use `text-accent`, `bg-accent`, `ring-accent`, `border-accent-glow` as needed.

## Border tokens

| Token | Value | Use |
|-------|-------|-----|
| `border-subtle` | `rgba(255,255,255,0.08)` | Subtle dividers between surfaces |
| `border-glow` | `rgba(249,115,22,0.28)` | Accent-colored borders |

## Touch targets

All interactive elements must meet the minimum touch target size to support single-hand operation. The project defines a `touch` token in `tailwind.config.ts`:

```
minHeight.touch = 48px
minWidth.touch  = 48px
```

Apply with the utility class `.touch-target` (defined in `chefflow/src/index.css`):

```css
.touch-target {
  @apply min-h-touch min-w-touch flex items-center;
}
```

The `btn` base class in `index.css` already includes `.touch-target`. Every custom interactive element that does not use `btn` must apply `.touch-target` or equivalent padding manually.

> **NOTE:** CLAUDE.md specifies 44×44px as the minimum. The implementation uses 48px (`min-h-[48px]`) tokens, which exceeds that minimum.

## CSS utility classes

These utility classes are defined in `chefflow/src/index.css` and available globally.

### `.input`

Standard form input. Handles light/dark mode, border, focus ring.

```tsx
<input className="input" ... />
```

### `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`

Base and variant button classes. All extend `.touch-target`.

```tsx
<button className="btn-primary">Save</button>
<button className="btn-secondary">Cancel</button>
<button className="btn-danger">Delete</button>
```

### `.skeleton`

Shimmer loading placeholder. Animates with `animate-shimmer`.

```tsx
<div className="skeleton h-6 w-40" />
```

## Animations

Custom keyframes are defined in `tailwind.config.ts`:

| Class | Effect |
|-------|--------|
| `animate-glow-pulse` | Pulsing orange box-shadow (2s infinite) |
| `animate-fade-up` | Fade in + slide up 12px (0.3s, one-shot) |
| `animate-shimmer` | Horizontal shimmer sweep (1.5s infinite) |

## Typography

ChefFlow uses a 1.25-ratio type scale (Major Third). System font stacks — no web font loading.

| Class | Size | Line height |
|-------|------|-------------|
| `text-xs` | 0.64rem | 1rem |
| `text-sm` | 0.8rem | 1.25rem |
| `text-base` | 1rem | 1.5rem |
| `text-lg` | 1.25rem | 1.75rem |
| `text-xl` | 1.563rem | 2rem |
| `text-2xl` | 1.953rem | 2.25rem |
| `text-3xl` | 2.441rem | 2.75rem |
| `text-4xl` | 3.052rem | 3.25rem |

## Layout structure

`AppLayout.tsx` (`chefflow/src/ui/layout/AppLayout.tsx`) renders the application shell:

- **Desktop** (`lg:` breakpoint and above): `TopNav` across the top; no bottom navigation; content fills available height with `max-w-screen-2xl mx-auto`.
- **Mobile** (below `lg:`): `MobileTopBar` at the top; `BottomNav` fixed to the bottom with safe-area inset padding; content has `pb-20` to clear the nav.

The `CommandPalette` is mounted once at the layout level and toggled via `Cmd-K` / `Ctrl-K`.

## Bottom navigation (mobile)

`BottomNav.tsx` renders three tabs: Recipes, Events, Workflows. The active tab shows an orange indicator pill behind its icon and uses `strokeWidth={2.5}` vs. `1.75` for inactive items to reinforce the selected state without relying on color alone.

## Primitive components

Low-level atoms in `chefflow/src/ui/components/primitives/`:

| Component | What it renders |
|-----------|----------------|
| `Button.tsx` | Wraps the `.btn` CSS class family |
| `Card.tsx` | Surface-1 card with rounded corners and subtle border |
| `Input.tsx` | Wraps the `.input` CSS class |
| `Surface.tsx` | Generic surface container accepting a `level` prop (0–3) |

## Command palette

`CommandPalette.tsx` is a full-screen overlay triggered by `Cmd-K` / `Ctrl-K`. It uses `role="dialog"` + `aria-modal="true"` and a `role="combobox"` search input with `aria-activedescendant` for screen-reader support. The inner palette mounts only when open so state resets automatically on close.

## Color tags

`ColorTag = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'`

Used on both `Dish` and `ScheduledStep` to identify chef ownership. The `ColorPicker.tsx` component renders a row of color swatches.
