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
node scripts/test-influzer-webmcp.js
node scripts/test-webmcp-scan.js
```

## 8. Influzer first-party WebMCP

Influzer.ai itself exposes WebMCP tools via `document.modelContext.registerTool()`:

| Surface | Path |
|---------|------|
| Interactive demo | `/webmcp/demo` |
| Tool manifest API | `GET /api/webmcp/v1/self` |
| Client registration | `public/js/influzer-webmcp.js` |
| Tool schema source | `data/influzer-webmcp-tools.json` |
| Catalog upsert | `npm run upsert-influzer-webmcp` |
| HTTP smoke demo | `npm run demo-influzer-webmcp` |

Browsers without native WebMCP get a **local demo polyfill** on Influzer pages so `getTools()` / `executeTool()` still work for testing. Native `document.modelContext` is preferred when present.

Catalog refresh always re-injects the Influzer showcase from `data/influzer-webmcp-tools.json` so upstream imports cannot drop it.

## 9. Scan-gated listing (Phase 1.5)

`/webmcp/submit` runs a live Chromium scan:

1. Capture email (+ newsletter opt-in, default on) via `subscribeToNewsletter(..., 'webmcp-submit')`
2. Headless Chrome (`puppeteer-core`) loads up to 6 pages (starting at the submitted path), installs an early `document`/`navigator.modelContext` polyfill, and captures `registerTool()` plus declarative `toolname` forms
3. Influzer scorecard + suggested journeys
4. Auto-publish when ≥1 tool is found (`verification_status: verified`, provenance `influzer-scan`)

APIs: `POST /api/webmcp/v1/scans`, `GET /api/webmcp/v1/scans/:id`  
Store: SQLite `webmcp_scans` · SSRF https-only + private IP DNS block · Rate limit 30 scans/IP/hour (`WEBMCP_SCAN_RATE_LIMIT`)

