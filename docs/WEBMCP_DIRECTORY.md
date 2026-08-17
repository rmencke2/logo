# Influzer WebMCP Directory — Architecture findings & Phase 1 plan

**Date:** 2026-08-17  
**Spec:** WebMCP Directory Product & Technical Specification v1.0  
**Status:** Phase 1 implemented on branch `cursor/webmcp-directory-phase1-f241`

## 1. Repository architecture findings

| Area | Current Influzer pattern | Implication for WebMCP |
|------|--------------------------|------------------------|
| Framework | Express 5 + EJS + plain CSS | Same stack; no new framework |
| MCP catalog | JSON files on disk + service cache (`mcpDirectoryService`) | Prefer **JSON catalog** for sites/tools in Phase 1 |
| SQLite | Auth, sessions, analytics, newsletter only | Use SQLite later for submissions/scans (Phase 1.5), not the public catalog |
| Migrations | `CREATE TABLE IF NOT EXISTS` / ad-hoc scripts | No ORM; follow same style when SQLite is needed |
| Routing | `initialize*Service(app)` in `server.js`; static paths before `:slug` | `registerWebmcpRoutes` from `webmcpDirectoryService` |
| Search | Client/server filter on catalog payload | Server-side filter + pagination for WebMCP |
| Admin | `/admin` + `/admin/api/*` | Manual overlays via `webmcp-manual.json` for Phase 1 |
| Jobs | GitHub Actions refresh/validate | `refresh-webmcp-catalog.yml` |
| Analytics | `page_views` middleware | Covered by existing page-view tracking |
| Tests | Essentially none | `scripts/test-webmcp-normalize.js` |
| OpenAPI | None historically | `public/api/webmcp/openapi.json` |
| Nav | `site-header.ejs` / `home-header.ejs` | **MCP Servers** + **WebMCP** |

## 2. Spec ↔ stack mapping (ambiguities resolved)

| Spec item | Decision |
|-----------|----------|
| SQLite-heavy data model (§8) | **Phase 1:** Influzer-owned JSON snapshot. Matches MCP directory pattern. |
| `/webmcp/tools` in MVP vs Phase 2 | **Included in Phase 1.** |
| Ecosystem + Resources | Thin editorial seed pages shipped. |
| Scoring | “Not yet scored” placeholder; heuristics/scorecards later. |
| Influzer verification | Seed imports are **`unverified`**; provenance shown separately. |
| Scanner | Deferred to Phase 1.5; submit form captures review leads only. |
| External API | `WebMcpDiscoveryProvider` — server-side only. |

## 3. Naming & IA

- Product label: **WebMCP Directory**
- Code prefix: `webmcp`
- Live routes: `/webmcp`, `/webmcp/sites/:host`, `/webmcp/tools`, `/webmcp/categories/:category`, `/webmcp/ecosystem`, `/webmcp/resources`, `/webmcp/submit`, `/webmcp/about`, `/api/webmcp/v1/*`

## 4. Phase 1 delivered files

See git diff on this branch. Key modules:

- `services/webmcp/normalize.js`, `discoveryProvider.js`
- `services/webmcpDirectoryService.js`
- `scripts/refresh-webmcp-catalog.js`, `scripts/test-webmcp-normalize.js`
- `data/webmcp-*.json`
- `views/webmcp-*.ejs`, `public/css/webmcp-directory.css`
- `.github/workflows/refresh-webmcp-catalog.yml`

## 5. Deferred (Phase 1.5 / 2)

- Chromium scanner + SSRF-safe worker
- SQLite submissions/scans/scorecards tables
- Auto verification badge from Influzer scans
- Compare UI, claimed profiles, alerts
- LLM-assisted scoring
- Tool pattern SEO pages
- Full admin `/admin/api/webmcp/*` UI

## 6. Risks

- Upstream API shape/terms change → adapter isolation + last-good snapshot.
- Favicons from upstream may be relative → rewritten to absolute where needed.
- Do not confuse `/mcp` servers named `webmcp-*` with `/webmcp` website directory.

## 7. Runbook

### Refresh catalog
```bash
npm run refresh-webmcp
```

### Publish / unpublish
Edit `data/webmcp-manual.json` then re-run refresh.

### Rollback
Revert catalog JSON commits on `main`.

### Submissions
`data/webmcp-submissions/submissions.jsonl` (gitignored). No auto-publish.

### Tests
```bash
node scripts/test-webmcp-normalize.js
```
