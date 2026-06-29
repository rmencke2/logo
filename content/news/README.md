# News Publishing Guide

Short curated MCP ecosystem briefs — distinct from long-form Insights articles.

## Required fields

- `slug` — URL-safe id (e.g. `enterprise-mcp-auth-okta`)
- `title`
- `date` — `YYYY-MM-DD`
- `excerpt` — one sentence for cards and SEO
- `contentHtml` — brief body as HTML (keep shorter than Insights posts)

## Optional fields

- `tags` — array of strings
- `category` — default `MCP Ecosystem`
- `sourceName` — e.g. `Anthropic`
- `sourceUrl` — link to primary source
- `relatedInsightSlug` — slug of a deeper Insights article on the same topic

## URLs

- Index: `/news`
- Item: `/news/<slug>`
