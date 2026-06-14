# Startboard — Frontend Style Guide

How the UI should look and behave. New work must fit the existing visual
language **and** meet baseline UX/accessibility best-practice. When in doubt,
copy an existing pattern rather than inventing one.

Stack reminder: React 19 + **Tailwind v4** (CSS-first, `@theme` in
`src/styles/index.css`) + lucide-react icons. **JSX, not TS.**

---

## 1. Theming — the one rule that matters

The app is **theme-aware via CSS variables**, not Tailwind's `dark:` variant.
Dark is the `:root` default; light overrides at `:root[data-theme="light"]`.
Crucially, the **slate scale and `white` are remapped** in light mode
(`src/styles/index.css`), so the *same* utility classes flip automatically.

**Only use colours that flip with the theme:**

| Use | For | Notes |
| --- | --- | --- |
| `text-white` | Primary text | Becomes dark ink in light mode — it is *not* literally white |
| `text-slate-300` / `text-slate-400` | Secondary text / hints | |
| `bg-white/5`, `bg-white/10` | Panel & control surfaces | alpha-on-theme, adapts automatically |
| `border-white/10`, `border-white/15` | Hairlines & control borders | |
| `divide-white/10` | Row dividers inside cards | |
| `bg-accent` | Accent fill (active/primary) | `#0ea5b7` dark / `#0f766e` light |
| `hover:bg-accent-dark` | Accent hover | |
| `accent-accent` | Native range/checkbox tint | |

**Do not** hard-code hex values or use Tailwind palette colours outside the
slate scale (e.g. `bg-gray-800`, `text-zinc-400`, `bg-[#1e293b]`) for
themeable surfaces — they won't invert and will break light mode. Semantic
status colours (`text-emerald-400`, `text-rose-400`, `text-amber-400`,
`text-red-400/600`) are the sanctioned exception; see `btnDanger`/`btnWarning`
and the Docker status badges.

---

## 2. Shared building blocks — reach for these first

- **Buttons:** import from `src/components/ui.js` —
  `btnPrimary`, `btnSecondary`, `btnGhost`, `btnDanger`, `btnWarning`. They
  share a base (`btn`) that already handles radius, padding, `transition`,
  `cursor-pointer`, and `disabled:` states. Don't re-roll a button class string
  unless the element is genuinely bespoke.
- **Inputs:** `input` from `ui.js`; `label` for field captions.
- **Settings UIs:** compose `SettingsSection` → `SettingsGroup` →
  `SettingsRow` (+ `SettingsFootnote`) from `src/components/settings/SettingsKit.jsx`.
  `Toggle`, `RangeField`, and `ColorField` live there too. A new preference
  should look like every other row, not a one-off layout.
- **Popovers:** follow `ToolbarPopover` in `TopBar.jsx` — toggle button +
  absolutely-positioned panel that closes on outside `pointerdown` and `Escape`.

---

## 3. Shape, surface & spacing

- **Radii:** pills/small controls `rounded-md`; buttons & inputs `rounded-lg`;
  icon tiles & selectable cards `rounded-xl`; panels, popovers & grouped cards
  `rounded-2xl`; circular controls (toggles, swatches, badges) `rounded-full`.
- **Surfaces:** a card is `border border-white/10 bg-white/5`. Group rows with
  `divide-y divide-white/10` inside an `overflow-hidden rounded-2xl` wrapper
  (see `SettingsGroup`). Popovers add `shadow-2xl backdrop-blur` over a
  `bg-slate-900/96`-style scrim.
- **Spacing:** inline control gaps `gap-2`/`gap-3`; settings rows `px-4 py-3`;
  card padding `p-3`/`p-4`. Stick to the Tailwind scale — no arbitrary
  `px-[13px]`.
- **Header:** sticky, `border-b border-white/10 bg-slate-900/70 backdrop-blur`.

### Density — avoid scrolling where reasonable

Settings and config screens should aim to fit without vertical scrolling.

- **Use the width first.** Containers go up to `max-w-6xl`; if a panel is a tall
  single column with empty sides, switch to a responsive grid
  (`grid gap-6 lg:grid-cols-2 lg:items-start`) before letting it scroll.
- **Compact repetitive rows.** Collapse a run of one-value rows into a multi-up
  stat grid (e.g. `grid-cols-3 divide-x divide-white/10` of label+value cells)
  rather than stacking a full `SettingsRow` each.
- **Group, don't pile.** When content is genuinely large, split it across header
  tabs / sub-tabs (see `SettingsPage`'s tabbed sections) instead of one long
  scroll.

---

## 4. Interaction & feedback (non-negotiable)

Every interactive element must *look* interactive and *confirm* the
interaction.

- **Cursor:** native `<button>` defaults to `cursor: default`. Any clickable
  button needs `cursor-pointer` (the `ui.js` base already includes it; bespoke
  buttons must add it). Add `disabled:cursor-not-allowed` alongside
  `disabled:opacity-50`. `<a>`/`<Link>` already get the pointer.
- **Hover:** provide a visible change — `hover:bg-white/10`,
  `hover:border-white/20`, or `hover:text-white`. Pair with `transition`.
- **Selected / active state:** make it unambiguous, not just a faint tint.
  Accent fill (`bg-accent`) for compact controls; accent
  `border` + `ring-1 ring-accent/40` + a `Check` badge for
  selectable cards. Reflect it in ARIA (`aria-pressed` / `aria-checked`).
- **Focus:** keyboard focus must be visible —
  `focus-visible:ring-2 focus-visible:ring-accent` (see
  `Toggle`). Never `outline-none` without a replacement.
- **Disabled/busy:** disable controls during async writes (the settings
  sections gate on `busy`/`prefBusy`) and surface errors as `text-red-400`.

### Choosing a control
- **Boolean** → `Toggle`.
- **Small, mutually-exclusive set (≤ ~4)** → **segmented control**: a
  `rounded-lg border border-white/10 bg-white/5 p-0.5` track of `rounded-md`
  pills, active pill accent-filled (see Theme switcher in `AppearanceSection`).
  Prefer this over a chevron-less `<select>` — it shows all options and reads as
  interactive.
- **Richer choice needing a preview** → selectable **cards** in a grid (see
  Icon treatment): icon stage + label + one-line caption + selected ring/badge.
- **Long list** → a real `<select>` (with a visible affordance).

---

## 5. Iconography & type

- **Icons:** `lucide-react` only. Standard size `h-4 w-4`; small/inline
  `h-3.5 w-3.5`; keep `strokeWidth` default unless a badge needs `3`.
- **Icon-only buttons** must have `aria-label` (and usually a `title`).
- **Type scale:** section titles `text-base font-semibold`; row labels
  `text-sm`; hints/captions `text-xs text-slate-400`; dense metadata
  `text-[11px]`. Uppercase eyebrow labels use
  `text-xs font-medium uppercase tracking-wide text-slate-400`.
- **Font** is set globally (`Azeret Mono` / `IBM Plex Sans`) — don't override
  `font-family` per component.

---

## 6. Motion & a11y baseline

- Motion is **subtle**: `transition` on colour/opacity/transform; theme
  crossfade is 180ms. No bouncy or attention-grabbing animation.
- Always: semantic elements, labelled controls, `role`/`aria-*` on custom
  widgets (`role="switch"`, `role="group"`, `aria-pressed`), visible focus, and
  sufficient contrast in **both** themes — check light mode before shipping.

---

## Checklist before you ship UI

- [ ] Colours come from the slate scale / `white` alpha / accent var — verified
      in **both** light and dark.
- [ ] Reused `ui.js` buttons / `SettingsKit` / existing patterns where possible.
- [ ] Clickable things have `cursor-pointer`, a hover state, and visible focus.
- [ ] Active/selected state is obvious and mirrored in ARIA.
- [ ] Icon-only controls have `aria-label`; async actions disable + show errors.
- [ ] `npm run lint` is clean.
