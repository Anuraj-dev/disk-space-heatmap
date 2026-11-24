# Disk Heatmap

A small Windows app (Tauri 2 + Rust + React) that shows what is filling a drive as a heat map and explains, in plain English, what is safe to delete.

## Run it

```powershell
npm install
npm run tauri dev
```

Requirements: Node 18+, Rust (stable, MSVC target) and the "Desktop development with C++" Build Tools. The Build Tools provide the linker Rust uses on Windows; the Visual Studio IDE itself is not required. On this machine they are installed under `D:\DevTools`.

To produce an installer: `npm run tauri build` (output in `src-tauri/target/release/bundle/nsis`).

## How it works

- **Drives**: `sysinfo` lists volumes with used/free space.
- **Scanner** (`src-tauri/src/scan.rs`): parallel `read_dir` walk on a rayon pool. On Windows the per-entry metadata comes from the directory listing itself, so there's no extra syscall per file. It skips symlinks, junctions and other reparse-point folders, counts OneDrive cloud-only files as 0 bytes, and folds anything under 100 MB into an "other small items" bucket as it goes. Progress is emitted as `scan-progress` events about 8 times a second.
- **Treemap** (`src/Treemap.tsx`, `src/lib.ts`): squarified layout with log-scale heat colours from pale yellow to deep red. Click a folder to drill in, use the breadcrumbs to go back, right-click to show it in Explorer.
- **Cleanup advice** (`src-tauri/rules.json`, `src-tauri/src/rules.rs`): each rule has path patterns (`%ENV%`, `{DRIVE}`, and `*` within one folder name), a verdict (`safe` / `your-call` / `keep`), an explanation and how to free the space. Deletion is offered only for `safe` rules that have an action, always after an in-app confirm. The backend resolves the paths again itself, so the UI can't point a delete anywhere else.

## Adding a rule

Add an entry to `src-tauri/rules.json` and restart. Use `"action": "delete_contents"` to empty a folder but keep the folder itself, or `null` for advice only.

## Known limits / next steps

- Sizes are logical file sizes; hard links (WinSxS) are counted more than once.
- Folders you can't read without admin rights are skipped (the count appears in the status bar).
- Next: read the NTFS MFT directly when running as admin, for WizTree-style scans that finish in seconds.
