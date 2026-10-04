# Folio V5.2 — QA, speed and storage report

Measured on a production build with a headless Chromium (no GPU), using `tests/metrics.cjs`
and a test library of **2,000 notes**, 12 of them with a photo and 30 history versions each.
Absolute numbers vary by device; the ratios are what matter.

## Before → after

| | V5.1 | V5.2 |
|---|---|---|
| Install size (offline copy) | 6.0 MB, 83 files | **3.0 MB, 46 files** |
| First screen download (gzip) | 279 KB, 5 font files | **251 KB, 2 font files** |
| 2,000 notes — time until cards show | 51.2 s | **≈0.5 s** |
| 2,000 notes — cards drawn at once | 1,961 | **23** (only what's on screen) |
| 2,000 notes — page elements | 109,769 | **1,524** |
| 2,000 notes — memory | 199 MB | **≈90 MB** |
| 2,000 notes — scrolling | 1 fps | **23–58 fps** |
| Search (Ctrl K) | 2.3 s | **0.25 s** |
| Open a note in a 2,000-note library | froze | **≈1.5 s** first time (includes loading the editor) |
| Tasks view, 2,000 checklists | 1.4 s | **0.23 s** |
| Storage used by the test library | 16.2 MB | **2.2 MB** |
| History data | 35 MB | **0.1 MB** |
| Copies of the same photo stored | 372 | **1** |

## QA — 32 automated checks, all passing

`npm run preview` then `npm run qa` (Playwright; screenshots + report in `qa-out/`).
Covers laptop, tablet (800×1280 touch) and phone (390 wide): composer, checklists, editor blocks,
images, covers, duplicate, pin / colour / archive / trash / restore, labels, sub-pages, empty-note
cleanup, Ctrl K, Today + Journal, templates, history, locked notes, Markdown import/export,
JSON backup/restore on a second device, share links, storage panel, wallpapers, accessibility (axe),
keyboard, old-data migration + repair, a 2,000-note library, and working offline.
No console errors, no requests to any outside server.

## Bugs found and fixed
1. Big libraries froze the app (every card re-laid out the whole board). Now only visible cards are drawn and size changes are batched.
2. The pin button on cards couldn't be clicked — the card's text layer sat on top, so clicks opened the note instead.
3. Pressing Esc in the composer's Title field did nothing (only the body field reacted).
4. The colour menu on cards in the left-most column was cut off. Menus now stay on screen.
5. Cards in Trash / Archive were announced as "disabled" to screen readers (and blocked their buttons for automation).
6. The card ⇄ editor animation could clash ("duplicate view-transition-name" warnings).
7. The editor reloaded the entire library on every save; it now loads only its sub-pages and breadcrumb.
8. Pages and Tasks views slowed down quadratically with many notes; they now build once and show in pages.
9. Accessibility: unnamed dialogs, unlabeled inputs, a button nested in a button (wallpaper picker), unnamed editor area.

## Known limits
- Checklist checkboxes inside the editor come from the editor library and have no spoken label yet.
- Text contrast on top of a custom wallpaper can't be checked automatically; the Dim slider (default 50%) is the safeguard.
- Rarely used code languages and the emoji picker's data download the first time they're used (then work offline).
- Tested in Chromium; real-device testing on the Tab A9 is still worth a quick pass.
