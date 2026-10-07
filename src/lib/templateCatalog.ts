// V6 built-in templates. Written as Markdown (turned into editor blocks when the gallery opens), so
// they read naturally here and get real tables, checklists and numbered steps in the note.
//
// In titles and text:
//   {{date}} {{date:short}} {{time}} {{weekday}} {{week}} {{month}} {{year}} {{monday}} {{tomorrow}} {{name}}
//     are filled in automatically when the note is created;
//   {{Anything else}} becomes a question in the "Fill in" step  ·  {{Due:date}} asks for a date
//   {{Severity:Low/Medium/High}} offers a choice. Anything left blank stays as a grey placeholder to type over.
import type { ColorKey, Paper } from '../types'

export interface CatalogEntry {
  id: string; name: string; emoji: string; category: string; description: string; title: string; md: string
  color?: ColorKey; cover?: string; paper?: Paper
  pages?: { title: string; icon?: string; md: string }[]
}

export const CATEGORIES = ['Meetings', 'Projects', 'Engineering', 'Planning', 'Research & writing', 'Personal', 'Journal'] as const

export const CATALOG: CatalogEntry[] = [
  // ---------------------------------------------------------------- Meetings
  {
    id: 'tpl-meeting', name: 'Meeting minutes', emoji: '🗓️', category: 'Meetings', cover: 'g:ocean',
    description: 'Agenda, discussion, decisions and owned action items — the decisions show up in your weekly review.',
    title: '{{Meeting title}} — {{date:short}}',
    md: `**Date:** {{date}} · {{time}}
**Attendees:** {{Attendees}}

## Agenda

1. {{First topic}}
2.

## Discussion

## Decisions

-

## Action items

- [ ] **Owner** — what needs doing

## Next meeting
`,
  },
  {
    id: 'tpl-one-on-one', name: '1:1 meeting', emoji: '🤝', category: 'Meetings', color: 'sage',
    description: 'A steady shape for one-to-ones: wins, blockers, feedback both ways and growth.',
    title: '1:1 — {{Person}} · {{date:short}}',
    md: `## How are things?

## Wins since last time

-

## Blockers

-

## Feedback

**For {{Person}}:**

**For {{name}}:**

## Growth & goals

## Action items

- [ ]
`,
  },
  {
    id: 'tpl-standup', name: 'Daily stand-up', emoji: '⏱️', category: 'Meetings',
    description: 'One row per person — yesterday, today, blockers — plus a list of blockers to chase.',
    title: 'Stand-up — {{weekday}} {{date:short}}',
    md: `| Person | Yesterday | Today | Blockers |
| --- | --- | --- | --- |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

## Blockers to follow up

- [ ]
`,
  },
  {
    id: 'tpl-client-call', name: 'Client call', emoji: '📞', category: 'Meetings', color: 'storm',
    description: 'Capture what the client wants, what you promised, and draft the follow-up while it’s fresh.',
    title: 'Call with {{Client}} — {{date:short}}',
    md: `| Client | Contacts | Purpose |
| --- | --- | --- |
| {{Client}} | {{Contacts}} | {{Purpose of the call}} |

## Their goals

-

## What we heard

-

## Questions they asked

-

## We committed to

- [ ]

## Follow-up email

Hi {{Contacts}},

Thanks for your time today. As discussed:

-

Best,
{{name}}
`,
  },
  {
    id: 'tpl-retro', name: 'Retrospective', emoji: '🔁', category: 'Meetings', color: 'dusk',
    description: 'What went well, what didn’t, and what the team will try next.',
    title: 'Retro — {{Sprint or project}}',
    md: `**Date:** {{date}} · **Facilitator:** {{name}}

## What went well

-

## What didn’t

-

## What we’ll try next

- [ ]

## Shout-outs

-
`,
  },

  // ---------------------------------------------------------------- Projects
  {
    id: 'tpl-project', name: 'Project brief', emoji: '🧭', category: 'Projects', cover: 'g:aurora',
    description: 'Problem, goal, scope, milestones and risks on one page.',
    title: '{{Project name}} — project brief',
    md: `| Owner | Start | Target date | Status |
| --- | --- | --- | --- |
| {{Owner}} | {{date:short}} | {{Target date:date}} | 🟡 Planning |

## Problem

## Goal

## How we’ll know it worked

-

## Scope

**In:**

-

**Out:**

-

## Milestones

| Milestone | Date | Status |
| --- | --- | --- |
|  |  |  |
|  |  |  |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
|  |  |  |

## Links
`,
  },
  {
    id: 'tpl-project-hub', name: 'Project hub', emoji: '🗂️', category: 'Projects', cover: 'g:forest',
    description: 'A project home with four pages inside: brief, meeting notes, decision log and tasks.',
    title: '{{Project name}}',
    md: `**Owner:** {{Owner}} · **Started:** {{date:short}}

The home for everything about {{Project name}}. Open the pages below, or add your own.

## Status

🟡 Getting started

## Key links

-
`,
    pages: [
      { title: 'Brief', icon: '🧭', md: `## Problem\n\n## Goal\n\n## Scope\n\n**In:**\n\n-\n\n**Out:**\n\n-\n\n## Milestones\n\n| Milestone | Date | Status |\n| --- | --- | --- |\n|  |  |  |\n` },
      { title: 'Meeting notes', icon: '🗓️', md: `Add a page here for each meeting.\n\n## {{date:short}}\n\n**Attendees:**\n\n## Decisions\n\n-\n\n## Action items\n\n- [ ]\n` },
      { title: 'Decision log', icon: '⚖️', md: `| Date | Decision | Why | Who |\n| --- | --- | --- | --- |\n| {{date:short}} |  |  |  |\n` },
      { title: 'Tasks', icon: '✅', md: `## Now\n\n- [ ]\n\n## Next\n\n- [ ]\n\n## Later\n\n- [ ]\n` },
    ],
  },
  {
    id: 'tpl-status', name: 'Weekly status report', emoji: '📊', category: 'Projects',
    description: 'Overall health, progress by workstream, risks and asks — ready to send.',
    title: '{{Project}} status — week {{week}}',
    md: `**Week of {{monday}}** · **Prepared by:** {{name}}

**Overall:** {{Overall status:🟢 On track/🟡 At risk/🔴 Off track}}

## Highlights

-

## Progress

| Workstream | Status | Notes |
| --- | --- | --- |
|  | 🟢 |  |
|  | 🟡 |  |

## Risks & issues

-

## Next week

- [ ]

## Asks

-
`,
  },
  {
    id: 'tpl-decision', name: 'Decision record', emoji: '⚖️', category: 'Projects', color: 'clay',
    description: 'Context, the options you weighed, the decision and its consequences — so nobody asks “why?” again.',
    title: 'Decision: {{Decision}}',
    md: `| Status | Date | Decided by |
| --- | --- | --- |
| {{Status:Proposed/Accepted/Superseded}} | {{date:short}} | {{name}} |

## Context

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
|  |  |  |
|  |  |  |

## Decision

## Consequences

-
`,
  },
  {
    id: 'tpl-sop', name: 'SOP / procedure', emoji: '📘', category: 'Projects', cover: 'g:slate',
    description: 'A standard operating procedure with roles, numbered steps, checks and a revision history.',
    title: 'SOP — {{Procedure name}}',
    md: `| Version | Owner | Last reviewed |
| --- | --- | --- |
| 1.0 | {{Owner}} | {{date:short}} |

## Purpose

## Scope

## Roles

| Role | Responsible for |
| --- | --- |
|  |  |

## Before you start

- [ ]

## Steps

1.
2.
3.

## Checks

- [ ]

## Troubleshooting

| Problem | What to do |
| --- | --- |
|  |  |

## Revision history

| Version | Date | Change | By |
| --- | --- | --- | --- |
| 1.0 | {{date:short}} | First version | {{name}} |
`,
  },

  // ---------------------------------------------------------------- Engineering
  {
    id: 'tpl-bug', name: 'Bug report', emoji: '🐞', category: 'Engineering', color: 'coral',
    description: 'Steps to reproduce, expected vs actual, environment and a fix checklist.',
    title: 'Bug: {{Bug summary}}',
    md: `| Severity | Found | Reporter |
| --- | --- | --- |
| {{Severity:Low/Medium/High/Critical}} | {{date:short}} | {{name}} |

## What happened

## Steps to reproduce

1.
2.
3.

## Expected

## Actual

## Environment

| Version | Device / OS | Browser |
| --- | --- | --- |
|  |  |  |

## Fix checklist

- [ ] Reproduce
- [ ] Find the cause
- [ ] Fix
- [ ] Add a test
- [ ] Verify
`,
  },
  {
    id: 'tpl-spec', name: 'Feature spec', emoji: '🧩', category: 'Engineering', cover: 'g:mesh',
    description: 'Problem, users, prioritised requirements, open questions and rollout.',
    title: '{{Feature name}} — spec',
    md: `**Author:** {{name}} · **Date:** {{date:short}} · **Status:** Draft

## Summary

## Problem

## Users & use cases

-

## Requirements

| # | Requirement | Priority |
| --- | --- | --- |
| 1 |  | Must |
| 2 |  | Should |
| 3 |  | Could |

## Out of scope

-

## Design notes

## Open questions

- [ ]

## Rollout

1.
`,
  },
  {
    id: 'tpl-incident', name: 'Incident review', emoji: '🚨', category: 'Engineering', color: 'peach',
    description: 'A blameless post-incident review: impact, timeline, root cause and follow-ups.',
    title: 'Incident review — {{Incident}}',
    md: `| Date | Duration | Severity | Lead |
| --- | --- | --- | --- |
| {{date:short}} |  | {{Severity:SEV1/SEV2/SEV3}} | {{name}} |

## Summary

## Impact

## Timeline

| Time | What happened |
| --- | --- |
|  |  |
|  |  |

## Root cause

## What went well

-

## What we’ll improve

-

## Action items

- [ ]
`,
  },
  {
    id: 'tpl-release', name: 'Release checklist', emoji: '🚀', category: 'Engineering',
    description: 'Before, during and after a release — with a table of what’s going out.',
    title: 'Release {{Version}}',
    md: `**Planned:** {{Release date:date}} · **Release lead:** {{name}}

## What’s going out

| Change | Owner | Notes |
| --- | --- | --- |
|  |  |  |

## Before

- [ ] Tests pass
- [ ] Changelog written
- [ ] Version bumped
- [ ] Backup / rollback plan ready

## Release

- [ ] Deploy
- [ ] Smoke test

## After

- [ ] Watch errors for an hour
- [ ] Tell the team
`,
  },

  // ---------------------------------------------------------------- Planning
  {
    id: 'tpl-week', name: 'Weekly plan', emoji: '📅', category: 'Planning', paper: 'dots',
    description: 'Three priorities, the week at a glance and a short reflection on Friday.',
    title: 'Week {{week}} — plan',
    md: `**Week of {{monday}}**

## Top 3 this week

- [ ]
- [ ]
- [ ]

## The week

| Mon | Tue | Wed | Thu | Fri |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Meetings

-

## Notes

## Friday reflection

**Done:**

**Carry over:**
`,
  },
  {
    id: 'tpl-goals', name: 'Goals & key results', emoji: '🎯', category: 'Planning', cover: 'g:solar',
    description: 'Objectives with measurable key results and a place to track progress.',
    title: 'Goals — {{Period:This quarter/This year/This month}}',
    md: `## Objective 1:

| Key result | Target | Now | Status |
| --- | --- | --- | --- |
|  |  |  | 🟡 |
|  |  |  | 🟡 |

## Objective 2:

| Key result | Target | Now | Status |
| --- | --- | --- | --- |
|  |  |  | 🟡 |

## Not doing (on purpose)

-

## Check-ins

- {{date:short}}:
`,
  },
  {
    id: 'tpl-trip', name: 'Trip plan', emoji: '✈️', category: 'Planning', cover: 'g:dawn',
    description: 'Itinerary, bookings, packing list and budget for a trip.',
    title: 'Trip to {{Destination}}',
    md: `| Dates | Travellers | Budget |
| --- | --- | --- |
| {{Leaving:date}} → | {{name}} |  |

## Itinerary

| Day | Plan | Stay |
| --- | --- | --- |
| 1 |  |  |
| 2 |  |  |
| 3 |  |  |

## Bookings

| What | Reference | Cost |
| --- | --- | --- |
| Travel |  |  |
| Stay |  |  |

## Packing

- [ ] Documents
- [ ] Chargers
- [ ] Medicines
- [ ]

## Ideas

-
`,
  },
  {
    id: 'tpl-checklist', name: 'Checklist', emoji: '✅', category: 'Planning',
    description: 'Just a list of boxes to tick.',
    title: '{{What’s this list for?}}',
    md: `- [ ]
- [ ]
- [ ]
`,
  },

  // ---------------------------------------------------------------- Research & writing
  {
    id: 'tpl-research', name: 'Research brief', emoji: '🔎', category: 'Research & writing', cover: 'g:ocean',
    description: 'The question, key findings, evidence with confidence, and a recommendation.',
    title: '{{Topic}} — research brief',
    md: `**Prepared by:** {{name}} · {{date}}

## Question

## Key findings

1.
2.
3.

## Evidence

| Source | Finding | Confidence |
| --- | --- | --- |
|  |  | High |
|  |  | Medium |

## Open questions

-

## Recommendation

## Sources

1.
`,
  },
  {
    id: 'tpl-reading', name: 'Reading notes', emoji: '📚', category: 'Research & writing', color: 'sand',
    description: 'The big idea, notes and quotes from a book or paper — and how you’ll use it.',
    title: '{{Book or paper}}',
    md: `| Author | Started | Rating |
| --- | --- | --- |
| {{Author}} | {{date:short}} | ☆☆☆☆☆ |

## The big idea

## Notes

-

## Quotes

>

## How I’ll use this

-
`,
  },
  {
    id: 'tpl-article', name: 'Article draft', emoji: '✍️', category: 'Research & writing', paper: 'lines',
    description: 'Hook, outline, draft and an editing checklist for a post or article.',
    title: '{{Working title}}',
    md: `**For:** {{Audience}} · **Length:** ~800 words

## Hook

## Outline

1.
2.
3.

## Draft

## Before publishing

- [ ] Read it aloud
- [ ] Cut 10%
- [ ] Check facts and links
- [ ] Title and summary
`,
  },

  // ---------------------------------------------------------------- Personal
  {
    id: 'tpl-idea', name: 'Idea', emoji: '💡', category: 'Personal', color: 'sand',
    description: 'Get an idea down: what it is, why it matters, the next small step.',
    title: '{{The idea in a few words}}',
    md: `## The idea

## Why it matters

## Next step

- [ ]
`,
  },
  {
    id: 'tpl-recipe', name: 'Recipe', emoji: '🍲', category: 'Personal', color: 'peach',
    description: 'Ingredients in a table, numbered steps and notes for next time.',
    title: '{{Dish}}',
    md: `| Serves | Prep | Cook |
| --- | --- | --- |
| 4 |  |  |

## Ingredients

| Amount | Ingredient |
| --- | --- |
|  |  |
|  |  |

## Steps

1.
2.
3.

## Notes for next time
`,
  },

  // ---------------------------------------------------------------- Journal
  {
    id: 'tpl-daily', name: 'Daily note', emoji: '☀️', category: 'Journal',
    description: 'Today’s focus and notes. Folio uses this for “Today” unless you choose another.',
    title: '',
    md: `### Focus

- [ ]
- [ ]
- [ ]

### Notes
`,
  },
  {
    id: 'tpl-journal', name: 'Morning pages', emoji: '🌅', category: 'Journal', color: 'blossom', paper: 'lines',
    description: 'Gratitude, an intention for the day and room to think.',
    title: '{{weekday}}, {{date:short}}',
    md: `## Grateful for

1.
2.
3.

## Today I want to

## On my mind
`,
  },
  {
    id: 'tpl-reflection', name: 'Weekly reflection', emoji: '🪞', category: 'Journal', color: 'dusk',
    description: 'Look back on the week: highs, lows, lessons and what to change.',
    title: 'Week {{week}} — reflection',
    md: `## Highs

-

## Lows

-

## What I learned

## Next week I’ll

- [ ]
`,
  },
]
