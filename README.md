# Folio — V5.6 (web app)

Private, offline notes: Google Keep outside, Notion inside.
Everything is stored in the browser on each device (IndexedDB). No accounts, no server, no cloud database.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

## Update an existing Vercel deployment (keeps the same URL — and your notes)
Notes are stored per web address, so a new address starts empty. With Vercel Drop (no Git, no CLI):
1. vercel.com → open your **existing Folio project** (don't use vercel.com/drop — that always makes a new project and a new URL).
2. Drag this whole `folio` folder (or the zip) onto the project page. Vercel builds it and replaces production at the **same URL**.
3. Open Folio; when "A new version is ready" appears, tap **Update**.
Export a backup in Settings first, just in case. Drop the whole folder (not just `dist/`) so the small `api/` relay used by voice memos is included.

## Deploy to Vercel (free Hobby plan)
1. Push this folder to a GitHub repo.
2. vercel.com → Add New → Project → import the repo. Vercel detects Vite automatically (build `npm run build`, output `dist`).
3. Open the URL on the laptop (Chrome/Edge → Install app) and on the Tab A9 (Chrome → ⋮ → Add to Home screen / Install).

Vercel only serves the app's static files; your notes never go to Vercel. After the first load, the app works fully offline.

## New in V5.6 — Calmer, lighter, fits every screen
Built on the 5.4 look (5.5's experiments set aside), shaped by what people say they want from note apps: fast capture, a clean distraction-free editor, beautiful type, your data on your device, no clutter.
- **New type**: *Geist* for the interface and your writing (crisp and very readable on laptop, tablet and phone), *Newsreader* for titles (a serif with optical sizes; calmer than Fraunces). Bundled, so they work offline.
- **No score-keeping**: the progress ring, the streak and the writing-days grid are gone. The Today card is now date + greeting, today's focus, what's due, and **Continue** — one tap back into the page you were last working on.
- **Muted light mode**: Settings → Appearance → *Dark · Light · Auto*. Two light themes — **Paper** (warm off-white, soft ink) and **Mist** (cool grey-blue) — never pure white or pure black; note colours become soft pastels; links and labels switch to a deeper ink so they stay readable (all text passes WCAG AA). **Auto** follows your device's light/dark setting. Dark stays the default. Ctrl K → "Switch to light/dark mode" too.
- **Calm writing (laptop)**: start typing and the page's controls fade back; move the mouse and they return.
- **Title A–Z** sort; **N** also starts a new note (as well as C).
- **Responsive**: checked on phone (390 px), Galaxy Tab A9 portrait (800 px) and landscape (1340 px), small and large laptops — no sideways scrolling, in both modes.
- QA: `npm run preview`, then `node tests/v56.cjs` (13), `node tests/v54.cjs` (28), `node tests/v53.cjs` (33), `npm run qa` (32).

## New in V5.4 — Tasks that get done, meetings that follow through
**Tasks, rebuilt** (every checkbox in Folio, as one to-do list)
- Smart lists: **Today** (overdue + due today + starred), **Upcoming** (day by day for a week, then next week, then by month), **Anytime** (no date), **All** (by note), **Done**.
- **Quick add** understands plain words as you type — “call Ahmed tomorrow !!”, “send quote fri”, “10 oct”, “next week”, “in 3 days”, `@name`, `!!` to star — and shows chips before you press Enter. Quick-added tasks go to an **Inbox** note.
- Round checkboxes with a satisfying tick; finished tasks stay a moment, then leave, with **Undo**.
- **Overdue → Move all to today** in one tap. Filter by person (Everyone / Ahmed / … / Unassigned).
- Tap a task for its sheet: edit words, **When** (Today, Tomorrow, This weekend, Next week, pick a date, no date), who, star, delete, or jump to its note.
- Phones: **swipe right** to complete, **swipe left** to schedule.
- Dates and stars are small readable markers in the task's own text (`📅 2026-10-10`, `⭐`) — portable to Markdown/Obsidian. Minutes from voice memos now write real dates (“Friday” → the calendar date).
- Note cards show tidy tasks with their due date; the Today card shows what's due/overdue.

**Meetings follow-through**
- **Recurring meeting** picker in the recorder (a *series*). Folio passes last meeting's open action items to the write-up, adds **Follow-up from last meeting** (✅ done / ⏳ open / ❔ not discussed), and offers to **tick the done ones** in last meeting's note.
- Series notes are titled “Series · date”.
- **Copy as message** (note ⋯): WhatsApp/chat format (bold headings, ☐ tasks, due dates in words) or plain email (with “Open mail app”), share sheet on phones; recordings left out, transcript optional.

**Voice anywhere**
- **Dictate into this page**: mic in the editor header / ⋯ / keyboard bar → a small pill above the keyboard → words inserted at the cursor. **Tidy** fixes punctuation and filler words (on by default).
- **Spoken journal**: “Speak it” on the Today card, “Speak today's entry” in Journal, or Ctrl K. Written up in your own voice under a 🎙 time heading in today's note; to-dos become tasks.
- **Quick capture links**: `/?record=memo`, `/?record=journal`, `/?new=text`, `/?task=text`, `/?view=tasks&add=1`. Installed on Android/Windows/Mac: long-press the Folio icon for the same shortcuts. Settings → Quick capture lists them with copy buttons and iPhone Shortcuts steps.

**Board**
- **Stacks**: notes in a series show as one stacked card listing its notes — tap to fan out, tap the series chip to fold back. Select notes → **Stack** (layers icon), or accept the suggestion Folio makes for numbered notes like “01 — …, 02 — …”.
- **Label colours**: every label gets its own colour automatically (pick one in the label menu to override); cards carry a soft glow of their label's colour.
- **Cards that suit their content**: code shows as a small dark code panel (a few lines), long structured pages show their outline + reading time, recordings show a waveform and length.
- Phones: **swipe a card** right to pin, left to archive (with Undo). Touch drag now needs a long-press, so swipes never pick a card up by accident.
- QA: `npm run preview`, then `node tests/v54.cjs` (28 checks), `node tests/v53.cjs` (33) and `npm run qa` (32).

## New in V5.3 — Voice memos and a real iPhone layout
**Voice memos → Markdown & meeting minutes** (Groq's free API, your own key)
- Record from the **+** button (phone), the mic in "Take a note…" (laptop/tablet), **V**, or Ctrl K → "Record a voice memo". Pause, resume, live level meter, screen kept awake.
- Choose **Meeting minutes** (summary, discussion elaborated per topic, decisions, action items with owners & dates, open questions, next steps), **Structured note**, or **Transcript only**.
- Action items arrive as real checkboxes, so they show up in **Tasks**.
- The page keeps the recording and a timestamped **Transcript** folded under a toggle. "Rewrite from recording…" redoes the write-up in another style without re-uploading audio.
- **Formalise with AI…** (note ⋯ menu) does the same for rough typed notes; the original text is kept, folded, and the previous version stays in history.
- Long meetings: audio is recorded in 5-minute pieces (each a complete file); long transcripts are condensed part by part to fit the free plan's per-minute limit, waiting and retrying automatically when Groq says "slow down".
- Privacy: off until you add a key (Settings → **Voice & AI**, or right in the recorder). Audio/text go to Groq only for the write-up you ask for. The key is stored on this device and is never in backups or share links. Recordings never go into share links.
- If a browser blocks direct calls to Groq, Folio uses the tiny `api/groq.js` relay on your own Vercel site (it forwards, never stores).
- Settings: spoken language (auto, English, Urdu, Hindi…), write-up language (same / always English), accurate vs fast transcription, writing model, keep audio.

**iPhone (Safari) layout**
- Bottom tabs: Notes · Pages · **+** · Tasks · Journal. The **+** opens a sheet: Voice memo, Note, Checklist, Photo, Template, Today, Open a link.
- Two-column cards like Keep, a compact Today card, and large titles that shrink into the header as you scroll.
- Every menu becomes a bottom sheet (thumb-reachable, never cut off); dialogs slide up; search is full screen with Cancel.
- In the editor: a **formatting bar on top of the keyboard** (block menu, heading, checklist, lists, bold/italic/code, indent, image, undo/redo, hide keyboard) and a **Done** button; quieter header, text options and history moved into ⋯.
- No more zoom-in when tapping a field; safe areas respected (notch, home bar); long-press on a card selects instead of popping up iOS text tools.
- **Add to Home Screen** hint: opens full screen, and Safari won't clear the notes after a week without a visit. Note: on iPhone, Safari and the Home Screen app keep separate storage — move notes over with Share all (copy link → Open a link) or Export/Import.
- QA: `npm run preview`, then `node tests/v53.cjs` (33 phone + voice checks, Groq mocked) and `npm run qa` (32 checks).

## New in V5.2 — Faster, lighter, sturdier
Full numbers and the bug list: **QA-REPORT.md**.
- **Big libraries stay fast**: only the cards on screen are drawn; 2,000 notes open in about half a second (was ~50 s).
- **Smaller install**: 3 MB instead of 6 MB. Rare code languages, extra font alphabets and the emoji data load on first use, then work offline.
- **Images stored once**: pictures live in their own store as real image files and notes point to them, so a photo isn't copied into every history snapshot, duplicate or template. Old notes are converted automatically on first start (all-or-nothing — if anything fails, nothing changes). Locked notes keep their images inside the encryption.
- **Smarter history**: last 15 versions in full, then one a day for a month, then one a week (max 40).
- **Settings → Storage on this device**: what's using space, plus Clean up images, Trim history, Clear history, Empty trash, and whether the browser has promised not to clear Folio's data.
- **Safety**: a calm crash screen (with Reload / Export backup) instead of a blank page; "A new version is ready — Update" instead of silent swaps; broken links between pages and labels are repaired at start-up.
- **QA**: `npm run preview`, then `npm run qa` runs 32 browser checks (laptop, tablet, phone, offline, accessibility). `npm run metrics` measures speed and storage.
- Tip: export a backup (Settings → Export all) before deploying any new version.

## New in V5.1 — Wallpapers
Settings → **Wallpaper**, like a desktop background. Saved **per device**, so the laptop and the tab can each have their own.
- 7 built-in wallpapers drawn in the browser (no downloads): Aurora, Dusk ridges, Topography, Nebula, Dunes, Deep tide, Bokeh.
- **Your own picture**: pick any photo; it's resized (max 2560 px, WebP) and kept in this browser only.
- **Dim**, **Blur** and **Cards** (glass see-through) sliders keep text readable on busy pictures.
- Picking a wallpaper sets a matching accent; for your own picture the accent is sampled from it. **Match accent** re-applies it; picking any swatch overrides it.
- The note editor stays mostly solid for comfortable writing; sidebar, headers and cards turn to frosted glass.
- On touch tablets per-card blur is skipped to keep scrolling smooth.

## New in V5 — Share as a link (no server, no files)
Select notes (or open one) → **Share as link**. The notes — sub-pages, labels and small images included — are compressed and packed *inside the link* after the `#`. Browsers never send that part to the web server, so neither Vercel nor anyone else sees your notes.
- **Protect with a code** (on by default): a code like `summit-sunset-lotus-95` encrypts the link (AES-GCM, PBKDF2 key). Send the code separately, or switch on "put the code in the link".
- Send the link any way you like — WhatsApp, email, a chat to yourself. Tapping it opens Folio with a preview.
- **Receiving:** the preview marks each note **New**, **Update** (newer than yours) or **Already here**; pick what to add. Labels are matched by name, so nothing is duplicated. Sharing the same note again later updates it in place.
- If a link opens in the wrong browser: Settings or Ctrl K → **Open a shared link** → paste.
- Installed on Android, Folio appears in the share sheet: share a Folio link *to* Folio from any app.
- Images make links long, so they're included only while the link stays short (there's a switch). Links over ~60k characters are blocked — share fewer notes, or use Export all for a full move.
- Locked notes aren't shared (they're encrypted with this device's passcode) — unlock them first.

## New in V4
- **Today home**: big date, today's focus tasks (tick or add without opening the note), progress ring, streak and 14-week writing grid; collapsible
- **Journal**: month calendar + timeline of daily notes; click any day to open or start it. Daily notes no longer clutter the wall
- **Labels, rebuilt**: coloured dots + note counts in the sidebar, ⋯ menu per label (rename, colour, delete), label page header with count, menu and "Import into label"; tinted label chips
- **Fix**: importing Markdown while viewing a label now tags the notes with that label
- **Candlelight**: colours warm and blue light drops from 7 pm (fades back by 7 am) — or always / off
- **Film grain** + frosted-glass sidebar and menus
- **Cards**: gradient washes, stacked-paper edge for notes with pages, pinned ribbon, checklist ring, staggered fade-in
- **Brand**: ink-drop + italic serif "folio" wordmark that draws itself in; matching app icon

## New in V3
**Markdown import (Claude, ChatGPT, Obsidian, Cherry Studio…)**
- Import .md files, a whole folder (sub-folders become pages), drag & drop anywhere, or paste Markdown
- Keeps headings, tables, code blocks (with language), checklists, nested lists, quotes, dividers, inline code/bold/italic/strike
- Front matter: `title`, `tags`/`labels` → labels, `color`, `icon`, `pinned`, `created`
- First `# Heading` becomes the title; `> [!NOTE]`-style callouts become styled callouts; `[[wiki links]]` become text
- Images next to the files are embedded; web images become links unless you tick "Load web images"
- Preview every file before importing; choose destination page, label and colour
- Export all as Markdown (.zip with folders + assets) — round-trips with the importer
- Try it with `examples/markdown-sample/`

**Visual refresh**
- Dark-only cosy themes: Charcoal, Espresso, Moss, Arctic, Dusk, Midnight, OLED black; 7 soft accents (each theme suggests one)
- Syntax-highlighted code blocks with a language picker (Shiki, bundled for offline)
- Fraunces serif titles (bundled, works offline), time-of-day greeting
- Softer layered dark surfaces, toned-down vivid colours, subtle card highlight
- Page icons (emoji), covers (gradients or your image), paper backgrounds (grid / dots / lines), coloured labels
- Card → page morph animation, animated checkboxes/strike-through, smooth reordering
- Tablet: bottom tab bar in portrait, icon rail in landscape; empty-state illustrations; callout and code styling; friendly dates

## From V2
**Writing**
- Full-page editor (Notion-style block editor: slash menu, headings, lists, to-dos, toggles, code, tables, images, drag blocks)
- Focus mode (Ctrl+Shift+F): hides everything and dims all but the paragraph you're in
- Typewriter scrolling, Default / Serif / Mono fonts, 3 text sizes, readable or wide page
- Live word count + reading time, "Saved" indicator, Ctrl+S saves a version
- Export any note as Markdown

**Cards (Keep, improved)**
- Vivid or Subtle colour style, Comfortable or Compact density, grid or list
- Tick checklist items right on the card, progress bar, headings/code previewed, labels and sub-page counts
- Drag to reorder (custom order), or sort by edited / created
- Select several notes (tick circle, or long-press on touch) → pin, colour, label, archive, delete in one go

**Organising & privacy**
- Locked notes: AES-256 encrypted on the device with your passcode (PBKDF2); no recovery if you forget it
- Labels, archive, trash, pages inside pages, Pages tree

**Productivity**
- Today's daily note (T), templates (meeting, project, bug, idea, checklist + save your own)
- Tasks view: every checkbox from every note in one place
- Version history per note (automatic every few minutes and on close; restore any version)
- Ctrl+K command menu: search notes and run any action; C = new note, / = search

**App**
- Installable PWA, works offline, laptop + Tab A9 + phone layouts, floating + button on touch screens
- Export all / Import (JSON backup)

## Next
See V5.1 ideas in the chat.

## Code map
- `src/App.tsx` — layout, views, top bar
- `src/components/` — Sidebar, Composer, NoteCard, NoteEditor, PagesView, SearchDialog, SettingsDialog
- `src/lib/db.ts` — Dexie (IndexedDB) schema + note actions, export/import
- `src/lib/blobs.ts` — image store (references, migration, cleanup); `src/lib/maintenance.ts` — start-up housekeeping; `components/StoragePanel.tsx`, `components/Safety.tsx` (crash screen, update prompt)
- `tests/qa.cjs`, `tests/metrics.cjs` — QA suite and performance metrics
- `src/lib/wallpapers.ts` — built-in SVG wallpapers, image resize, accent sampling; `components/WallpaperPicker.tsx`; `Wallpaper` layer in `components/Atmosphere.tsx`
- `src/lib/parcel.ts` — share-link format (pack/unpack, link, preview, accept); `components/ParcelDialogs.tsx` — Share / Open-link UI
- `src/lib/preview.ts` — card preview extraction from BlockNote blocks
- `src/lib/colors.ts` / `src/index.css` — design tokens
