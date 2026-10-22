# VoiceBox

**Speak up. See it through.**

A professional office feedback system. Employees share praise, concerns and ideas — named or anonymous — and can
follow exactly what happens to them. Managers triage, respond and report in their own separate portal.

Runs on free tiers (Vercel Hobby + Neon Postgres free plan) with no paid services and no API keys to manage.
Data is **shared across every device**: raise a ticket on a phone and it appears in the manager portal on a laptop.

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

- This is a public demo with published sign-in details, so anyone can sign in as Admin/HR and read everything,
  including items submitted anonymously. Do not put real feedback in it.
- Content can still identify someone. If a report describes a situation only one person could be in, the text itself
  is identifying — no system can fix that.
- A production deployment needs a server, a database with access controls, audit logging and key management.

### Pulse anonymity

Pulse answers carry the department and nothing else. The "already responded this week" marker is stored in a
**separate table** keyed by account + week, with no reference to the answer row, so an answer can never be traced
back to a person - not even with full database access. Results for any group —
department, week, filter combination — with fewer than **5 responses** (editable in Settings) are replaced with
_"Not enough responses to protect anonymity"_ in the UI, the PDF and the CSV.

### Confidential reports

The "Confidential report" category reaches the Admin/HR role **inside this app and nothing more**. Before submitting,
the form shows a notice that it is not a replacement for emergency services, official HR or legal channels, or company
policy, and requires a confirmation checkbox. These reports are visible to Admin/HR only, never public, not upvotable,
excluded from manager views, and excluded from CSV export unless an Admin explicitly includes them and confirms a
warning dialog. They carry a **Sensitive** badge and a warning before opening.

## Authentication

Passwords are hashed with **PBKDF2-SHA256** (120,000 iterations, per-user random salt) and only the hash is stored.
The session is a signed, HttpOnly cookie the browser cannot read or forge, and the lockout, session expiry and
inactivity sign-out are all enforced server-side.

It is still a **demo**, not a hardened deployment: the accounts below are public, there is no email verification or
password-reset flow, no rate limiting beyond the lockout, and no audit log. This is stated on the login pages and the
About page as well as here.

## Shared data, and why it works this way

The first version of VoiceBox stored everything in `localStorage`. That satisfied a "no database" constraint, but it
made the product wrong: `localStorage` is per-browser, so an employee submitting on their phone and a manager signing
in on a laptop had two unrelated datasets, and tickets never reached the manager portal.

A feedback system has to be shared, so the storage layer is now a real database:

| Constraint | How it is met |
| --- | --- |
| Free tier only | Vercel Hobby + Neon Postgres free plan |
| No API keys to manage | The database URL is injected by the Vercel integration |
| Cross-device | One Postgres database behind SvelteKit server routes |
| Access control | Scoping is a SQL `WHERE` clause, not a UI filter |
| Data portability | Admin/HR can export a JSON backup and re-import it |

### An intermediate version got this wrong

Before Postgres, the shared data lived in a single JSON blob in object storage. It worked, but every new ticket
rewrote the entire ~500 KB document. That burned through the provider's monthly write allowance and got the store
suspended mid-test. Object storage is the wrong tool for a write-heavy record store; a row per ticket is the right
one. The `rev`-counter and in-process write lock that version needed are gone, replaced by ordinary SQL.

### Security consequences of sharing

Once the data is shared, the browser can no longer be trusted to decide who sees what. These moved to the server:

- **Sessions** - signed, HttpOnly cookies (HMAC-SHA256). The browser cannot read or forge one, and the account is
  re-read on every request, so deactivating an account takes effect immediately.
- **Password verification** - PBKDF2-SHA256 (120,000 iterations, per-user salt), checked server-side.
- **The 5-attempt lockout** - counted in the database per email, so clearing browser storage cannot reset it.
  Admin/HR can release a lockout from Settings, which real deployments need.
- **Department scoping** - a manager's feed query filters by department and excludes confidential reports, so
  restricted rows are never sent to the client at all. Per-item actions re-check access, so guessing an id fails
  with `403`.
- **Pulse anonymity** - answers carry the department only, and the "already answered" marker lives in a separate
  table with no reference to the answer. Even full database access cannot link a person to their responses.

## Tech stack

- **SvelteKit 2** + **Svelte 5** (runes) + **TypeScript**
- `@sveltejs/adapter-vercel` (runtime `nodejs22.x`)
- **Neon Postgres** (free plan) via `@neondatabase/serverless`, with the schema created on first use
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

Requires Node.js 22.12 or newer and a Postgres connection string.

```bash
cd voicebox
npm install

# Provision the free Neon database and pull its credentials (one-off):
vercel link
vercel integration add neon --name voicebox-db --plan free_v3 --non-interactive
vercel env pull .env.local

npm run dev          # http://localhost:5173
```

The app needs two environment variables, both written to `.env.local` by the commands above:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string (the schema is created on first use) |
| `VOICEBOX_SESSION_SECRET` | HMAC key for signing session cookies |

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
caffeinate -dims env BASE_URL=http://localhost:4319 node tests/e2e/cross-device.mjs   # the cross-device suite
caffeinate -dims env BASE_URL=http://localhost:4319 node tests/e2e/smoke.mjs          # the full feature suite
```

Both suites call `tests/e2e/reset-store.mjs` first. Because the lockout counter is now shared server-side, a previous
run's failed logins would otherwise leave demo accounts locked for the next run.

It uses the locally installed Google Chrome in headless mode (no npm dependencies), with short timeouts, a freeze
heartbeat and a global watchdog so it fails fast instead of hanging. Screenshots are written to
`tests/e2e/output/local/`.

## Testing status

- **133 unit tests** pass (`npm test`), including the signed-session and access-control layer
- **33 cross-device checks** pass (`tests/e2e/cross-device.mjs`): each "device" is a separate browser context with
  its own cookies and localStorage, proving a ticket raised on one device reaches the manager portal on another,
  that the response comes back, that a tracking code resolves from a signed-out device, that another department's
  manager sees none of it, and that six simultaneous submissions are all persisted
- **End-to-end checks** pass against the production build, covering: employee sign-in success and failure, lockout
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
│   │   ├── server/         # server-only: schema, queries, sessions, access control
│   │   │   ├── schema.ts       # Postgres tables and indexes
│   │   │   ├── db.ts           # every query (scoping lives here)
│   │   │   ├── auth.ts         # signed session cookies + per-item access checks
│   │   │   └── api.ts          # route guards, lockout, first-run seeding
│   │   ├── api.ts          # typed client for the server routes
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
