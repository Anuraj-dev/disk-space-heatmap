# Disk Heatmap design

Operate-mode desktop tool. The map is the product; everything around it is quiet, neutral chrome so the tiles carry the colour.

## Principles

- **Tiles hold the colour.** Chrome is grey-neutral; the one accent (amber) marks selection, hover outlines, and meters.
- **Say it once.** No status-bar sentence, no subtitles, no eyebrow labels. Shortcuts live in button tooltips.
- **No decorative rules.** No coloured side borders on cards or rows; verdicts are a small mark plus words.
- **Browser muscle memory.** Navigation behaves like Chrome history, including the mouse side buttons.

## Theme

Follows the system (`prefers-color-scheme`), overridable to light or dark from the header (stored in `localStorage.theme`). All tokens are CSS custom properties in `src/styles.css`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f2f2f0` | `#101112` | Window behind the map |
| `--chrome` | `#fafaf9` | `#17181a` | Header, panel, cards |
| `--raised` / `--hover` | `#ebebe8` / `#e3e3df` | `#212225` / `#292a2e` | Buttons, expanded rows |
| `--line` / `--line-strong` | `#deded9` / `#c9c9c3` | `#26282b` / `#393b40` | 1px separators, bars |
| `--text` / `--muted` / `--faint` | `#1a1b1c` / `#5b5c59` / `#7d7e78` | `#e9e8e4` / `#a4a39e` / `#7b7b76` | Text tiers |
| `--accent` | `#b5650f` | `#eea443` | Selection, hover outline, meters, focus ring |
| `--danger` | `#c23b2a` | `#f06b56` | Delete, disk over 90% |
| `--ok` | `#2f8a57` | `#6fc592` | "Safe" mark and total, success message |

## Tile colour

`oklch(L C H)` where H and C come from the category class and L from size heat `--t` (0..1, log scale from the 100 MB floor to the folder on screen):

- Light: `L = 0.935 − 0.17·t`; dark: `L = 0.285 + 0.135·t`. Folder groups sit slightly darker (`--group-dl`).
- Chroma scales from 50–55% to 100% with heat, so small tiles read greyer.

| Category | Hue | Chroma |
|---|---|---|
| Apps | 248 | .075 |
| Games | 302 | .075 |
| Code | 152 | .07 |
| Cache | 78 | .08 |
| Media | 8 | .075 |
| Documents | 200 | .065 |
| System | 262 | .022 |
| Other | — | ~0 |

Reclaimable (`safe`) tiles: 135° hatch, 1.5px lines every 6px. `your-call`: 1px every 11px. The "small items" bucket is flat `--other-bg`.

## Type

- UI: Segoe UI Variable (Windows 11), falling back to Segoe UI / system-ui. 13.5px base, tabular numerals everywhere.
- Paths only: Cascadia Mono → Consolas.
- Numbers that matter are large and set tight: selection size 34px/600, disk free 22px/600, scan progress 40px/600.

## Components

- **Header (44px):** brand · history (Back, Forward, Up) · breadcrumbs · spacer · Depth −/+ · Rescan · theme.
- **Sub-bar (34px):** size, file count, scan time, warnings in amber · legend (hidden below 1180px except the hatch key).
- **Treemap:** 3px gaps at the top level, 1px inside; 18px folder title strip; labels drop size, then name, as tiles shrink. Hover = 1.5px inset amber outline.
- **Panel (312px, 272px under 960px):** Selection (or This folder) → Worth a look (ranked rows, a neutral size bar, click to expand; delete confirms inline, never in a modal) → Disk pinned to the bottom.
- **Icons:** one 16px stroke set in `src/icons.tsx` (1.6 stroke, round caps). No emoji or icon fonts.

## Motion

- Drill in: the map grows from the clicked tile, 220ms `cubic-bezier(0.16, 1, 0.3, 1)`.
- Back / up / breadcrumb: 140ms fade.
- All of it is off under `prefers-reduced-motion`.
