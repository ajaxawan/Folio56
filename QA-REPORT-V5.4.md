# Folio V5.4 — QA report

Production build, Chromium with Playwright's iPhone 14 emulation (touch swipes sent as real touch events) and a laptop viewport. Fake microphone; Groq mocked (transcription, minutes with follow-up, journal, dictation).

| Suite | Result |
|---|---|
| `node tests/v54.cjs` — tasks, series follow-up, copy as message, dictation, journal, quick capture, stacks, label colours, swipe | **28 / 28** |
| `node tests/v53.cjs` — phone layout + voice memos | **33 / 33** |
| `npm run qa` — laptop / tablet / phone / offline / accessibility | **32 / 32** |

## What the V5.4 checks cover
- Stack suggestion for numbered notes → stacked card → fan out → fold back.
- Labels get distinct colours.
- Swipe a card left → Archived + Undo; Undo restores it.
- Tasks: Today shows Overdue + "Move all to today"; quick add parses "tomorrow" and "!!" live and files into Upcoming → Tomorrow; task sheet reschedules; swipe right completes with Undo; no sideways scroll.
- Recurring meeting: follow-up banner ("1 of 2 open items sound done"), series title, "Tick it off" ticks the item in last week's note.
- Copy as message: chat format (bold title, ☐) without the recording; email format with plain headings.
- Dictation inserted into the page.
- Spoken journal added to today's note under a 🎙 heading.
- Quick-capture links: ?task=, ?new=, ?record=memo; Settings lists them.

## Fixed along the way
- Phone + desktop sort menus could open together (5.3, already fixed) — no new instances.
- Touch could start a card drag on a quick sideways move; touch drags now need a long-press.
- A one-note series showed a useless "collapse" chip.
- The selection bar could overflow on narrow phones (Pin moved to swipe on phones).

## Please check on the real iPhone
Tests ran in Chromium with iPhone emulation, not WebKit: swipe feel, the dictation pill position above the keyboard, and microphone prompts need a hands-on check. Real Groq output will vary from the mocked text.
