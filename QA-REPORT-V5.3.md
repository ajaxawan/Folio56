# Folio V5.3 — QA report

Run against the production build (`npm run build && npm run preview`) in Chromium, using Playwright's iPhone 14 emulation (390×664, touch, iOS user agent) plus a laptop viewport. The microphone is Chromium's fake audio device; Groq is mocked (the real API isn't reachable from the test machine), including a forced "rate limited" reply and a rejected key.

| Suite | Result |
|---|---|
| `node tests/v53.cjs` — phone layout + voice memos | **33 / 33** |
| `npm run qa` — existing laptop / tablet / phone / offline / accessibility checks | **32 / 32** |

## Problems found on the phone (before) and what changed
| Before | After |
|---|---|
| Today card filled the whole first screen; no notes visible | Compact Today card (~200 px); two-column cards below |
| One card per row | Two columns like Keep, tighter type |
| Inline "Take a note…" box opened under the keyboard | Hidden on phones; **+** opens a create sheet |
| Search icon in tab bar, settings only in the drawer | Search + ⋯ (view, sort, archive, trash, import, settings) in the header |
| Menus were small floating popovers that could be cut off | All menus are bottom sheets; dialogs slide up from the bottom |
| Search palette floated mid-screen, showed keyboard shortcuts | Full screen with Cancel; no shortcut hints on touch |
| Editor header had 6 small buttons; title truncated | Back · title · ⋯ (+ Done while typing); options moved into ⋯ |
| No way to make headings/checklists without typing "/" | Formatting bar sitting on top of the keyboard |
| Word-count pill covered "Add a page inside" | Moved into ⋯ on phones |
| Drawer was see-through over the page | Solid, wider drawer that slides from the left |
| Duplicate "Pages"/"Tasks" titles (header + page) | Large titles that move into the header on scroll |
| Header height ignored the notch in Home Screen mode | Header grows by the safe-area inset |
| iOS zooms into any field under 16 px | Zoom on focus disabled on iOS (pinch-zoom still works) |
| Long-press on a card brought up iOS text tools | Suppressed; long-press selects |
| Body used 100% height (jumps with Safari's toolbar) | Uses the dynamic viewport height |
| Bug: a phone menu and the desktop sort menu opened together | Separate menus |
| Bug (latent): opening a note flashed the "locked" screen for a frame | Plain notes render immediately |

## Voice memo checks
- Recorder: full screen on phone, key can be added inline, start / pause / resume / save.
- Pipeline: transcription → minutes; title taken from the write-up; Summary/Decisions/Action items present; action items are checkboxes and appear in Tasks; audio kept; transcript folded under a toggle.
- Rate limit (429) waits and retries automatically.
- No key: the recording is saved and the page asks for a key. Rejected key: clear message.
- "Formalise with AI" on a typed note: rewritten, original kept in a toggle, user's title kept.
- An open editor can't save over a page Folio has just rewritten.

## Not covered here (please check on the real iPhone)
- Real WebKit: tests ran in Chromium with iPhone emulation, so Safari-only behaviour (keyboard toolbar position, microphone permission prompt, AAC recording, wake lock) needs a hands-on check.
- Real Groq responses (formatting of the minutes depends on the model).
