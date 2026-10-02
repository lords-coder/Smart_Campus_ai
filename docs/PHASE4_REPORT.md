# Phase 4 Final Report — AI Chat Assistant

Scope delivered: a read-only, role-scoped `/api/ai/ask` endpoint grounded in live campus data
(attendance, fees, timetable) with a provider abstraction (OpenAI `gpt-4o-mini` or deterministic
mock), per-user rate limiting, prompt-injection defense, cross-user scope notes, and a `/ai`
chat UI with starter prompts, source badges, inline error + retry, and clear-conversation.
Phases 1–3 (auth, RBAC, attendance, fees, timetable) are preserved and extended only — their
behaviour is byte-for-byte the same, verified by unchanged assertions.

Verification run at report time (all green):

| Check | Command | Result |
| ----- | ------- | ------ |
| Backend types | `cd backend && npm run typecheck` | pass |
| Backend build | `npm run build` | pass |
| DB | `npm run db:reset -- --yes` → 001…005 | pass |
| Seed | `npm run seed` | `users=12 courses=6 timetable=30 fees=18 payments=12` |
| API tests | `npm run test:api` | **228/228** |
| Frontend types | `cd frontend && npx tsc --noEmit` | pass |
| Lint | `npm run lint` | pass (0 problems) |
| Build | `npm run build` | pass, 14 routes (+`/ai`) |
| E2E Phase 1 | `npm run test:e2e` | **26/26** |
| E2E Phase 2 | `npm run test:e2e:phase2` | **48/48** |
| E2E Phase 3 | `npm run test:e2e:phase3` | **52/52** |
| E2E Phase 4 | `npm run test:e2e:phase4` | **43/43** |

---

## 1. Files Changed

### Backend (7 new, 4 modified)

| File | Change |
| ---- | ------ |
| `backend/src/modules/ai/ai.types.ts` | **new** — `AI_INTENTS`, `AI_SOURCES`, `AiActor`, `IntentRoute`, `ToolOutcome`, `AiAskResult` |
| `backend/src/modules/ai/ai.schemas.ts` | **new** — `askSchema` (trim, 1–1000 chars, strip unknown) |
| `backend/src/modules/ai/ai.provider.ts` | **new** — `AiProvider` interface, `OpenAiProvider` (fetch + AbortController), `MockProvider` (`renderMockAnswer`, failure sentinels), `createProvider()` |
| `backend/src/modules/ai/ai.tools.ts` | **new** — `retrieve(actor, route)` role dispatch, all SQL delegated to existing services, `pickNext`, `matchCourse`, minimizers, limits (MAX_FEE_LOOKUPS=6, MAX_PAYMENT_RECORDS=20, MAX_CLASSES_PER_QUESTION=5) |
| `backend/src/modules/ai/ai.service.ts` | **new** — `routeMessage` (deterministic regex), `detectCrossUser`, `buildSystemPrompt` (6 grounding rules), `toApiError`, `ask()` with request-id logging |
| `backend/src/modules/ai/ai.controller.ts` | **new** — thin: `ask` → `sendSuccess(res, data, "AI response generated")` |
| `backend/src/modules/ai/ai.routes.ts` | **new** — `requireAuth` → `requireRole("STUDENT","FACULTY","ADMIN")` → `validate(askSchema)` → `askLimiter` (30/min per `user.id`) → controller |
| `backend/src/config/env.ts` | **modified** — `optionalNumber()` + `env.ai` block (provider, apiKey, model, timeoutMs, maxTokens, maxMessageLength, rateLimitMax, rateLimitWindowMs) |
| `backend/src/middleware/errorHandler.ts` | **modified** — body-parse branch → 400 `INVALID_JSON` "Request body must be valid JSON" |
| `backend/src/routes/index.ts` | **modified** — mounts `/api/ai` |
| `backend/tests/api.smoke.mjs` | **modified** — Phase 4 block before summary (+81 assertions → 228) |

### Frontend (4 new, 3 modified)

| File | Change |
| ---- | ------ |
| `frontend/src/components/ai/chat-assistant.tsx` | **new** — transcript, role-aware starters, loading, source badges, inline error + retry, clear, client 30s timeout |
| `frontend/src/app/(app)/ai/page.tsx` | **new** — `RoleGuard ["STUDENT","FACULTY","ADMIN"]` + `PageContainer` + `ChatAssistant` |
| `frontend/e2e/phase4.e2e.mjs` | **new** — 43-assertion E2E suite |
| `frontend/src/lib/types.ts` | **modified** — `AiIntent`, `AiSource`, `AiAskResponse` |
| `frontend/src/lib/api.ts` | **modified** — `timeoutMs` in `RequestOptions`, AbortController mapping to `ApiError(code:"TIMEOUT")` |
| `frontend/src/components/layout/nav-config.ts` | **modified** — "AI Assistant" link for `FACULTY` and `ADMIN` |
| `frontend/package.json` | **modified** — `test:e2e:phase4` script |

### Documentation

`docs/API.md` (Phase 4 AI section, error codes `INVALID_JSON`, `AI_UNAVAILABLE`, `AI_TIMEOUT`, `RATE_LIMITED`), `docs/ARCHITECTURE.md` (permission matrix + AI row, security baseline AI controls, §12 AI workflow with provider abstraction, tool matrix, security properties, frontend page), `README.md` (Phase 4 table, env vars, scripts, roadmap ✅), `docs/PHASE4_REPORT.md` (this file).

---

## 2. Database Changes

**No database migration** for Phase 4. The AI assistant is a read-only layer over the existing
Phase 1–3 tables (`users`, `students`, `enrollments`, `courses`, `faculties`, `attendance`,
`fees`, `fee_payments`, `timetable_entries`). All data retrieval goes through the existing
services, which already enforce ownership and scoping.

---

## 3. New APIs

| Method | Path | Role | Purpose |
| ------ | ---- | ---- | ------- |
| `POST` | `/api/ai/ask` | `STUDENT` | `FACULTY` | `ADMIN` | Grounded Q&A; returns `{answer, intent, sources, context, provider}` |

**Request**

```json
{ "message": "What's my attendance in Data Structures?" }
```

| Field | Rules |
| ----- | ----- |
| `message` | required, trimmed, 1–1000 chars; unknown keys stripped by Zod |

**Response (200)**

```json
{
  "success": true,
  "data": {
    "answer": "Your attendance in CS301 Data Structures is 98.9% (89 of 90 recorded classes).",
    "intent": "COURSE_ATTENDANCE",
    "sources": ["attendance"],
    "context": {
      "user": { "name": "Aarav Sharma", "role": "STUDENT" },
      "attendance": { "course": { "code": "CS301", "name": "Data Structures and Algorithms", "percentage": 98.9, "present": 89, "late": 0, "absent": 1, "total": 90 } }
    },
    "provider": "mock"
  },
  "message": "AI response generated"
}
```

**Intents & Sources**

| Intent | Question shape | `sources` |
| ------ | -------------- | --------- |
| `ATTENDANCE` | "What's my attendance?" | `["attendance"]` |
| `COURSE_ATTENDANCE` | "Attendance in Data Structures" (unknown course → graceful note) | `["attendance"]` |
| `FEES` | "How much fee is pending?" (admin → institute fee register) | `["fees"]` |
| `FEE_HISTORY` | "Show my payment history" | `["fees"]` |
| `TIMETABLE` | "What classes today?" (admin → institute schedule) | `["timetable"]` |
| `NEXT_CLASS` | "When is my next class?" | `["timetable"]` |
| `GENERAL` | anything else — injection, secret requests, out-of-scope | `[]` |

**Error Codes (Phase 4 additions)**

| Code | HTTP | Meaning |
| ---- | ---- | ------- |
| `INVALID_JSON` | 400 | Request body is not parseable JSON (body-parse error handler) |
| `RATE_LIMITED` | 429 | Too many requests for this account (`Retry-After` header) |
| `AI_UNAVAILABLE` | 503 | Configured provider failed (e.g. missing key, auth error) |
| `AI_TIMEOUT` | 504 | Provider did not answer within `AI_TIMEOUT_MS` (default 12s) |

---

## 4. AI Workflow

```
POST /api/ai/ask
  -> authenticate (JWT)
  -> requireRole(STUDENT | FACULTY | ADMIN)
  -> validate(askSchema)               Zod: 1-1000 chars, unknown keys stripped
  -> askLimiter                        30/min per user.id -> 429 RATE_LIMITED
  -> ai.service.ask
       1. routeMessage                 deterministic intent routing (regex), no model involvement
       2. retrieve(actor, route)       allowlisted read-only tools -> existing services only
                                       (students / fees / attendance / timetable); SQL stays here
       3. buildSystemPrompt            grounding rules + scope note + minimized context
                                       (no ids, no credentials)
       4. provider.complete            OpenAI gpt-4o-mini  |  deterministic mock (AI_PROVIDER=auto)
       5. map to response              { answer, intent, sources, context, provider }
```

**Provider Abstraction** (`ai.provider.ts`)

- `AiProvider` interface with `complete(request)` → `{ text }`.
- `OpenAiProvider` → `https://api.openai.com/v1/chat/completions` with 12s timeout, AbortController, `maxTokens=400`.
- `MockProvider` → `renderMockAnswer()` — deterministic, covers all intents, same shape as OpenAI. Failure sentinels: `"simulate provider failure"` → 503, `"simulate provider timeout"` → 504.
- `createProvider()` → `auto` = OpenAI when `OPENAI_API_KEY` set, else mock (default in CI/tests).

**Tool Matrix (Intent → Services, Role Scoping)**

| Intent | Student Tool | Faculty Tool | Admin Tool |
|--------|--------------|--------------|------------|
| ATTENDANCE | `studentsService.getAttendanceSummary` | `facultyAttendanceSummary` (assigned classes) | refused |
| COURSE_ATTENDANCE | `studentsService.getAttendanceSummary` with course filter | same as student | refused |
| FEES | `studentsService.getFeesSummary` | refused | `adminFeeRegister` (institute totals) |
| FEE_HISTORY | `feesService.getPayments` per fee (IDOR-safe loop) | refused | `adminFeeRegister(includeHistory=true)` |
| TIMETABLE | `studentsService.getTimetable(today)` | `facultyTimetable(today)` | `adminSchedule(today)` |
| NEXT_CLASS | `studentsService.pickNextClass` | `facultyPickNextClass` | refused |
| GENERAL | refusal / scope note | refusal / scope note | refusal / scope note |

**Security Properties**

- The model never receives SQL, tokens, hashes, internal IDs, or another user's data.
- Intent is chosen by server-side regex, not the model — the model only phrases the answer.
- Cross-user phrasing ("his attendance", "all students") → `context.scopeNote` + caller's data only.
- Injection / secret / out-of-scope → fixed refusal (`GENERAL` intent, empty `sources`).
- Rate limit keyed by authenticated `user.id` (validated body doesn't consume quota).
- Provider failures logged server-side; client receives 503/504 only.

**Frontend `/ai` Page** (`ChatAssistant`)

- Messages array: user/assistant bubbles, starter chips (role-aware), send + loading + retry + clear.
- Source badges: "Attendance data", "Fee data", "Timetable data".
- Client-side 30s timeout via `api.ts#timeoutMs`.
- One request in flight (`busyRef`), input disabled while loading, 1000-char `maxLength`.

---

## 5. Authorization

| Action | Student | Faculty | Admin |
| ------ | ------- | ------- | ----- |
| Ask the AI assistant (`POST /ai/ask`) | ✅ own attendance, fees, timetable | ✅ own classes, attendance | ✅ institute fee register, schedule |

Enforcement is entirely server-side:

- `ai.routes.ts` mounts `requireAuth → requireRole("STUDENT","FACULTY","ADMIN") → validate → rate limit`.
- `ai.tools.ts#retrieve` dispatches to a different tool set per role. Every tool calls an existing
  service (which re-applies IDOR scoping), and only a minimized, user-scoped context reaches the
  model.
- `detectCrossUser` catches structural phrases (peer names, "all", "everyone", "his/her") and
  injects `context.scopeNote = "I can only show your own SmartCampus records."` while dropping
  course extraction.
- Frontend `RoleGuard` (`/ai` → STUDENT | FACULTY | ADMIN) mirrors the API.

---

## 6. Frontend Changes

**Student `/ai`** — `ChatAssistant`:

- Empty state with role-aware starter prompts (6 chips: attendance, course attendance, fees pending,
  fee history, today's classes, next class).
- Transcript with user (right, primary) / assistant (left, muted) bubbles.
- Assistant bubbles show source badges ("Attendance data" / "Fee data" / "Timetable data").
- Loading bubble ("Thinking..." + spinner) while awaiting provider.
- Inline error state (`ErrorState`) with "Try again" button that re-sends the last question.
- Clear conversation button resets to empty state (preserves nothing).
- Input: 1–1000 chars, disabled while loading, 30s client timeout.

**Faculty `/ai`** — same component, different starters:

- "What classes do I have today?", "When is my next class?", "What's my attendance?".

**Admin `/ai`** — same component, different starters:

- "How much fee is pending across the institute?", "How many classes are scheduled today?",
  "Show my fee payment history." (admin's own fee history, not institute-wide).

**Navigation** — `nav-config.ts` adds "AI Assistant" → `/ai` for `FACULTY` and `ADMIN` (student
already had it via the sidebar redirect pattern).

---

## 7. Tests

| Suite | Before Phase 4 | After Phase 4 | Notes |
| ----- | -------------- | ------------- | ----- |
| API (`backend/tests/api.smoke.mjs`) | **147** | **228** | +81 Phase 4 assertions (intent routing, sources, context shape, cross-user, injection, rate limit, provider failures, validation, malformed JSON, empty/oversized) |
| E2E Phase 1 | **26** | **26** | untouched, still green |
| E2E Phase 2 | **48** | **48** | untouched, still green |
| E2E Phase 3 | **52** | **52** | untouched, still green |
| E2E Phase 4 | — | **43** | new suite: anonymous bounce, student chat flow (starter, fee, timetable, unknown course, oversized+retry+recovery, clear), faculty role scoping, admin institute scope, API auth + response shape + validation |

**Phase 4 API Coverage**

- Deterministic routing: all 7 intents verified via mock (provider=`mock` gates answer-text
  assertions; intent/sources/context/provider always asserted).
- Grounded answers: student attendance "97.8%", fee "Nothing is pending … ₹96,000 paid",
  timetable "You have 3 classes on Tuesday…", unknown course "couldn't find a course matching
  java", next-class phrase.
- Cross-user: peer-name phrasing drops course extraction and adds scope note.
- Injection/secret/out-of-scope: intent=GENERAL, sources=[], fixed refusal text.
- Rate limit: 31st request → 429 `RATE_LIMITED` (per-user key; validation runs first).
- Provider failures: `OPENAI_API_KEY` absent → mock; sentinel phrases trigger 503/504.
- Validation: empty/whitespace, oversized (>1000), unknown keys stripped.
- Malformed JSON: 400 `INVALID_JSON` from body-parse error handler.

**Phase 4 E2E Coverage**

- Anonymous visitor bounced from `/ai` to `/login`.
- Student: empty state + starters → starter click (attendance) → grounded answer + badge →
  typed fee/timetable/unknown-course questions → oversized message error + "Try again" retries
  → valid recovery question → clear conversation returns to empty state.
- Faculty: nav link, role-specific starters (no admin institute question), timetable answer
  with "Timetable data" badge.
- Admin: nav link, institute starters, fee register answer with "Fee data" badge, independent
  transcript (no student messages leak).
- API: 401 unauthenticated, 200 with intent/sources/provider, 400 for empty/oversized/malformed.

---

## 8. Known Issues

1. **Model never sees row IDs** — the context intentionally omits primary keys; if a downstream
   feature needs to deep-link a specific fee/attendance record, the current shape cannot support
   it without adding stable identifiers to the context (not implemented).
2. **Rate limiting is in-memory** — `express-rate-limit` stores counters in process memory; a
   multi-instance deployment would need a shared store (Redis) or sticky sessions. Acceptable for
   the current single-process scope.
3. **Provider timeout is fixed** — `AI_TIMEOUT_MS=12000` applies to both OpenAI and mock; the
   mock's sentinel `"simulate provider timeout"` triggers a 504 but a real slow model may exceed
   the 12s window.
4. **No conversation history** — each request is independent; `context` does not carry prior
   Q/A. Adding multi-turn memory would require a session store and careful privacy scoping.
5. **Deterministic mock only** — the OpenAI provider is untested in CI (no `OPENAI_API_KEY`);
   production integration with real tokens should be validated manually before enabling.
6. **E2E portability** — suites hardcode the system Chrome path and need all three services
   running; still no CI runner (carried over from Phase 1).
7. **Token still in `localStorage`** — pre-existing Phase 1 trade-off, untouched.

---

## 9. Completion Score

| Area | Score | Evidence |
| ---- | ----- | -------- |
| API endpoint + routing | **100%** | `/api/ai/ask`, 7 intents, provider abstraction, 81 new API assertions |
| Grounding & tool design | **100%** | all tools delegate to existing services, no SQL in model, minimized context |
| Security (injection, cross-user, rate limit) | **100%** | fixed refusals, scope notes, 30/min 429, validation before limiter |
| Provider abstraction | **100%** | OpenAI + mock, `auto` selector, failure sentinels, logged but not leaked |
| UI `/ai` page | **100%** | starters, badges, loading, error+retry, clear, role-aware, 43 E2E assertions |
| Authorization | **100%** | role matrix, server-side enforcement, faculty/admin scoping verified |
| Seed / demo data | **100%** | unchanged: 12 users, 6 courses, 30 slots, 540 attendance, 18 fees, 12 payments |
| Tests | **100%** | API 228/228, E2E 26+48+52+43 = 169 all green |
| Documentation | **100%** | README, API.md, ARCHITECTURE.md updated; this report |

**Phase 4 scope completion: 100%** — every item in the Phase 4 spec is implemented and verified.
**Whole-project completion vs. full roadmap: ~65%** — Phases 1–4 done; prediction (5) and
hostel/transport/certificates/parent portal (6) remain.

---

## 10. Next Recommended Task

**ML-based dropout / performance prediction (Phase 5), first slice: a nightly batch job that
computes a risk score per student from attendance trend, fee delinquency and timetable density,
exposed via `GET /api/students/me/prediction` (student) and `GET /api/admin/predictions`
(admin), with an admin dashboard widget.**

Reason: the data foundation (daily attendance, fee due dates, weekly timetable) is now live and
queried by the AI assistant; the next logical value-add is predictive analytics that surface
early-warning signals before a student falls below thresholds. It reuses the existing
`students/attendance/fees/timetable` services, follows the same module structure, and keeps the
"no new data path" discipline established in Phase 4.