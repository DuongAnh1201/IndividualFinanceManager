# Theme — "Cozy Coins"

Owner: **codex1**. Neutral, mid-tone, cute. Not too dark, not too light.

## Palette (design tokens)
| token | hex | use |
|---|---|---|
| `--bg` | `#E4E0D9` | warm stone page background (never pure white) |
| `--surface` | `#EEEBE6` | cards, sheets |
| `--surface-2` | `#D9D3C9` | inputs, chips |
| `--text` | `#33302C` | primary text (never pure black) |
| `--text-muted` | `#6E6961` | secondary text |
| `--border` | `#CDC7BD` | hairlines |
| `--accent` | `#7C8C78` | sage — primary buttons, links |
| `--warn` | `#C49A5A` | living limit ≥ 80 % |
| `--danger` | `#B07A5E` | clay — over limit |

Chart series (muted pastels, distinguishable, colour-blind-checked):
`#7C8C78` sage · `#A3907A` latte · `#8A9BAE` dusty blue · `#B59AA6` mauve · `#C2AE7E` wheat · `#8FA89C` eucalyptus · `#A88C8C` rosewood.

## Cute style
- Rounded everything: radius 16 px cards, 999 px pills; soft shadow `0 2px 0 #CDC7BD`.
- Font: **Nunito** (rounded) for UI, tabular numbers for money.
- Gentle micro-animations (bounce on add, wiggle on warning). Respect `prefers-reduced-motion`.

## Mascots — original characters only
Do **not** use existing/copyrighted characters. Simple flat SVGs, drawn in the palette above.

| mascot | where |
|---|---|
| **Penny** the piggy bank | app logo, dashboard greeting, empty states |
| Bottle buddies — one critter per bottle: **Nest** the hen (Necessities), **Turtle Tuck** (Long-term Savings), **Sprout** the seedling (Financial Freedom), **Owlie** (Education), **Bun** the bunny (Play), **Bee Kind** (Give) | bottle cards, allocation view |
| **Mochi** the cat | pay-day reminder banner ("Payday! Feed the bottles 🐾") |
| Moods | Penny happy (under limit) · worried (≥ 80 %) · dizzy (over limit) |

New bottles/categories pick a mascot from a small built-in set.

## Accessibility
- Text contrast ≥ 4.5:1 on `--bg` and `--surface`.
- Mascots are decorative (`aria-hidden`) unless they carry status; status always also shown as text.
