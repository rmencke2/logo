# From around the web — external MCP article discovery

Curated headlines from Hacker News, Reddit, Dev.to, Google News RSS, and GitHub — scored, deduped, and displayed in the **From around the web** section on the homepage and MCP directory pages. This is third-tier content: external links, visually secondary to **Insights** (original) and **Briefs** (short Influzer takes).

## Content hierarchy

| Tier | Nav label | URL | Source |
|------|-----------|-----|--------|
| 1 | Insights | `/insights` | `content/blog/*.json` — original long-form |
| 2 | Briefs | `/news` | `content/news/*.json` — short Influzer briefs |
| 3 | From around the web | Homepage, `/mcp` | `data/other-news-articles.json` — external |

## Stack

- **Pipeline:** Node.js script (`scripts/refresh-other-news.js`)
- **Storage:** `data/other-news-articles.json` (committed by GitHub Actions) + `data/other-news-overrides.json` (manual pin/hide)
- **Display:** EJS partial `views/partials/other-news-section.ejs`
- **Scheduler:** `.github/workflows/refresh-other-news.yml` (3× daily)

## Manual refresh

```bash
npm run refresh-other-news
```

Dry run (no file write):

```bash
npm run refresh-other-news -- --dry-run
```

## Configure sources

Edit **`config/other-news-sources.config.json`** — no pipeline code changes needed.

| Key | Purpose |
|-----|---------|
| `sources.hackerNews.queries` | Algolia search terms |
| `sources.reddit.subreddits` | Subreddit list + time window |
| `sources.devTo.tags` | Dev.to tags |
| `sources.googleNewsRss.queries` | RSS search queries |
| `sources.github.queries` | GitHub search queries |
| `recencyDays` | Only ingest items this fresh (default 14) |
| `autoPublishThreshold` | Relevance score 0–1 for auto-publish (default 0.52) |
| `maxDisplay` | Max cards on site (default 12) |
| `scoring.allowlist` / `denylist` | Heuristic relevance terms |

Disable any source with `"enabled": false`.

## LLM scoring (optional)

Set in `.env` on the machine running the refresh:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

In config:

```json
"llm": {
  "enabled": true,
  "model": "claude-3-5-haiku-latest",
  "maxArticles": 20
}
```

- With key: top candidates get a Haiku relevance score + editorial blurb.
- Without key: heuristic score + truncated summary blurb (pipeline still works).

Toggle off entirely: `"llm": { "enabled": false }`.

## Pin, hide, or publish

**Admin UI:** `/admin` → **Around the web** tab

**CLI:**

```bash
npm run other-news:admin -- list
npm run other-news:admin -- pin https://example.com/article
npm run other-news:admin -- hide https://example.com/article
npm run other-news:admin -- publish https://example.com/article
npm run other-news:admin -- reset https://example.com/article
```

Overrides are stored in `data/other-news-overrides.json` by canonical URL.

## Internal directory links

The pipeline scans article title + summary for MCP server names/slugs from `data/servers-generated.json`. Matches render as **Browse [Server] in our directory →**.

## Outbound UTM links

External links append `utm_source=influzer&utm_medium=in_other_news` (configurable in sources config).

## Scheduled refresh

GitHub Actions workflow `refresh-other-news.yml` runs at **08:00, 14:00, and 20:00 UTC** and commits updated `data/other-news-articles.json`.

After the workflow runs, deploy as usual (`npm run deploy:remote`) so Lightsail serves the latest JSON.

## Newsletter

The newsletter promotes **Insights** only. The “From around the web” section does not include a signup form.
