# Design Portfolio — PRD

## Original Problem Statement
Transform static HTML design portfolio into a **database-driven, Canva-synced portfolio CMS** with admin dashboard, AI auto-categorization, search, filters, and a scalable schema supporting future providers. Preserve original visual identity (Playfair Display + purple accent).

## Architecture
- **Backend**: FastAPI + Motor (MongoDB) at `/app/backend/server.py`
- **Frontend**: React (JSX) + Tailwind + React Router + TanStack Query
- **Auth**: Emergent Google OAuth with allowlist (env-seeded + runtime CRUD)
- **AI**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via `emergentintegrations` (Emergent LLM Key)
- **Canva**: Full OAuth 2.0 + PKCE, multi-account per user, refresh handling, revoke on disconnect
- **Storage**: Provider-agnostic (`Storage` class in server.py). Default = local FS at `/app/uploads/`, served via `/api/assets/file/{key}`. Auto-switches to **Cloudflare R2** when `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET` are set. Optional public CDN via `R2_PUBLIC_BASE_URL`.

## Data Model (MongoDB)
- `users`, `user_sessions`, `admin_allowlist`
- `canva_accounts` (user_id, canva_user_id, tokens, expires_at, last_sync)
- `canva_oauth_states` (PKCE state store)
- `projects`: provider-agnostic — provider, external_id, title, slug, description, organization, category, project_type, tags[], skills[], featured/draft/archived/hidden, **status** (imported/needs_review/draft/published/archived), thumbnail, preview_images[], canva_url, view_url, tools_used[], role, color_palette[], typography[], dimensions, **case_study** {challenge, goal, process, outcome, impact, timeline}, **ai_suggestions** (with confidence + model + generated_at), **order**, project_date, source_account, timestamps
- `sync_logs` — created/updated/deleted counters + errors
- `assets` — id, key, url, filename, content_type, size, project_id, storage (r2|local), uploaded_at

## What's Implemented (2026-01)

### Phase 1 (initial MVP)
- Emergent Google OAuth + allowlist (env-seeded + runtime CRUD)
- Canva Connect OAuth (PKCE, refresh, revoke, multi-account)
- Sync engine (dedup, preserves manual overrides, detects deletions → archives)
- AI auto-classification (Claude Sonnet 4.5) with fallback
- Public Home / Gallery (masonry) / Project detail / Contact — preserving visual identity

### Phase 2 (production-ready CMS)
- **Seed data wiped** — production starts clean
- **Status workflow**: `imported | needs_review | draft | published | archived`. New Canva syncs land as `needs_review`.
- **Bulk actions**: delete / archive / publish / set_status / set_organization / set_category / set_featured / add_tags / reorder (`POST /api/projects/bulk`)
- **AI suggestion pipeline (non-destructive)**:
  - `POST /api/ai/suggest/{id}` → returns suggestions with confidence per-field, stored in `project.ai_suggestions`. NOT auto-applied.
  - `POST /api/ai/case-study/{id}` → drafts Challenge/Goal/Process/Outcome/Impact/Timeline
  - `POST /api/ai/improve-description/{id}` → cleaner tone
  - `POST /api/projects/{id}/apply-suggestions` `{fields: [...]}` — user chooses which to apply
- **Case study rendering** on public Project page (only shown when fields filled)
- **Skills across projects** — linked to gallery search
- **Assets (media manager)**:
  - `POST /api/assets/upload` (multipart, ≤1 GB, auth required)
  - `GET /api/assets` with `unused_only` and `project_id` filters
  - `DELETE /api/assets/{id}` (removes from storage + detaches from project)
  - `GET /api/assets/file/{path}` serves local files (until R2 configured)
- **Storage abstraction** — local by default, R2 auto-enabled via env
- **Admin dashboard v2** — Notion/Webflow-style CMS:
  - 6 stat cards (Total / Published / Needs review / Featured / Uncategorized / Assets)
  - Section tabs: Projects / Media / Canva & Sync / Team Access
  - Status filter tabs (All / Needs Review / Drafts / Published / Archived)
  - Bulk select with sticky action bar (bulk status, org, category, add tags, feature, archive, delete)
  - Row actions: preview / up-down reorder / edit modal / open in Canva
  - **ProjectEditor** modal with 3 tabs (Basics / Case Study / AI Suggestions), confidence badges, per-field apply, "Improve description", "Generate case study"
  - **MediaManager** with drag-free upload, filter (All / Unused), progress bar
- **Backward-compatible**: existing endpoints unchanged; new `status` field with graceful legacy handling for pre-status projects.
- **Critical fix**: `(provider, external_id)` sparse-unique index converted to `partialFilterExpression` so multiple manual projects with `null` external_id coexist. (Sparse index treated `null` as present.)

### Testing
- Iteration 1: 100% backend + frontend
- Iteration 2 (Phase 2): 24/24 backend cases pass; frontend admin CMS + case study rendering + media manager all verified

## Backlog / Next Actions
- **P0** — Set Canva credentials in `/app/backend/.env` and run first live sync.
- **P0** — Set R2 credentials (or S3-compatible) once account is provisioned; local storage will handoff to R2 automatically. Existing local URLs remain readable.
- **P1** — Full drag-and-drop reordering (currently up/down arrows work; DnD library can be added).
- **P1** — Canva embedded iframe on project detail (where URLs support it).
- **P1** — Rich case-study renderer (before/after slider, embedded video, timeline visual).
- **P2** — Additional providers: Figma / Adobe CC / Google Drive / GitHub / Notion (schema already supports it).
- **P2** — Virtualization (react-window) beyond 1000 projects.
- **P2** — Public search UI improvements (typo tolerance, tag autocomplete).

## Credentials
- Admin allowlist: `jeni.1245690@gmail.com`, `totallyn0tjenisha@gmail.com` (see `/app/memory/test_credentials.md`).
- Canva & R2 credentials: env vars in `/app/backend/.env` (blank until user adds).
