# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Desktop app: Tauri 2 webview (WebView2 on Windows). The primary target is Windows, and the UI is a single-window web surface.

## Users

People on Windows whose drive is filling up. They want to find what is using the space and free some of it without breaking anything. They come back to the app every so often, not every day.

## Product Purpose

Scan a drive, show what fills it as a nested treemap, and say in plain English what is safe to delete. Success is freeing real space with confidence, in minutes.

## Positioning

A treemap combined with curated cleanup rules for Windows (`src-tauri/rules.json`). Each rule has a verdict (safe, your-call, keep), an explanation and how to free the space. Deletion happens only for safe rules, only after an inline confirm, and the backend re-resolves every path.

## Capabilities and Constraints

- The scanner folds every item under 100 MB into an "other" bucket per folder. The tree is full depth for anything at or above that size.
- Navigation works like a browser: back and forward (also mouse buttons 4 and 5, and Alt+Left/Right), up to the parent, and breadcrumbs.
- Categories (System, Apps, Games, Code, Cache, Media, Documents) are inferred in the frontend from folder names and file extensions. They are a hint, not a rule verdict.
- Theme follows the system and can be overridden to light or dark.

## Brand Commitments

- Name: "Disk Heatmap".
- Visual reference the user chose: disktree (a Linux disk analyzer). It uses a nested treemap with category hues, hatching on reclaimable items, a selection panel and a "worth a look" list.
- The user rejected: colored left borders on cards, filler explanatory copy, and anything that reads as AI-generated UI.

## Product Principles

- The map is the product. Chrome stays quiet so tiles carry the information.
- Never delete anything unless the user has seen exactly what goes and confirmed it.
- Plain words over jargon. Every control names its action.
