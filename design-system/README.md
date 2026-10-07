# Design System

Extracted from [Trystan-SA/claude-design-system-prompt](https://github.com/Trystan-SA/claude-design-system-prompt) (MIT, © 2026 Trystan Sarrade), `claude/system-prompt.md`.

## Provenance — read this first

The source repo contains **no UI code** (no CSS, theme, or components); it is a system prompt that *describes* a design philosophy. So this system is a mix, marked in `tokens.css`:

- **`[SRC]`** — values stated in the source: spacing scale, type scale, semantic colors, gray-50/100/900, off-white `#FAFAFA` / near-black `#1A1A1A`, oklch palette recipe, 0.2–0.3s ease motion, 44px hit targets, 2px focus ring, WCAG ratios.
- **`[FILL]`** — left undefined by the source (brand primary/accent, font families, radii values, shadow values, weights, line-heights, gray 200–800). Chosen here; they are decisions, not extractions.

## Files

- `tokens.css` — all tokens + focus/reduced-motion base rules
- `components.css` — button, card, callout, field, honest-placeholder
- `preview.html` — visual reference

## Rules carried over from the source

1. Tokens only — no arbitrary values (`var(--space-md)`, never `17px`).
2. ≤2 font families; don't default to Inter/Roboto/Arial.
3. Flat color over gradients; cards use border + subtle shadow; `border-left: 4px` only for semantic callouts.
4. No pure `#fff` on `#000`.
5. Every interactive element has default / hover / active / focus / disabled states. Never remove the focus ring.
6. Never use color alone for state — add icon or text.
7. Honor `prefers-reduced-motion`.
8. Min sizes: 44×44 hit targets; mobile body 16px; slides body ≥24px.

## Known issues (found while extracting)

Contrast against white, computed:

| Token | Ratio | Text (4.5:1) | UI/large (3:1) |
|---|---|---|---|
| `--color-error` | 4.83 | pass | pass |
| `--color-info` | 3.68 | **fail** | pass |
| `--color-success` | 2.54 | **fail** | **fail** |
| `--color-warning` | 2.15 | **fail** | **fail** |
| `--color-primary` | 5.97 | pass | pass |
| `--color-accent` | 5.11 | pass | pass |

The source's own success/warning/info colors violate its own WCAG rule when used as text or as the sole indicator. Use them as fills/borders paired with dark text and an icon, or darken them before using as text. I did not alter them, since they are `[SRC]`.
