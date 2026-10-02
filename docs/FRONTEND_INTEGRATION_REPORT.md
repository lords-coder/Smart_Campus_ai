# SmartCampus — Frontend Integration Report

How the visual prototype at `C:\test\tt\frontend` was integrated into the
SmartCampus application, and the verified state of the result.

---

## 1. Source frontend

`C:\test\tt\frontend` — package name `smartcampus-ai-command-center`.

| Aspect | Finding |
| ------ | ------- |
| Framework | Next.js **16.3.8**, App Router |
| React | 19.3.0 |
| Language | TypeScript (`strict: true`) |
| Styling | **Tailwind 3.4.19** (v3 directives) + a 2,102-line hand-written `globals.css` |
| UI libraries | `lucide-react` only — no component library |
| Animation library | none (CSS transitions only, no `@keyframes`) |
| State management | React local state only |
| API layer | **none** — no client, no fetch, no env config |
| Authentication | **none** — no auth context, no guards, no token handling |
| Routing | one route: `app/page.tsx` |
| Source files | **11** (≈52 KB), of which `globals.css` is 38 KB |
| Data | none — every panel is a labelled placeholder |

### What it actually is

A **visual prototype of a single "Student Command Center" page**. The design
language is substantial and worth keeping:

- a dark navy palette with aqua / blue / violet accents, defined as CSS custom
  properties on `:root`;
- 132 BEM-style class names (`app-shell`, `sidebar`, `nav-link`, `topbar`,
  `summary-card`, `surface-card`, `insight-orbit`, `recommendation-card`, …);
- component furniture: `AppShell` (collapsible sidebar + topbar + footer),
  `BrandMark`, `SectionHeading`, `DataSummaryCard`, `ConnectionState`.

Every data surface was a placeholder, and the prototype said so honestly:
"Not connected", "Unavailable", "Prototype preview", "Live data not connected".

### What it did **not** contain

No API integration, no auth, no role handling, no routing for any of the
fifteen SmartCampus phases, no form handling, no state management. Nothing that
could replace the existing application.

---

## 2. Existing SmartCampus frontend

`C:\test\tt\smartcampus\frontend` at the time of integration.

| Aspect | Finding |
| ------ | ------- |
| Framework | Next.js 16.3.7, App Router, `src/` directory |
| React | 19.2.8 |
| Styling | **Tailwind 4** + shadcn tokens, light theme |
| UI libraries | `shadcn`, `radix-ui`, `sonner`, `next-themes`, `lucide-react` |
| Auth | `AuthProvider` + `AuthGuard` + `RoleGuard`, JWT in `localStorage` |
| API layer | `src/lib/api.ts` — single client, envelope unwrapping, 401 event |
| Routes | **39** across 15 phases |
| Tests | 15 E2E suites (647 assertions), all green |

---

## 3. Integration decision: merge, not replace

Replacing the working application with the prototype would have deleted fifteen
phases of functionality to gain one page with no data. The prototype's value is
its **design system**, not its logic. So the integration takes the design and
gives it the real application to talk to.

| Decision | Rationale |
| -------- | --------- |
| Keep the SmartCampus frontend as the host | It holds the auth, guards, API client and 703 verified assertions; the backend is frozen and must not be rewritten to suit a frontend |
| Adopt the prototype's design as a **scoped surface** | Its dark palette and resets are document-level; applied globally they would reset the whole app |
| Do **not** convert the other 14 phases | The brief defers the large redesign; restyling every phase now would be that redesign |
| Keep the existing shell and chrome | Same reason, and it keeps the host's role-aware navigation intact |
| Replace every placeholder with a real API call | The prototype's "Not connected" states were the thing to eliminate |

---

## 4. The design layer

`scripts/scope-command-center-css.mjs` transforms the prototype stylesheet into
`src/styles/command-center.css`.

The prototype targets `html`, `body`, `*`, `button`, `input` and declares its
palette on `:root`. Imported verbatim it would reset the entire application. The
codemod therefore makes exactly two changes and nothing else:

1. drops the three Tailwind **v3** directives (the host is on v4 and imports its
   own layers);
2. re-anchors every document-level selector onto `.command-center-surface`.

Everything else is byte-for-byte the prototype's CSS, so the visual design is
unchanged. The script self-checks and reports:

```
bytes    39623 (prototype 38876)
scoped   3 roots, 13 descendant selectors
@tailwind remaining: false
leaked   none
```

An earlier attempt to reparse and rewrite all 855 selectors was abandoned: a
brace-scanner cannot distinguish declaration blocks from nested rules, and it
corrupted the output. The targeted approach is smaller, verifiable, and keeps
the design intact.

`src/styles/command-center-overrides.css` styles only what the integration
introduced (a real class list, cards that link instead of reporting
"unavailable", the quick-action grid). It is kept separate so regenerating the
prototype CSS never discards it.

---

## 5. Components

### Reused from the prototype (adapted)

| Prototype component | Destination | Adaptation |
| ------------------- | ----------- | ----------- |
| `components/dashboard/data-summary-card.tsx` | `src/components/command-center/data-summary-card.tsx` | Was hard-coded to "Not connected" and an em dash. Now takes a real `value` and `status`, and colour-codes degraded reads. |
| `components/ui/section-heading.tsx` | `src/components/command-center/section-heading.tsx` | Unchanged apart from the import path. |
| `components/dashboard/connection-state.tsx` | `src/components/command-center/connection-state.tsx` | Now used only for genuine "no data source" moments, never as a stand-in for unconnected APIs. |
| `components/brand-mark.tsx` | `src/components/command-center/brand-mark.tsx` | Unchanged; placed in the Command Center hero, where the design tokens it inherits are defined. |
| `components/app-shell.tsx` | **not adopted** | See "Known limitations". Its sidebar/topbar restyling is the deferred redesign. |
| `components/dashboard/command-center.tsx` | `src/components/command-center/command-center.tsx` | Rewritten as the real, API-backed dashboard; the prototype's section structure and class vocabulary are preserved. |
| `public/manus-routes.json` | **deleted** | Mock route manifest for a one-route prototype; the real router is Next's file system. |

### Reused from the existing application

`useApi` (API client), `RoleGuard`, `useAuth`, `STUDENT_QUICK_ACTIONS`, and every
type in `src/lib/types.ts`. Nothing was duplicated: the Command Center consumes
the same hooks, the same client and the same types as the other 14 phases.

---

## 6. API mapping

Every panel is a real SmartCampus endpoint. No mock data remains on the
integrated surface.

| Command Center panel | Endpoint | Auth |
| -------------------- | -------- | ---- |
| Overall attendance | `GET /students/me/attendance-summary` | STUDENT |
| Pending fees | `GET /students/me/fees-summary` | STUDENT |
| Academic outlook | `GET /performance/predict` | STUDENT |
| Academic record (assessments/assignments) | `GET /performance` | STUDENT |
| Campus services / Transport | `GET /transport/me` | STUDENT |
| Library fine note | `GET /library/my-fines` | STUDENT |
| Today's timetable | `GET /students/me/timetable` | STUDENT |
| Recommendations | `GET /recommendations` | STUDENT |
| Live bus tracking | `GET /transport/me` (`tracking`) | STUDENT |
| Quick actions | 8 links to real module pages | — |

Nine endpoints, all reached through the single `useApi` hook. Integration audit
of the client found **no** `/api/api` double-prefix callers and **no** reference
to port 8001 in the browser; the only raw `fetch` is the certificate PDF
download, which correctly attaches the bearer token itself.

### ML contract consumed

The frontend reads the fields the API actually returns:

`category`, `confidence`, `probabilities`, `model_version`,
`prediction_source`, `is_model_prediction`, `model_trained_at`, `predicted_at`.

The obsolete `predictionCategory` / `trainedAt` names are gone. `probabilities`
is typed `Record<string, number>` because the model has three classes and never
returns `AVERAGE`; the UI counts the real class list rather than assuming four.

Source is surfaced honestly: the card badge reads `ML model · v1` or
`Rule-based fallback`, and a fallback is never described as a model prediction.

---

## 7. Authentication

The existing system was already sound; it was verified and hardened rather than
replaced. No second auth system was created.

| Concern | State |
| ------- | ----- |
| Login | `POST /api/auth/login` with `{email, password}`; the API client unwraps `{token, user}` |
| Token storage | `localStorage["smartcampus_token"]` (the only key written) |
| Session restore | `GET /api/auth/me` on mount — the server is the source of truth |
| Role detection | from `user.role` returned by `/auth/me` |
| Redirect | `roleHome(role)` → `/dashboard`, `/faculty`, `/admin`, `/parent`, `/alumni` |
| 401 handling | the client clears the token and dispatches an event; the provider signs out and surfaces "session expired" |
| Logout | `POST /api/auth/logout`, token cleared, **hard** navigation to `/login` |
| Protected routes | `AuthGuard` on the `(app)` group, `RoleGuard` per page |

### Two authentication defects found and fixed

1. **Sign-out left authenticated UI reachable.** `handleLogout` used
   `router.replace("/login")`, a client-side transition that keeps the previous
   view in the router cache, so pressing **Back** restored the signed-in
   dashboard. Now a hard navigation, which discards the cached document.

2. **Back/forward cache could resume a stale session.** A page restored from
   bfcache resumes with its previous in-memory `AuthProvider` state, so after
   signing out the app still believed it was authenticated and sat on a
   protected URL showing "Redirecting to sign in…". The provider now re-validates
   on `pageshow` when `event.persisted`, and leaves the protected URL with a hard
   navigation when the session is gone.

Both are covered by `e2e/auth.e2e.mjs`.

---

## 8. E2E changes

Four suites needed a selector updated because the surface they assert on is now
the Command Center. **No assertion was weakened, skipped or deleted** — only the
label each one reads from changed.

| Suite | Change |
| ----- | ------ |
| `phase1.e2e.js` | Waits for the API-backed attendance figure before matching it, because the card heading now renders before its data arrives. Assertion unchanged. |
| `phase5.e2e.mjs` | Reads the prediction card as "Academic outlook" (the prototype's copy) instead of "Performance prediction". |
| `phase6.e2e.mjs` | Same label change for its dashboard-integration check. |
| `phase11` / `phase13` / `phase14` | No test change. The old dashboard exposed "Open Library" / "Meet alumni" / "Open Mess" links; the Command Center's quick actions now carry explicit CTAs, so the assertions pass against a richer UI. |

One genuine UI bug was found this way: a `text-transform: uppercase` on the
quick-actions heading made `innerText` report "QUICK ACTIONS", which broke
Phase 1's literal "Quick actions" match. Removed.

---

## 9. Verification results

All figures below were produced by running the suites, not estimated.

### API and ML (backend frozen — unchanged)

| Suite | Result |
| ----- | ------ |
| `npm run test:api` | **488/488** |
| `npm run test:ml` | **61/61** |
| `npm run test:feature-parity` | 7 students × 44 features, parity OK |
| `python -m pytest` | **33 passed** |

### Frontend

| Check | Result |
| ----- | ------ |
| `tsc --noEmit` | PASS |
| `npm run lint` | PASS (0 errors, 0 warnings) |
| `npm run build` | PASS, **39 routes** |

### E2E

| Suite | Result | | Suite | Result |
| ----- | ------ |-| ----- | ------ |
| Auth (new) | **55/55** | | Phase 8 | 29/29 |
| Phase 1 | 26/26 | | Phase 9 | 37/37 |
| Phase 2 | 48/48 | | Phase 10 | 27/27 |
| Phase 3 | 52/52 | | Phase 11 | 23/23 |
| Phase 4 | 43/43 | | Phase 12 | 141/141 |
| Phase 5 | 48/48 | | Phase 13 | 28/28 |
| Phase 6 | 57/57 | | Phase 14 | 22/22 |
| Phase 7 | 37/37 | | Phase 15 | 29/29 |

**702 assertions, 702 passing** (647 across the fifteen phase suites, plus 55 in
the new auth suite). No phase regressed.

### Role and module flows (real browser, real accounts)

| Role | Landing | Pages verified |
| ---- | ------- | -------------- |
| STUDENT | `/dashboard` | dashboard, attendance, timetable, recommendations, ai, fees, hostel, transport, certificates, library, placements, mess, alumni |
| FACULTY | `/faculty` | faculty, faculty/timetable, faculty/risk, ai |
| ADMIN | `/admin` | admin, admin/transport, admin/placements, admin/library, admin/hostel, admin/mess, admin/certificates, admin/risk, admin/timetable |
| PARENT | `/parent` | parent (linked student, transport) |
| ALUMNI | `/alumni` | alumni, alumni/profile |

All landed on the correct home, rendered real API data, and showed no error state.

---

## 10. Known limitations

Resolved by the global AppShell integration below (see section 12). What remains:

1. **The Command Center is the student dashboard only.** Faculty, parent, admin
   and alumni keep their existing landing pages; the shell makes them look like
   one product but does not redesign them.
2. **Quick actions sit below the Command Center** rather than inside the hero
   grid, because they came from the previous dashboard and were retained rather
   than redrawn.
3. **Individual pages are not redesigned.** Cards, tables and charts keep the
   structure the phases shipped with; the shell and the token layer changed how
   they are painted, not how they are laid out. That is the deferred Frontend
   2.0 work.
4. `scripts/scope-command-center-css.mjs` reads the prototype from outside the
   repository (override with `PROTOTYPE_ROOT`). Once the design lands in the
   repo properly, the generated stylesheet can be committed as-is.
5. The design layer is regenerated from the prototype rather than hand-maintained;
   the overrides file is the only place to add new styles.

---

## 11. Files added or changed

**Added**

- `scripts/scope-command-center-css.mjs` — design-layer codemod
- `src/styles/command-center.css` (generated), `src/styles/command-center-overrides.css`
- `src/components/command-center/` — `command-center`, `data-summary-card`,
  `section-heading`, `connection-state`, `brand-mark`, `tracking-status-line`
- `e2e/auth.e2e.mjs` — 55-assertion authentication suite
- `scripts/probe-command-center.mjs`, `scripts/probe-module-flows.mjs` — ad-hoc probes

**Changed**

- `src/app/(app)/dashboard/page.tsx` — now renders the Command Center
- `src/app/globals.css` — imports the two design stylesheets
- `src/components/dashboard/quick-actions.tsx` — added `cta` labels
- `src/components/providers/auth-provider.tsx` — bfcache re-validation
- `src/components/layout/app-shell.tsx` — hard navigation on sign-out
- `e2e/phase1.e2e.js`, `e2e/phase5.e2e.mjs`, `e2e/phase6.e2e.mjs` — selectors
- `package.json` — `test:e2e:auth`

**Backend** — unchanged.

---

## 12. Global AppShell

The prototype's dark `AppShell` is now the single shell for the authenticated
application. This section supersedes limitations 1 and 2 above.

### Prototype shell adopted

`C:\test\tt\frontend\components\app-shell.tsx` was the source: a 250 px sticky
sidebar (brand, grouped navigation, session status, role footer), a sticky
translucent topbar (workspace context, search, account menu), a collapsible
desktop rail, an off-canvas mobile drawer with a scrim, the page container, the
app footer, and a 150–220 ms transition system on
`cubic-bezier(0.2, 0.75, 0.25, 1)`.

Its CSS is taken from the prototype stylesheet by the same codemod that produced
the Command Center layer, which now writes a second file:

| Output | Contents |
|---|---|
| `src/styles/command-center.css` | every prototype rule, document selectors anchored on `.command-center-surface` |
| `src/styles/app-shell.css` | **only** the shell's 108 rules (sidebar, nav, topbar, drawer, account menu, page container, footer, brand) plus the prototype palette on `.app-shell` |
| `src/styles/app-shell-overrides.css` | everything the integration added (below) |

The shell stylesheet is generated by rule *filtering*, not by rewriting: the file
is split with a brace-depth scanner that tracks comments and strings, each rule
is kept only when every selector in it belongs to the shell's class vocabulary,
and the survivors are re-emitted with their bodies byte-identical. The generator
verifies itself on every run and fails the build otherwise:

```
rules            108 style rules in 4 media queries (424 declarations)
dropped          182 non-shell rules
verbatim bodies  72/73        <- the one exception is the reformatted palette block
leaked           none
```

Two deliberate exclusions:

- **The prototype's document-level resets** (`*`, `a`, `button`, `input`,
  `html`, `body`, `::selection`). `.app-shell button { font: inherit }` would
  beat every `text-sm` utility in the host and flatten the typography of all
  fifteen phases. They are re-applied where they belong instead: the box-sizing
  reset is Tailwind's, the focus ring is scoped to `.app-shell` in the overrides,
  and `prefers-reduced-motion` is scoped to the shell and the auth surfaces.
- **The prototype's `--accent*` scale**, renamed to `--sc-accent*` in both
  generated stylesheets. The name collides with shadcn's `--accent` (a subtle
  hover surface, not a brand colour); left alone, `hover:bg-accent` inside the
  shell would have resolved to full-strength aqua. This is the only edit made to
  a rule body, and the generator asserts no un-renamed reference survives.

### Roles using it

All five, from one component. `src/components/layout/nav-config.ts` is the single
source of navigation truth; `navForRole` (the old flat list) is gone.

| Role | Home | Groups | Links |
|---|---|---|---|
| STUDENT | `/dashboard` | Home, Academics, AI & Insights, Finance, Campus, Career, Profile | 17 |
| FACULTY | `/faculty` | Home, Academics, AI & Insights, Campus, Career, Profile | 9 |
| ADMIN | `/admin` | Home, Academics, AI & Insights, Campus, Career, People, Profile | 13 |
| PARENT | `/parent` | Home, AI & Insights, Profile | 3 |
| ALUMNI | `/alumni` | Home, Career, Profile | 5 |

Every entry carries the roles its page's `RoleGuard` accepts, so the sidebar can
never offer a link that bounces straight back to the role's home. Entries are
derived from the real route guards, which also **added** navigation that the old
flat list was missing: `/library` and `/placements` for faculty, the alumni
sub-pages (`/alumni/events`, `/campaigns`, `/mentorship`) for students and
alumni, and `/alumni/profile` for alumni, who previously had a single entry.

Nothing was invented. There is no `/performance` route, so there is no
Performance entry; the ML outlook is a panel on the student dashboard and a row
in the AI assistant. Mess billing is part of `/mess` rather than a second entry
under Finance, because there is no billing route of its own.

### Navigation grouping and active state

Groups are rendered as `.nav-group` blocks with a `.nav-group__label` heading,
so the sidebar reads as a product rather than fifteen phases.

Active state is resolved by **longest matching prefix**, not by `startsWith` on
every entry — `/admin` is a prefix of `/admin/transport`, `/faculty` of
`/faculty/risk` and `/alumni` of `/alumni/events`, and matching all of them would
light up two links at once. `activeNavItem()` sorts the covering entries by href
depth and returns the deepest. Verified in a real browser:

| Route | Active entry |
|---|---|
| `/admin/transport` | Transport (not Dashboard) |
| `/faculty/risk` | Risk Indicators |
| `/alumni/events` | Events (not the alumni Dashboard) |
| `/transport`, `/certificates` | Transport, Certificates |

The exact route also carries `aria-current="page"`; the covering section carries
`aria-current="true"`. The topbar repeats the section as
`{workspace} · {section}`.

### Responsive behaviour

The prototype's three breakpoints are kept: the rail narrows to 220 px at
≤1160 px and hides the collapse control, becomes a fixed 274 px off-canvas
drawer at ≤900 px, and the topbar sheds its labels at ≤680 px and tightens again
at ≤390 px. Two corrections were needed:

- **The closed drawer was still in the tab order.** Off-canvas via `transform`
  only, so its links stayed focusable and readable by a screen reader. The
  overrides toggle `visibility` with the transition, so the drawer leaves the tab
  order when closed and returns when open.
- **Two mobile-only controls were visible on desktop.** The prototype declares
  `.sidebar-mobile-close, .mobile-menu-trigger { display: none }` and then
  `.icon-button { display: grid }` further down the same file at the same
  specificity, so the later rule won. Restated in the overrides, after the
  imported layer.

The sidebar navigation itself scrolls (`overflow-y: auto` with a thin dark
scrollbar) because a student sees 17 entries; the prototype's `overflow: hidden`
would have clipped them.

The prototype's `overflow: hidden` on `.main-panel` had the same class of
problem: it turns the panel into a scroll container, which silently disables the
sticky topbar. Replaced with `overflow-x: clip`, which keeps the horizontal
guarantee without creating a scrollport.

### Accessibility

- Drawer: `aria-label` on the `<aside>`, `aria-expanded` on the trigger, focus
  moved to the close button on open, `Escape` closes and returns focus to the
  trigger, and the scrim is a labelled button.
- Account menu: `role="menu"` / `role="menuitem"`, `aria-haspopup="menu"`,
  `Escape` closes and restores focus, a click outside dismisses. The prototype
  used `role="dialog"` with bare buttons; that was corrected.
- Command palette: `role="dialog"` + `aria-modal`, a labelled `role="combobox"`
  with `aria-activedescendant`, `role="listbox"` / `role="option"` results,
  `↑ ↓ ↵ Esc` handling, and `⌘K`/`Ctrl+K` ignored while a field has focus.
- Every interactive element in the shell keeps the prototype's 3 px
  `--focus-ring` outline, re-declared inside `.app-shell`.
- Compact mode adds `aria-label` and `title` to nav links, because the visible
  label is `display: none` at 76 px.
- `prefers-reduced-motion: reduce` collapses every transition and animation in
  the shell and the auth surfaces to 0.01 ms.

### Dead affordances removed, not shipped

The prototype's nav buttons raised an "isn't connected in this visual prototype"
toast, its search field had no index, and its notifications bell had no
notification service. The previous integration had already removed every
placeholder from the Command Center, so carrying them into the global shell would
have reintroduced fake functionality in the most prominent surface of the app.

- Navigation is real links to real routes.
- **The search field became a command palette** over the signed-in role's own
  navigation, opened by click or `⌘K`. It cannot offer a destination the guard
  would bounce, because it searches the same list the sidebar renders.
- **The notifications bell was dropped.** The backend has no notifications; a
  bell that cannot ring is a lie about functionality.

The sidebar's "Prototype view · Live data not connected" panel became a real
session panel (shield icon, the signed-in email, a live status dot), and the
"Visual prototype · no live university data" footer became the product
description.

### Login separation

`/login`, `/parent/activate`, `/verify/[code]` and the root redirector are
outside the `(app)` group, so they never inherit the authenticated shell. They
are still prototype-consistent: they render on `.auth-surface`, which paints the
same navy gradient and radial washes the shell uses, and the sign-in form wears
the prototype's brand mark. The Command Center's `.page-surface` padding and the
auth surface's are defined once, in the same stylesheet, so the rhythm matches.

### Dark visual consistency

Two layers, both generated, neither touching a phase component:

1. **The shadcn semantic tokens are re-pointed at the prototype palette**
   (`src/styles/theme-dark.css`). Every `bg-card`, `text-muted-foreground`,
   `border-border`, `bg-primary` utility in the fifteen phases already resolves
   through those tokens, so the whole surface flips in one place. `--primary` is
   the prototype's aqua, `--accent` a raised navy (shadcn's hover surface, not
   the brand), `--radius` 0.75rem to match the prototype's card radii.
2. **The light end of Tailwind's own palette is re-mapped.** About two hundred
   `bg-gray-100` / `text-red-800` / `border-green-300` utilities are written
   directly into the phase components. Rather than edit forty files,
   `scripts/build-dark-theme.mjs` scans `src` for palette utilities, reads each
   family's real hue and chroma out of Tailwind's own default theme, and
   re-declares exactly the shades in use: light shades become dark tinted
   surfaces, dark shades become light tinted text, and a shade used as a solid
   background at 400+ is left alone so brand blocks keep their contrast. 80 of 87
   shades in use are re-mapped; 7 are deliberately untouched and listed by the
   script on every run. Three shades that appear as both text and surface are
   declared explicitly, and the two source lines that made them ambiguous were
   converted (`bg-blue-600 text-white` → `bg-primary text-primary-foreground`,
   `text-amber-300` → `text-amber-400`).

A browser sweep of all 39 authenticated routes found **zero** elements with a
light background inside the shell after the change, and zero horizontal overflow
at 1500 px or 390 px.

`docs/UI_DESIGN_SYSTEM.md` documents the tokens, the shell's class inventory and
the rules for adding to them.

### Regression verification

| Suite | Baseline | Result |
|---|---|---|
| auth | 55 | **55/55** |
| Phase 1 | 26 | 26/26 |
| Phase 2 | 48 | 48/48 |
| Phase 3 | 52 | 52/52 (one selector scoped — see below) |
| Phase 4 | 43 | 43/43 |
| Phase 5 | 48 | 48/48 |
| Phase 6 | 57 | 57/57 |
| Phase 7 | 37 | 37/37 |
| Phase 8 | 29 | 29/29 |
| Phase 9 | 37 | 37/37 |
| Phase 10 | 27 | 27/27 |
| Phase 11 | 23 | 23/23 |
| Phase 12 | 141 | 141/141 |
| Phase 13 | 28 | 28/28 |
| Phase 14 | 22 | 22/22 |
| Phase 15 | 29 | 29/29 |
| **Total** | **702** | **702/702** |

Backend unchanged and re-verified: typecheck, build, API **488/488**, ML
integration **61/61**, feature parity 7 × 44, pytest **33/33**. Frontend:
typecheck, lint (0 errors, 0 warnings), build, 39 routes.

**One test selector changed.** `e2e/phase3.e2e.mjs` located the timetable's Search
button with a substring match over every `button` in the document; the shell's
"Search pages" control now matches that substring first, so the click opened the
command palette instead of filtering the register. The helper was given the
scoped selector `.page-surface button`. The assertion — every visible row
contains the edited room — is unchanged and still fails if filtering breaks.

The 20+ existing `nav a` assertions (exact labels such as `Certificates`,
`Library`, `Mess & Canteen`, `Alumni`, `Hostel`, `Transport`; substring labels
such as `Timetable`, `AI Assistant`, `Risk`; and the negative assertion that a
student never sees `Fee Management` or `Risk`) pass unchanged, which is also the
proof that the nav labels kept their exact text.

New coverage, `scripts/probe-app-shell.mjs` — 90 assertions in a real browser:
five roles sign in and get the right shell, navigation and home; nested-route
activation; the drawer, its focus behaviour and the absence of overflow; the
command palette's filter and navigation; the account menu's roles and dismissal;
compact mode; and a sweep of all 39 authenticated routes checking the shell is
present, that no light container survives and that nothing overflows
horizontally. `scripts/probe-visual-qa.mjs` captures the screenshot set in
`frontend/artifacts/`, and `scripts/probe-a11y.mjs` checks the two promises the
E2E suites do not cover: `prefers-reduced-motion` collapsing every transition in
the shell, and the focus ring actually painting. All three are npm scripts
(`probe:shell`, `probe:visual`, `probe:a11y`).

### Files for this step

**Added**

- `src/styles/app-shell.css` (generated), `src/styles/app-shell-overrides.css`
- `src/styles/theme-dark.css` (generated)
- `scripts/build-dark-theme.mjs`
- `src/components/layout/command-palette.tsx`
- `scripts/probe-app-shell.mjs`, `scripts/probe-visual-qa.mjs`, `scripts/probe-a11y.mjs`
- `docs/UI_DESIGN_SYSTEM.md`

**Changed**

- `scripts/scope-command-center-css.mjs` — now emits two stylesheets, with a
  verified rule filter, and renames the prototype's `--accent*` scale
- `src/components/layout/app-shell.tsx` — the prototype shell, rewritten against
  the real session, grouped role-aware navigation, drawer and account-menu
  accessibility, and the command palette
- `src/components/layout/nav-config.ts` — grouped, role-aware model with
  longest-prefix active matching, replacing the flat `NAV_ITEMS` list
- `src/components/layout/page-container.tsx` — the shared page container and page
  header
- `src/components/layout/brand-mark.tsx` — moved from `components/command-center/`
  (it is shell furniture now)
- `src/components/command-center/command-center.tsx` — hero no longer repeats the
  brand, which the shell owns
- `src/app/globals.css` — imports all five stylesheets; the light `:root` and
  `.dark` token blocks are gone; `.auth-surface` added
- `src/app/layout.tsx` — `dark` on `<html>`, `colorScheme: dark`, dark toasts
- `src/components/auth/guards.tsx`, `src/app/page.tsx`,
  `src/components/parent/activation-form.tsx` — `.auth-surface`
- `src/components/auth/login-form.tsx` — `.auth-surface`, the prototype's brand
  mark, demo panel on `--card`
- `src/styles/command-center-overrides.css` — page padding moved to the shared
  rule, `--sc-accent*` names, wider quick-action columns
- `src/app/(app)/recommendations/page.tsx`,
  `src/app/verify/[verificationCode]/page.tsx` — the two lines that made a
  palette shade ambiguous (see 2.4 of the design system)
- `e2e/phase3.e2e.mjs` — one selector scoped
- `package.json` — `build:styles`, `probe:shell`, `probe:visual`, `probe:a11y`

**Backend** — unchanged.


## Follow-up: student Performance surface (2026-10-02)

After the integration snapshot above, the student frontend gained a dedicated
`/performance` route. It is role-guarded to `STUDENT` and uses the existing
student-scoped `GET /api/performance` and `GET /api/performance/predict`
contracts. The Academic navigation and dashboard now link to it.

The page presents only fields returned by those endpoints, labels real ML output
separately from the deterministic rule-based fallback, and hides confidence and
class-probability UI for fallback results. It also explains that the current
model was trained on synthetic academic data and is not validated for real-world
academic decisions. The dashboard's prior `total_assignments` reference (not
returned by the endpoint) and `/10` assignment-score label (the endpoint returns
a percentage) were corrected against the backend service contract.

Follow-up verification on the updated frontend: `next typegen`, `tsc --noEmit`,
ESLint, and `next build` passed; the production build contains **40 routes**,
including `/performance`. The 702-assertion E2E results above remain the earlier
integration snapshot; the browser E2E suites were not rerun for this follow-up.
