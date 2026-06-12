# Design system — light "Studio" + dark "Console"

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for visual-system facts: tokens, fonts, copy voice, and the dark-mode neon-console architecture. **Update it whenever the design system changes.**

## The two modes, in one sentence each

- **Light mode = classic editorial "Studio":** cream paper, deep-forest accents, Instrument Serif headlines. It is the site's DNA and stays untouched by dark-mode work — always verify light mode is byte-identical (or visually identical) after dark-mode changes.
- **Dark mode = "neon console" (site-wide since 2026-06-10):** a deliberately *different* aesthetic — electric spring-green phosphor on deep-forest terminal panels, grid floor, scanline, LEDs, blinking cursors. Born on `manifesto.html` (the reference page), now at full depth on every public page.

## Color tokens (light defaults; dark overrides in `theme.css`)

- `--bg: #FAF8F4` cream · `--bg-2: #F2EFE8`
- `--ink: #14130F` · `--ink-2: #2A2823` · `--muted: #6B6760`
- `--accent: #1F4732` deep forest · `--accent-soft: #2E6249` · `--accent-pale: #B7E4CC` (**legacy** — the old mint dark treatment is retired; nothing new should use it)
- `--line: #E2DDD3` · `--line-2: #D4CEC1`
- `--maxw: 1180px`

Dark body: matte black `#050708` with radial-gradient forest glows (asymmetric right-side bias). **The dark body background uses `!important`** because per-page inline `body { background: var(--bg); }` would otherwise win the cascade — don't "clean it up".

Neon tokens (defined in `theme.css` dark block):

- `--neon: #3EF59F` (electric spring green — em accents, labels, LEDs, CTAs)
- `--neon-2: #8FFFC9` (lighter highlight — hovers, instrument readouts)
- `--deep-1: #06140D` (deepest panel green, gradient end) · `--deep-2: #0A1F15` (gradient start) · `--deep-3: #143524` (panel border)

## Fonts (Google Fonts)

- **Instrument Serif** — display/headings, with frequent `<em>` italics for emphasis
- **Inter** — body
- **JetBrains Mono** — eyebrows, small-caps labels, terminal readouts

## Copy voice

Confident, operator-grade, no fluff. Em-dashes for asides. Italic `<em>` inside headings is *the* signature pattern — "Markets, <em>dissected</em>", "Talk to a <em>founder</em>, not a form". Avoid corporate-speak. "A founder, not a form, will reply" recurs.

## Neon-console architecture

**Where things live:**

- **`theme.css` shared layer:** the tokens above; `.dk-grid` (fixed faint neon grid floor, masked to fade downward) + `.dk-scan` (slow scanline sweep) decor; all six keyframes — `dkScan` (page scanline), `dkPulse` (LED breathing), `dkBlink` (terminal block cursor — attach to a pseudo-element), `dkScanDown` (CRT sweep inside a panel), `dkCaret` (thin caret), `dkNodeBreathe` (node glow breathing) — **don't redefine these per page**; neon em glow on `h1–h4 em` + `.serif em`; `.eyebrow .num`; buttons (`.btn-primary`/`.btn-secondary`/`.nav-cta`/`.submit` — neon fill, near-black `#04110A` text); **topbar console chrome** (deep-green glass resting bar with phosphor ticks, neon-ringed scrolled pill, brand logo ring + blinking wordmark cursor); neon page-chrome hovers (`.nav-links a` + underline, `.nav-back`, `.foot-grid ul a`, `.theme-toggle`); `.spec-plate`; `.closing` console deck (etched phosphor grid + CRT sweep); footer terminal base plate (LED + caret status line, phosphor column headers); selection/scrollbar/focus rings.
- **Each page** adds a page-specific `:root[data-theme="dark"]` block at the END of its inline `<style>`, plus the two decor divs right after `<body>` (`<div class="dk-grid" aria-hidden="true"></div>` `<div class="dk-scan" aria-hidden="true"></div>`) and `main, footer { position: relative; z-index: 1; }` so content stacks above the fixed decor.
- **Pioneer-page duplication warning:** `manifesto.html`, `security.html`, `status.html` carry their own inline copies of the tokens + decor CSS (identical values to theme.css — they predate the shared layer). Harmless, but **if neon tokens ever change, change theme.css AND those three pages.** Several pages also define local `dkPulse`/`dkBlink` copies identical to theme.css — harmless.

**The pattern vocabulary** (use these when extending dark mode):

- Heading `<em>`s glow neon (`text-shadow` double halo).
- Mono labels/tags get neon text + small text-shadow; eyebrow `/` or `.num` ticks go neon.
- Cards/plates become deep-green gradient panels — `linear-gradient(180deg, var(--deep-2), var(--deep-1))`, border `--deep-3`, inset mint top-light — with a neon ring/bloom on hover (border + box-shadow only, **no transform scale**).
- Status dots/LEDs pulse via `dkPulse`; stagger `animation-delay` when multiple LEDs are visible so they don't blink in sync.
- Terminal cursors: block (`dkBlink`) or thin caret (`dkCaret`) as a pseudo-element after mono text (version stamps, addresses, build tags).
- Ghost numerals/glyphs: light = `--accent` at ~5% opacity; dark = transparent fill + `-webkit-text-stroke` neon wireframe, brightening on hover.
- Row/section hovers: left-to-right neon scan-wash — `linear-gradient(90deg, rgba(62,245,159,0.05), rgba(10,31,21,0.45) 40%, transparent)`.
- Phosphor terminal output: mono text in `--neon-2` with a `content: "> " / ""` prompt (alt-text syntax so screen readers skip it; older engines drop the prompt gracefully).
- "Live instrument" motion (CRT sweeps, breathing nodes, plotting dots) is allowed but must be **dark-only and reduced-motion-guarded**.

**Hard rules:**

1. **Light mode stays untouched.** Dark work happens under `:root[data-theme="dark"]` (or `display:none`-in-light elements). If a manifesto pattern is ported into HTML (e.g. hero-meta rows, ghost numerals), its light styling must match manifesto's light mode — classic cream.
2. **Every animation has a `@media (prefers-reduced-motion: reduce)` fallback** — scanlines/LEDs/cursors/sweeps off, reveals instant, meters jump to value.
3. No scale transforms on card hover — ring/glow via border + shadow only.

## Theme mechanics

- Driven by `data-theme="dark"` on `<html>`, persisted in `localStorage` key `gk-theme`, toggled by `theme.js`.
- **Every `<head>` starts with a pre-paint inline script** that sets the attribute before first paint — removing it causes a theme flash. Don't.
- Topbar morphs into a floating pill on scroll: `theme.css` owns the transition; each page's inline JS adds `.scrolled` to `.topbar` at `window.scrollY > 24`. In dark, the morph interpolates `background-color` only (gradient layers identical in both states — gradients can't interpolate).
- `theme.css`/`theme.js` are served with `Cache-Control: max-age=0, must-revalidate` (see infrastructure.md) — if shipped dark-mode work "looks unchanged" in a browser, suspect a stale cache and hard-refresh before debugging.
