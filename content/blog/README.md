# Blog Publishing Guide

Publish new content by adding a `.json` file in this folder.

## Required fields

- `slug` (URL-safe unique id, e.g. `from-cpto-to-ceo`)
- `title`
- `date` (`YYYY-MM-DD`)
- `excerpt` (1-2 sentence summary)
- `contentHtml` (article body as HTML)

## Optional fields

- `tags` (array of strings)
- `category` (string, e.g. `Leadership`, `AI`, `Growth`)
- `featured` (`true` or `false`; featured posts are highlighted first)
- `coverImage` (URL path for image)
- `coverImageAlt`
- `videoEmbedUrl` (YouTube/Vimeo embed URL)

## Example URL structure

- Blog index: `/insights`
- Post page: `/insights/<slug>`

## Minimal template

```json
{
  "slug": "from-cpto-to-ceo",
  "title": "From CPTO to Defacto CEO",
  "date": "2026-04-10",
  "excerpt": "What changes when scope turns into full company accountability.",
  "category": "Leadership",
  "featured": false,
  "tags": ["Leadership", "CEO"],
  "contentHtml": "<p>Your content here.</p>"
}
```
