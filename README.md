# Folio56 — 6.2 (web app)

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

## New in 6.2 — Notes, pages and notebooks

- **Notes and pages have their own homes.** The Notes board holds quick notes (ideas, lists, minutes). Pages — anything with pages inside, or anything you turn into a page — live under **Pages** (now pages only, still nested) and show as a **Recent pages** row on the board, so nothing feels lost.
- **No migration.** Nothing in the database changes. A note is a page if it has pages inside or sits inside one, unless you choose otherwise: **⋯ → Turn into a page / Turn into a note** sets an optional `kind`. Daily notes and decks always stay what they are.
- **Add a page inside** a note turns it into a page and says so. A RAV review of a quick note now sits *beside* it (same notebook, linked from the note) instead of turning the note into a page; reviews of pages still go inside.
- **Labels are now notebooks** — same storage, same names and colours. A note lives in one notebook and can also be shown in others: tap a notebook to move it, **+ Also here** to add another, **No notebook** to take it out. Old notes with several labels keep them all (the first is home).
- **A notebook page** shows its pages first, then its notes, with **New page** and **Import into notebook**. Select several → **Move to notebook**. Ctrl K: **New page**, **Open notebook: …**.
- **A one-time card** tells people who had pages or labels what changed (“Got it” / “Show my pages”). New users learn it from the welcome guide instead.
- Tests: `tests/v62-kinds.cjs` (35 checks).

## New in 6.2 — Welcome

- **A welcome page at `/`, the app at `/app/`.** The welcome page (`index.html`, assets in `public/welcome/`) is plain HTML with no app code, so it opens instantly. Anyone who has used Folio56 in this browser — the app sets a flag, and older users are recognised by their notes — goes straight to `/app/`, as do installed apps and every old link (`/#p=…` share links, `/?new=…` shortcuts, the share target). `/welcome` always shows the page.
- **Installed apps keep working.** The manifest keeps `id: "/"`, so copies installed before 6.2 stay the same app; it now starts at `/app/`, and shortcuts, the share target and “Open with” for PDFs point there. Offline, any `/app/…` address opens the app.
- **First run.** A brand-new browser gets a short welcome: your name, dark or light, then a pinned *Welcome to Folio56* guide note that teaches by being used. Skip it if you like; people who already have notes never see it. Settings → About shows the version, the welcome page and *Show the welcome guide*.
- **Backups that know the risk.** If the browser might clear Folio56 on its own — Safari’s 7-day rule, or storage the browser hasn’t promised to keep — the reminder comes sooner and says why, and on Chrome/Edge it offers daily backups to a folder in one tap.
- **Presentations, rebuilt.** AI decks now work like the best tools: first a *storyline* you can edit (action titles that state each slide's point, the layout for each, the facts it will use), then the slides. The AI uses **GPT-OSS 120B**, the strongest model on Groq's free plan, held to a strict JSON schema so every answer is valid; requests are sized to fit the free 8,000-tokens-a-minute limit, Folio56 waits when it's reached, and if the wait would be long, GPT-OSS 20B (which has its own allowance) steps in. Seven new visual layouts — **flowchart** (with decisions, branches and loops), **process**, **cycle**, **timeline**, **chart** (column, bar, line, pie), **2 × 2 matrix** and **agenda** — drawn from one shared geometry, so the preview, Present mode, the PDF and PowerPoint match. In PowerPoint they're native shapes and arrows, and charts are real, editable charts. No pictures are generated or fetched.
- **Number check.** Every figure on an AI slide is checked against your source (on this device, no AI); anything not found is flagged on the slide and its thumbnail until you fix it or confirm it. Only the source's figures are kept with the deck — never a PDF's text.
- **Presenter view** (press P while presenting): this slide, the next one, your notes, a timer and the clock. **Make it visual** turns a list slide into the best-fitting diagram. *From headings* (no AI) now spots numbered steps (→ process), dated lists (→ timeline) and adds an agenda when a note has three or more parts.
- **RAV — Reason · Attack · Validate.** Put an idea, plan or decision through three passes from a note's ⋯ menu (or search): *Reason* — the claim, what it rests on and how it follows; *Attack* — the strongest objections, ranked; *Validate* — which assumptions the note really backs up, each with an exact quote that Folio56 checks on the device (a quote that isn't in the note doesn't count), and the cheapest real test for every one that isn't, with what counts as a pass and what kills the idea. The result is a page under the note (the note is never changed); the tests become dated tasks, and each objection can be marked valid, answered or not relevant. A note's pages are read with it — the project's own library. Written-up voice memos offer to test their ideas.
- **Every free Groq model.** GPT-OSS 120B (best writing), **Qwen 3.8 27B** (preview — very fast, and it can see) and GPT-OSS 20B (fastest). Each has its own free per-minute allowance, so when one is busy the next one answers, and presentation slides are designed by all three side by side. Scanned PDFs (pictures of pages) are read by Qwen 3.8 for presentations. Old settings pointing at models Groq has retired (Llama, Kimi, Qwen 3) switch to GPT-OSS 120B. Settings → AI lists them, with a switch to keep to just one.
- **Shorter share links.** Links now carry only what the other side can't work out (no block ids, default settings or card previews), in a compact shape, compressed from a built-in dictionary of common note words — typically 60–85% shorter (a meeting note: about 1,170 → 480 characters; a short list: about 240). Pictures are redrawn smaller (WebP, at most 720 px) so links can keep them far more often. Links made before 6.2 still open. Still no server: the notes travel inside the link.
- **Readable dropdowns.** Dropdown lists now follow the theme; on Windows they could open white with near-white text.
- **Fixes:** a checked checklist item that wraps onto two lines is now struck through on every line (it looked like an underline on cards, Today and Tasks). The “56” in the logo is readable on light themes.

**Deploying 6.2:** clear the project folder except `.git`, unzip, push. `vercel.json` now routes `/app/…` to the app and everything else to the welcome page.

## New in 6.1 — Presentations

- **Make a presentation** from a note (with its pages inside), a Markdown file or a PDF — from a note’s ⋯ menu, the PDF menu in Margins, the + sheet on phones, or search (“make a presentation”).
- **With AI (optional)**: choose the purpose (inform, pitch, teach, status update, summary), the length and speaker notes, add your own instruction; the AI designs varied slides — big numbers, two columns, tables, quotes — from your content only. Rewrite any one slide: shorter, punchier, more detail, simpler.
- **Without AI**: *From headings* turns each heading into a slide with its points, tables, quotes and pictures; a PDF can become *one slide per page*. Nothing leaves the device.
- **8 themes** (Folio Classic, Boardroom, Midnight, Minimal, Sunrise, Blueprint, Forest, Studio), changeable any time.
- **The studio**: slides on the left, the slide in the middle, its content on the right — 9 layouts, add / duplicate / reorder / delete (with undo), pictures, speaker notes.
- **Present** full screen: → / Space / click to advance, ← back, N for speaker notes, Esc to end.
- **Download** as PowerPoint (.pptx, with speaker notes), PDF (print) or a Markdown outline. Presentations are notes too: they show their title slide on the card and are searchable.

- **Quotes into any note**: in Margins, the notes panel shows *Writing in ▾* — pick any note you already have, and quotes, highlights and snapped pages go there (with a line saying which PDF they came from). Switch back to the PDF’s own notes any time.

**Layout fixes**
- Margins: the sidebar tabs (Contents · Pages · Marks · Find) now stack icon over label, so they never squash.
- Long notes: the contents list sits beside the page, below the cover, and never over the text — the page moves aside a little on laptops, and narrower windows get a Contents button instead. Long outlines show the top level plus only the section you’re in.
- The word count moves into the header when the page fills the window, instead of floating over the text.
- Opening a note closes anything that was in front of it (search, templates, the presentation maker).

## New in 6.0 — Templates and export

**Templates, like a slide-deck gallery for your notes**
- A gallery of 26 templates in seven categories (Meetings, Projects, Engineering, Planning, Research & writing, Personal, Journal), each shown as a live miniature of the page it makes — colour, cover, tables and all. Search, browse, pick one to see a full preview.
- **Questions**: `{{Client}}` in a template becomes a question when you use it; `{{Due:date}}` asks for a date, `{{Status:Draft/Final}}` offers a choice. Skip one and it stays as a grey placeholder to type over.
- **Filled in for you**: `{{date}}`, `{{date:short}}`, `{{time}}`, `{{weekday}}`, `{{week}}`, `{{monday}}`, `{{tomorrow}}`, `{{name}}`.
- **Multi-page templates**: one template can create a page and the pages inside it (try *Project hub*).
- **Your own**: any note → ⋯ → *Save as template…* (name, icon, category, with its pages inside and its look). Edit a template in the full editor; *Customise* a built-in to make your own copy.
- **Defaults**: start every new note from a template, and choose the template for today’s daily note.
- **Insert**: type `/template` in any note to drop a template’s content in place.
- **Share**: save a template as a `.folio-template.json` file (images included) and import it on another device.

**Export anything, in the format you need**
- One Export dialog for a note (⋯ → *Export…*), a selection (select cards → Export) or everything (Settings → *Export notes…*).
- **Word (.docx)** with real headings, numbered lists, checklists, tables, quotes, code and images · **PDF** via the print dialog · **Markdown** (Obsidian-friendly, images in `assets/`) · **Web page** (one self-contained file) · **Plain text** · **Copy** formatted (for Word, Outlook, Teams, Docs) or as Markdown.
- Include the pages inside, images, and dates & labels; one document or separate files in a zip. Links between exported notes still work.

**One name, no device names**
- Settings has one *Your name*. The greeting uses your first name; the sidebar shows your initials, your name and when you last backed up. Backups and shared links say which browser they came from automatically.

**Smaller things**
- The Tasks badge counts only what’s overdue or due today. Recents shows the last six notes (daily notes live in Today/Journal). Short cards are tall enough that clicking them opens the note instead of a menu. Typing the start of an action in search (“export…”) puts that action first.

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
