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
- **Treemap** (`src/Treemap.tsx`, `src/lib.ts`): nested squarified layout, disktree-style. Folders draw their contents inside a title strip, 3 levels deep by default (`[` / `]` or the Depth control, 1–6). Tiles are tinted by kind, guessed from the folder or file name (apps, games, code, cache, media, documents, system), and get lighter (dark theme) or darker (light theme) on a log scale as they get bigger. Folders a cleanup rule marks safe are hatched; "your call" ones get a sparser hatch. Click a folder to zoom in, click a file or right-click anything to show it in Explorer.
- **Navigation** (`src/App.tsx`): browser-style history. Back / Forward buttons, the mouse side buttons, Alt+←/→ and the keyboard's browser keys move through it like Chrome; Backspace goes up one folder; breadcrumbs jump to any parent. Rescan returns to the folder you were in.
- **Side panel** (`src/Panel.tsx`): details for the tile under the pointer (or the current folder), the known caches grouped into "Safe to clean" and "Your call" (each with its path, explanation and Clean button), and the drive's free space.
- **Cleanup advice** (`src-tauri/rules.json`, `src-tauri/src/rules.rs`): each rule has path patterns (`%ENV%`, `{DRIVE}`, and `*` within one folder name), a verdict (`safe` / `your-call` / `keep`), an explanation and how to free the space. Deletion is offered only for `safe` rules that have an action, always after an in-app confirm. The backend resolves the paths again itself, so the UI can't point a delete anywhere else.

## Releasing

Windows is the only target, and GitHub Actions does the building:

- **CI** (`.github/workflows/ci.yml`): every PR and push to `main` runs clippy, the tests and an NSIS build on `windows-latest`. The installer is attached to the run as an artifact.
- **PR titles** are Conventional Commits (`feat(ui): …`, `fix(scan): …`), checked by `pr-title.yml`. Squash-merge, so the title becomes the commit on `main`.
- **Version bump** (`version-bump.yml`): after each merge, `feat` bumps the minor, `fix`/`perf` the patch, `type!:` or a `BREAKING CHANGE:` footer the major, and the bot commits `chore(release): bump version to X.Y.Z`. Other types don't bump. The version lives only in `src-tauri/Cargo.toml` (and its `Cargo.lock` entry).
- **Release** (`release.yml`): tag the bump commit and push the tag:

  ```sh
  git pull && v=$(grep -m1 '^version' src-tauri/Cargo.toml | cut -d'"' -f2)
  git tag "v$v" && git push origin "v$v"
  ```

  It refuses a tag that isn't `vX.Y.Z`, isn't on `main` or doesn't match `Cargo.toml`, then builds and signs the installer and publishes a GitHub Release with `Disk-Heatmap-Setup-x64.exe`, `Disk-Heatmap-X.Y.Z-Setup-x64.exe` and `latest.json`. To respin, re-run the failed jobs.

- **Updates**: a release build checks `releases/latest/download/latest.json` once at start, downloads a newer installer in the background, verifies its signature against `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, and shows **Update to X.Y.Z** in the header. Clicking it runs the installer (passive mode) and relaunches.
- **Signing key**: the updater key is a minisign pair, separate from Authenticode (the installer itself is not code-signed, so SmartScreen warns on first run). The release job refuses to run without the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo secrets. Keep an offline backup of the private key and its password: if they are lost, installed copies can never accept another update, and users would have to reinstall by hand.

## Adding a rule

Add an entry to `src-tauri/rules.json` and restart. Use `"action": "delete_contents"` to empty a folder but keep the folder itself, or `null` for advice only.

## Known limits / next steps

- Sizes are logical file sizes; hard links (WinSxS) are counted more than once.
- Folders you can't read without admin rights are skipped (the count appears above the map).
- Next: read the NTFS MFT directly when running as admin, for WizTree-style scans that finish in seconds.
