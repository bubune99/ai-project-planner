# Feedback Mechanism — Technical Reference

Authoritative documentation of the in-app point-and-annotate feedback
system in ai-project-planner and its extracted package `@faridea/feedback`.
Kept in-repo (versioned with the code) and mirrored to the planner KB.

> Behavior is **frozen**: capture, SVG screenshot, and UX must not change
> without explicit owner approval. Improvements happen at the edges
> (responsive polish, collector), not the core contract.

---

## 1. What it is

Selector-first feedback. A user clicks any element on the page and writes a
comment. We persist a **stable CSS/DOM selector + element snapshot + route +
environment + a lightweight element screenshot**. Because the row carries a
resolvable DOM target (not just an image), a coding agent can read it from
Postgres and map it straight to source — this is the differentiator vs
screenshot-first tools (Marker.io / BugHerd / Sentry User Feedback).

## 2. Components & files

| Layer | File | Role |
|---|---|---|
| Core (zero-dep) | `lib/feedback/core.ts` | selector, env, screenshot, select-mode, submit |
| React widget | `components/feedback/FeedbackWidget.tsx` | ✦ FAB → pick → compose → send |
| Mount | `app/layout.tsx` | `<FeedbackWidget source="ai-project-planner" />` after `<ServiceWorkerRegister />` |
| Collector POST/GET | `app/api/feedback/route.ts` | create (open) / admin list (gated) |
| Triage PATCH | `app/api/feedback/[id]/route.ts` | status/priority transitions (gated) |
| Admin inbox | `app/feedback/page.tsx`, `app/feedback/layout.tsx` | triage UI (`force-dynamic`) |
| Schema | `lib/db/migrations/038_feedback.sql` | `feedback` table |
| Auth exception | `middleware.ts` | method-aware public POST |
| Package | `@faridea/feedback` (`/mnt/c/Users/bubun/CascadeProjects/feedback-widget`, commit `afe2cf1`) | extracted core/react/script |

## 3. Capture core (`lib/feedback/core.ts`)

Zero dependencies, DOM-only, framework-agnostic. Self-marker constant
`WIDGET_ATTR = "data-fbw"` — every widget node carries it so select-mode
never targets the widget itself.

### `buildSelector(el) → { primary, fallbacks[] }`
Priority chain, first unique wins; up to 4 fallbacks:
1. `[data-testid="…"]`
2. `#id`
3. `tag[aria-label="…"]`
4. `tag[name="…"]`
5. `tag[role="…"]` (when element has text)
6. distinctive single class — skips utility/hashed classes
   (`/^(css-|sc-|[a-z]{1,3}-?\d)/`, `/^(flex|grid|p|m|w|h|text|bg)-/`)
7. `anchoredPath()` — structural `nth-of-type` path, depth < 6, stops at
   an `id` or `<body>` (robust to sibling inserts)

### `captureEnv() → CapturedEnv`
`url, route, title, viewport{w,h}, scrollY, devicePixelRatio, userAgent,
platform, deviceType (mobile <640 / tablet <1024 / desktop),
colorScheme (prefers-color-scheme), brand ([data-brand]),
density ([data-density]), locale, timezone,
commitSha (meta[name="commit-sha"] | window.__COMMIT_SHA__ | null)`.

### `captureScreenshot(el) → dataURL | null`
SVG `<foreignObject>` clone of the **single element**: clones the node,
inlines a ~18-property computed-style subset on the clone root, serializes,
base64 → `data:image/svg+xml;base64,…`. Capped 1200×1200; `null` on
zero-size or error. Intentionally lightweight (not a raster of the page) —
the element snapshot carries the real locating context. **Frozen.**

### `startSelect(onPick, onCancel) → { stop }`
Fixed highlight div (`data-fbw="highlight"`, z-index 2147483644).
Capture-phase `mousemove` / `click` / `keydown`. `isOwn` =
`closest('[data-fbw]')` excludes the widget. On click:
`preventDefault + stopPropagation + stopImmediatePropagation` (page
handler suppressed), builds `CapturedTarget { selector, selectorFallbacks,
rect{x,y,w,h}, snapshot{tag, text(≤200), classes, attributes}, screenshot }`.
`Esc` → `onCancel`.

### `submitFeedback(payload, endpoint = "/api/feedback")`
`POST` JSON, `credentials: "include"`. Body: `source, projectId, comment,
title, url(env.url), route(env.route), selector, targetRect,
annotations([{snapshot,fallbacks}] | []), screenshot, env, commitSha`.
Returns `{ ok, id?, error? }`. `endpoint` is configurable so one collector
serves many apps (the multi-project `source` key).

## 4. React widget (`FeedbackWidget.tsx`)

Props: `source` (app key, default `"ai-project-planner"` in-app /
`"app"` in the package), `projectId?`. Phases:
`idle → selecting → composing → sending → done | error`.
Inline styles only (survives any host CSS); all nodes `data-fbw`.
"skip — comment only" allows general (no-element) feedback. Mounted once
globally in `app/layout.tsx`.

## 5. Data model (`038_feedback.sql`)

Table `feedback`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `source` | text NOT NULL `'unknown'` | app key — multi-project |
| `project_id` | uuid → projects | `ON DELETE SET NULL` |
| `url` | text NOT NULL | |
| `route` | text | |
| `selector` | text | stable DOM selector |
| `target_rect` | jsonb | `{x,y,w,h}` |
| `annotations` | jsonb NOT NULL `'[]'` | `[{snapshot,fallbacks}]` |
| `title` | text | |
| `comment` | text NOT NULL | |
| `screenshot` | text | data URL (or future blob ref) |
| `env` | jsonb NOT NULL `'{}'` | full captured env |
| `console_logs` | jsonb `'[]'` | reserved |
| `commit_sha` | text | |
| `status` | text NOT NULL `'open'` | CHECK `open\|in_progress\|fixed\|wont_fix\|duplicate` |
| `priority` | text NOT NULL `'normal'` | CHECK `low\|normal\|high\|urgent` |
| `reporter_user_id` | uuid → users | set if authed |
| `reporter_name` / `reporter_email` | text | external reporters |
| `metadata` | jsonb NOT NULL `'{}'` | triage/resolution notes |
| `created_at` / `updated_at` / `resolved_at` | timestamptz | |
| `resolved_by` | uuid → users | |

Indexes: `source`, `project_id`, `status`, `created_at DESC`.

## 6. API

### `POST /api/feedback` — create (PUBLIC)
Not auth-gated (embeddable / anonymous). Requires `comment` and `url`
(400 otherwise). If a session exists, `reporter_user_id` is attributed via
`getAuthContext()`. → `201 { success, data:{ id, status } }`.

### `GET /api/feedback` — admin list (AUTH)
Filters `status`, `source`, `limit` (≤200, default 100). Order:
`open → in_progress → other`, then `created_at DESC`. `meta:{ total,
openCount, inProgressCount }` (drives the inbox badge).

### `PATCH /api/feedback/:id` — triage (AUTH)
Body `status` and/or `priority` (validated against the CHECK enums).
`status ∈ {fixed,wont_fix,duplicate}` stamps `resolved_at = NOW()` and
`resolved_by = auth.userId`. → updated `{ id, status, priority,
resolvedAt }`.

### Middleware exception (`middleware.ts`, commit `6292eb4`)
Method-aware: `pathname === "/api/feedback" && method === "POST"` →
`NextResponse.next()` (public). All other methods/paths fall through to
the normal auth gate — so `GET` (list) and `PATCH` (triage) stay
admin-only. This is the only public hole and it is method-scoped.

## 7. Lifecycle & triage convention

`open → in_progress → fixed | wont_fix | duplicate`.

When actioning owner ✦ annotations: read the `feedback` table, locate via
`annotations->0->snapshot` (tag/text/classes/attrs — more locatable than
the structural selector) + route, fix in code, then walk the row honestly:
`in_progress` with `metadata.resolution` + commit → `fixed` with
`resolved_at` + deployed commit/deploy id. Delete e2e/regression rows so
the table stays clean. PATCH is auth-gated; direct SQL is used for
agent-driven triage with the same stamps.

## 8. Security model

- Only `POST /api/feedback` is public (intentional, for anon/embed).
- `GET`/`PATCH` and `/feedback` page require auth (no data leak via the
  public hole).
- Widget self-exclusion via `data-fbw` prevents capturing itself.
- No secrets in the payload; `screenshot` is a client-built SVG of one
  element (no external resource fetch).

## 9. `@faridea/feedback` package

Standalone sibling repo `/mnt/c/Users/bubun/CascadeProjects/feedback-widget`
(local commit `afe2cf1`, **not published** — awaiting owner go-ahead).
Lift-and-package: `core.ts` copied **byte-verbatim**. Layers:

- `@faridea/feedback` — core (ESM `.js` + CJS `.cjs` + `.d.ts`)
- `@faridea/feedback/react` — `<FeedbackWidget>` (peer `react`,
  `"use client"` preserved, configurable `endpoint`)
- `@faridea/feedback/script` — drop-in IIFE (`feedback.global.js`,
  reads `data-source` / `data-endpoint` / `data-project-id`, no framework)

Build: tsup; verified `tsc` clean + node ESM/CJS load + artifact smoke.
agent-com: spec artifact `artifact_mpaf2w34_h2jyox`, memory key
`feedback-widget-package`.

### Self-hosting a collector
Stand up the `038_feedback.sql` table + a `POST` route accepting the
section-3 body and returning `{success,data:{id,status}}`. Keep `POST`
public if embedding for anon users; gate `GET`/`PATCH`.

## 10. Deferred (explicit owner decisions)

- **Screenshot/storage redesign — frozen.** No raster, no object storage;
  inline SVG stays. Revisit only if moving to true raster (then offload
  binary, keep a ref in `screenshot`).
- Planner/agent sync of feedback rows into planner todos/jobs.
- Hosted multi-tenant collector SaaS (contract documented; build later).

## 11. Constraints

- No mock data anywhere — honest empty states only.
- Inline styles only; `data-fbw` on every widget node.
- Endpoint configurable; one collector, many `source`s.
- Behavior frozen vs. the in-app original.
