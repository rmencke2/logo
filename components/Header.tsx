/**
 * Shared site header — type definitions and nav config.
 *
 * **Production markup:** `views/partials/site-header.ejs`
 * **Styles:** `public/css/site-header.css`
 * **Behavior:** `public/js/site-header.js`
 *
 * Layout: [influzer.ai] ··· [MCP Directory] [Insights] [Tools ▾] [Subscribe →]
 * 52px sticky · white · 0.5px bottom border · Subscribe #6366F1
 */

export type HeaderActiveNav = 'mcp' | 'insights' | null;

export type HeaderProps = {
  activeNav?: HeaderActiveNav;
};

export const NAV_LINKS = [
  { label: 'MCP Directory', href: '/mcp', key: 'mcp' as const },
  { label: 'Insights', href: '/insights', key: 'insights' as const },
] as const;

export const TOOL_LINKS = [
  { label: 'Favicon Creator', href: '/favicon-generator' },
  { label: 'Video to GIF', href: '/video-to-gif' },
  { label: 'AVI to MP4', href: '/video-converter' },
  { label: 'Video Metadata', href: '/video-metadata' },
  { label: 'Meme Generator', href: '/meme-generator' },
] as const;

export const SUBSCRIBE_HREF = '/#newsletter';
