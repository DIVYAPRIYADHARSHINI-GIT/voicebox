# VoiceBox

**Speak up. See it through.**

A professional office feedback system. Employees share praise, concerns and ideas — named or anonymous — and can
follow exactly what happens to them. Managers triage, respond and report in their own separate portal.

Everything runs on free tiers with **no database, no API keys and no paid services**. All data lives in the browser.

## Live demo

- **Live site:** https://voicebox-lemon.vercel.app
- **Repository:** https://github.com/DIVYAPRIYADHARSHINI-GIT/voicebox

Sign in with any demo account below. The app opens with sample data on first launch.

## Purpose

Most feedback tools stop at collection. VoiceBox is built around the part that actually changes behaviour: showing
people what happened to what they said. Every item has a visible status, a public response, a tracking code for
anonymous submissions, and a "You said, we did" wall of resolved items.

## Features

### Employee portal (`/app`)

| Feature | What it does |
| --- | --- |
| **Submit feedback** | Title, description, type (Praise / Concern / Suggestion), category, department, self-rated urgency, and an "Submit anonymously" toggle explained in plain language. Live character counters, validation, duplicate detection, auto-estimated sentiment. |
| **My feedback** | Named submissions with status, public responses and the full status history. Anonymous items never appear here — not even your own. |
| **Ideas board** | Public suggestions, one upvote per person (toggle), simple comments, sort by top or newest. |
| **You said, we did** | A wall of resolved items with the response and the date it closed. |
| **Pulse survey** | Four short weekly questions: three 1–5 scales plus a 0–10 eNPS question, and an optional comment. |
| **Track by code** | Enter a 10-character code to see status and public responses without signing in. |

### Manager portal (`/manager`)

| Feature | What it does |
| --- | --- |
| **Feedback Inbox** | Sticky-header table with unread indicators, search, filters, sorting and bulk actions. "Needs your attention" strip for new, overdue, due-in-3-days and assigned-to-me. |
| **Detail panel** | Right-side drawer on desktop, full page on mobile: full text, status controls, priority, owner, due date, tags, quick reply templates, the public response box, internal notes and the status history timeline. |
| **Board** | Kanban columns by status with the same filters. |
| **Dashboard** | KPI cards (total, open, resolved this month, average first response, average resolution, overdue, eNPS) and hand-written SVG charts: volume over time, by category, status donut, sentiment trend, resolution-time trend, top 5 upvoted ideas, department comparison, top themes. Date range: 7 / 30 / 90 days / all. |
| **Pulse results** | Overall and per-department scores, weekly trend, eNPS and comment themes — all gated by the anonymity threshold. |
| **Reports** | One-click PDF summary (server route), CSV export of feedback and pulse results, JSON backup/import, "Start fresh". |
| **Accounts & Settings** | Admin/HR only: create, deactivate and reset accounts; edit company name, departments, categories, SLA days, anonymity threshold, pulse questions, sentiment keywords and theme. |

### Workflow

`New → Under review → In progress → Resolved`, or `Declined` (which requires a written reason). Every change is
recorded in a status history timeline with the actor's role and the time. Priority drives the SLA: each priority has
response and resolution targets in days, editable in Settings, and open items past the target get an **Overdue** badge
and an overdue filter.

## Roles

| Role | Sees | Can do |
| --- | --- | --- |
| **Employee** | Their own named feedback, the public ideas board, the "You said, we did" wall, pulse survey | Submit, track, upvote, comment, answer the pulse |
| **Manager** | Their **own department only**, never confidential reports | Everything in triage: status, priority, owner, due date, tags, internal notes, public responses, reports |
| **Admin/HR** | **Every department**, including confidential reports | Everything a manager can, plus accounts, settings and exports |

There is no role switcher. Each account has one role, and the two portals have separate sign-in pages: `/login` for
employees and `/manager/login` for Manager and Admin/HR.

## Demo accounts

Shown in a collapsible "Demo accounts" card on each login page, marked **Demo only**.

| Role | Email | Password |
| --- | --- | --- |
| Employee | `employee@northwind.example` | `Employee@123` |
| Manager (Design) | `manager@northwind.example` | `Manager@123` |
| Admin/HR | `hr@northwind.example` | `Admin@123` |

19 accounts in total across five departments: 14 employees, 4 more managers (Engineering, Client Services, Operations,
People & Culture) and HR. The additional accounts follow the same password pattern — for example
`elena.d@northwind.example` / `Manager@123` (Engineering Manager, useful for checking department scoping) and
`tomas.l@northwind.example` / `Employee@123`.

All people, names, departments and content are fictional. No real company, person or incident is referenced.

## How anonymity works, and its limits

When feedback is submitted anonymously (from the portal toggle or the public `/anonymous` page), VoiceBox stores:

- the title, description, type, category, urgency and optionally a department;
- a random 10-character tracking code using an alphabet with no `0`, `O`, `1`, `I` or `L`;
- **no name, no email, no account id** — those fields are never written for an anonymous item.

Consequences, by design:

- The item does **not** appear under "My feedback", even for the person who submitted it.
- The tracking code is the only way to follow it, and **it cannot be recovered** — nothing links the code to a person.
- `/track` resolves a code without signing in and shows status, public responses and the history. Internal notes are
  never shown there.
- The UI, the CSV export and the PDF report all show `Anonymous`. The rule is enforced again in the store, the export
  code and the server-side validator, not only in the interface.

**Limits you should know about in demo mode:**

- Data is stored unencrypted in the browser's local storage. Anyone with access to that browser profile can read it
  with developer tools, including anonymous items.
- Content can still identify someone. If a report describes a situation only one person could be in, the text itself
  is identifying — no system can fix that.
- A production deployment needs a server, a database with access controls, audit logging and key management.

### Pulse anonymity

Pulse answers carry the department and nothing else. The "already responded this week" marker is stored in a
**separate list** keyed by account + week, so an answer can never be traced back to a person. Results for any group —
department, week, filter combination — with fewer than **5 responses** (editable in Settings) are replaced with
_"Not enough responses to protect anonymity"_ in the UI, the PDF and the CSV.

### Confidential reports

The "Confidential report" category reaches the Admin/HR role **inside this app and nothing more**. Before submitting,
the form shows a notice that it is not a replacement for emergency services, official HR or legal channels, or company
policy, and requires a confirmation checkbox. These reports are visible to Admin/HR only, never public, not upvotable,
excluded from manager views, and excluded from CSV export unless an Admin explicitly includes them and confirms a
warning dialog. They carry a **Sensitive** badge and a warning before opening.

## Demo authentication is not secure

Sign-in is simulated entirely in the browser. Passwords are hashed with Web Crypto **PBKDF2-SHA256** (120,000
iterations, per-user random salt) before being written to local storage, so plain-text passwords are never stored.
That is still **not secure authentication**:

- there is no server to verify anything;
- the hash is readable by anyone with access to the browser profile;
- the 5-attempt / 5-minute lockout, the 8-hour session expiry and the 15-minute inactivity sign-out are browser-side
  conveniences, not security controls.

Production use requires server-side authentication, session management and authorisation. This is stated on both login
pages and on the About/Privacy page as well as here.

## Free-only design

| Constraint | How it is met |
| --- | --- |
| No database | All data is one JSON document in `localStorage`, behind the `FeedbackStore` interface |
| No API keys | No third-party services at all |
| No paid tiers | Vercel Hobby; two tiny serverless functions |
| Server routes only where required | `/api/report` (PDF) and `/api/csv` (CSV); they receive data from the browser, render the file and keep nothing. `/api/health` is a liveness check. |
| No heavy chart library | Every chart is hand-written SVG |
| Data portability | JSON backup export/import, since data is per-browser |

All data access goes through the `FeedbackStore` interface (`src/lib/core/store.ts`) with exactly one implementation,
`LocalFeedbackStore`. A hosted database could implement the same interface later without touching any page code.
**No database is implemented now, on purpose.** Every storage access is wrapped in try/catch and degrades gracefully
when storage is full or unavailable (an in-memory fallback keeps the tab working, and the user is told).

### What browser-only storage means for a multi-device demo

`localStorage` is scoped to one browser on one device, so this is a **single-device demo**:

- An employee submitting on their phone and a manager signing in on a laptop have **two separate datasets**. A ticket
  raised on one device does **not** appear in the manager portal on another.
- To see the full employee -> manager -> response loop, use **one browser** and switch accounts (sign out, then sign
  in on the other portal). The demo accounts share that browser's dataset.
- `JSON backup export/import` in Settings is the supported way to move data between browsers.
- A tracking code only resolves in the browser that created the item, because the item itself lives there.

This is a deliberate consequence of the no-database constraint, not a bug. Making feedback visible across devices
requires shared server-side storage, which would mean adding a database.

## Tech stack

- **SvelteKit 2** + **Svelte 5** (runes) + **TypeScript**
- `@sveltejs/adapter-vercel` (runtime `nodejs22.x`)
- Inter + JetBrains Mono via `@fontsource` (tracking codes only use the monospace face)
- Hand-written SVG charts, original SVG icon set, original line-art login illustrations
- Dependency-free PDF writer (Helvetica core fonts with real AFM widths, wrapped tables with repeated headers, page
  numbers) — no PDF library, so the serverless function stays tiny
- `node --test` for unit tests; a dependency-free Chrome DevTools Protocol driver for the end-to-end suite

### Unit-tested business rules

The rules live in separate modules under `src/lib/core/` and `src/lib/report/`, with **122 unit tests**:

password hashing and verification · lockout and session expiry · route guards by role · status transitions · SLA and
overdue calculation · anonymity threshold · tracking-code generation and lookup · eNPS calculation · sentiment
estimation · duplicate detection · department scoping · confidential-report visibility · local-time-zone handling ·
filtering, sorting and aggregation · PDF/CSV generation and the anonymity guarantees inside generated files.

### Performance

The inbox renders at most 100 rows at a time with a "show more" control, and the board caps cards per column. Verified
with a 520-item dataset: the inbox loads in well under a second and every page stays responsive (measured with a
heartbeat in the e2e suite). Reactive effects never write the state they depend on, so there are no update loops.

## Setup

Requires Node.js 22.12 or newer.

```bash
cd voicebox
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # production build
npm run preview      # serve the production build
npm run check        # svelte-check (TypeScript + a11y)
npm test             # 122 unit tests
npm run e2e          # end-to-end suite (needs a running preview server)
```

Running the end-to-end suite:

```bash
npm run build
npx vite preview --port 4319 --strictPort &
caffeinate -dims env BASE_URL=http://localhost:4319 node tests/e2e/smoke.mjs
```

It uses the locally installed Google Chrome in headless mode (no npm dependencies), with short timeouts, a freeze
heartbeat and a global watchdog so it fails fast instead of hanging. Screenshots are written to
`tests/e2e/output/local/`.

## Testing status

- **122 unit tests** pass (`npm test`)
- **230 end-to-end checks** pass against the production build, covering: employee sign-in success and failure, lockout
  after 5 failed attempts, submit named feedback, submit anonymous feedback and copy the code, track by code, manager
  sign-in, triage/assign/respond/decline, the employee seeing the response, upvoting an idea, answering a pulse survey,
  the anonymity threshold with too few responses, confidential reports visible only to Admin, the dashboard, PDF and
  CSV export, JSON backup and import, route guards in both directions, session expiry, inactivity sign-out, manager
  department scoping, anonymous items never showing author data in the UI/CSV/PDF, desktop + 360px mobile + dark mode,
  accessibility basics, and a 520-item load test
- `svelte-check`: 0 errors, 0 warnings
- A sample generated report is committed at [`docs/sample-report.pdf`](docs/sample-report.pdf)

## Sample data

First launch loads a fictional company, **Northwind Studio**: 5 departments, 19 demo accounts, ~44 feedback items
across every category, status and priority (including several overdue and several anonymous), 8 weeks of pulse
responses, a set of "You said, we did" items and 2 sample confidential reports. Admin/HR can reload it from
**Settings → Load sample data**.

## Design

Enterprise-grade and calm: off-white canvas (`#F7F8FA`), white surfaces with 1px borders and very soft shadows, deep
navy (`#14213D`) for sidebars and headings, teal (`#0F766E`) as the primary action colour, amber (`#B45309`) for
warnings, green (`#15803D`) for Resolved, red (`#B91C1C`) for Critical and Overdue. Inter throughout with tabular
numbers in tables and charts, monospace only for tracking codes, spacing on an 8px grid. Dark mode uses charcoal
surfaces with the same accents.

No emoji, no decorative gradients, no cartoon illustrations, no stock art — every icon and illustration is original
SVG drawn for this project.

**Accessibility:** WCAG AA contrast, 44px touch targets on coarse pointers, keyboard navigation with visible focus
states, aria labels, status conveyed by text labels as well as colour, a skip link, and `prefers-reduced-motion`
respected. Responsive from 360px to wide desktop, with a bottom tab bar for the employee portal on mobile and a
collapsible sidebar for the manager portal.

## Project structure

```
voicebox/
├── src/
│   ├── lib/
│   │   ├── core/           # business rules (unit tested, no browser deps)
│   │   │   ├── types.ts        # domain model
│   │   │   ├── rules.ts        # lockout, sessions, guards, SLA, anonymity, sentiment...
│   │   │   ├── store.ts        # FeedbackStore interface + localStorage implementation
│   │   │   ├── stats.ts        # dashboard + pulse aggregation
│   │   │   ├── filters.ts      # inbox/board filtering and sorting
│   │   │   ├── time.ts         # local-time-zone helpers
│   │   │   ├── password.ts     # PBKDF2 hashing
│   │   │   ├── defaults.ts     # default settings
│   │   │   └── seed.ts         # Northwind Studio sample data
│   │   ├── report/         # PDF writer, CSV writer, payload validation
│   │   ├── components/     # UI components (icons, charts, drawer, dialogs...)
│   │   ├── app.svelte.ts   # central app state (Svelte 5 runes)
│   │   └── exports.ts      # builds export payloads, applies anonymity rules
│   └── routes/
│       ├── login/              # employee sign-in
│       ├── manager/login/      # manager portal sign-in
│       ├── app/                # employee portal
│       ├── manager/            # manager portal
│       ├── anonymous/          # public anonymous submission
│       ├── track/              # public tracking by code
│       ├── about/              # about, privacy and demo-mode limits
│       └── api/                # report (PDF), csv, health
├── tests/
│   ├── unit/               # 122 node --test unit tests
│   └── e2e/                # headless-Chrome suite (230 checks)
└── docs/sample-report.pdf
```

## License

MIT
