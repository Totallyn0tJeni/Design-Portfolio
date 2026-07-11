# Design Portfolio — PRD

## Original Problem Statement
Transform static HTML design portfolio into a **database-driven, Canva-synced portfolio** with admin dashboard, AI auto-categorization, search, filters, and a scalable schema supporting future providers (Figma, Adobe, GitHub, Notion). Preserve original visual identity.

## Architecture
- **Backend**: FastAPI + Motor (MongoDB) at `/app/backend/server.py`
- **Frontend**: React (JSX) + Tailwind + React Router + TanStack Query + Framer-ready
- **Auth**: Emergent Google OAuth with allowlist stored in `admin_allowlist` collection (seeded from `ADMIN_EMAILS` env)
- **AI**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via `emergentintegrations` (Emergent LLM Key)
- **Canva**: Full OAuth 2.0 + PKCE, multi-account per user, refresh handling, revoke on disconnect

## Data Model (MongoDB)
- `users` (user_id, email, name, picture, is_admin)
- `user_sessions` (session_token, user_id, expires_at)
- `admin_allowlist` (email, role, enabled)
- `canva_accounts` (user_id, canva_user_id, access_token, refresh_token, expires_at, last_sync)
- `canva_oauth_states` (state, code_verifier, user_id)
- `projects` (provider-agnostic: provider, external_id, title, slug, description, organization, category, project_type, tags, featured/draft/archived/hidden, thumbnail, preview_images, canva_url, tools_used, role, color_palette, typography, dimensions, source_account, timestamps)
- `sync_logs` (created/updated/deleted counters, errors, timestamps)

## What's Implemented (2026-01)
- ✅ Emergent Google OAuth with allowlist enforcement (env-seeded + runtime CRUD)
- ✅ Canva Connect OAuth flow (PKCE, refresh, revoke, multi-account)
- ✅ Sync engine: dedup via (provider, external_id), preserves manual overrides, detects deletions (archives)
- ✅ AI auto-classification (Claude Sonnet 4.5) — org / category / tags / featured / description
- ✅ Manual override for every AI decision + edit modal in admin
- ✅ Public Home (hero, featured, category cards, recently added, live stats)
- ✅ Gallery: masonry, search (title/desc/tags/org), filters (org, category, featured), sort (newest/oldest/A-Z/recently updated), pagination
- ✅ Project detail: hero, thumbnails, tags, tools, related, Open in Canva/View, Share
- ✅ Admin dashboard: stats, Canva accounts (connect/sync/disconnect/sync all), allowlist CRUD, sync logs, projects table with reclassify + edit
- ✅ Performance: lazy image loading via IntersectionObserver, blur placeholder, aspect-ratio boxes, pagination
- ✅ Visual identity preserved (Playfair Display headings, purple accent #7c3aed, light gray bg, masonry grid, category cards with lucide icons)
- ✅ Seeded 16 demo projects for immediate visual validation
- ✅ Backend + frontend 100% pass on first testing pass (iteration_1.json)

## Backlog / Next Actions
- P0: Add real Canva credentials (`CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI`, `FRONTEND_URL`) to `/app/backend/.env` and run first real sync.
- P1: Verify EMERGENT_LLM_KEY connectivity for live AI classification (fallback works; live path throws currently).
- P1: Canva embedded preview iframe on project detail (when URL supports it).
- P2: Additional providers (Figma, Adobe, Google Drive, GitHub, Notion) — schema is already provider-agnostic; add new sync modules.
- P2: Virtualization (react-window) if >1000 projects.
- P2: Homepage "Category highlights" section with per-org featured cards.

## Test Credentials
See `/app/memory/test_credentials.md`.
