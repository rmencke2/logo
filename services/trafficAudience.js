'use strict';

/**
 * Heuristic UA classification for admin traffic.
 * Not perfect identity — scrapers can spoof browsers.
 */

const UA = `lower(COALESCE(user_agent, ''))`;

/** Known AI / agent / LLM crawlers (and catalog scrapers that label themselves). */
const AGENT_UA_SQL = `
  ${UA} LIKE '%shapbot%'
  OR ${UA} LIKE '%riverbot%'
  OR ${UA} LIKE '%keenable%'
  OR ${UA} LIKE '%reflectionbot%'
  OR ${UA} LIKE '%meta-externalagent%'
  OR ${UA} LIKE '%gptbot%'
  OR ${UA} LIKE '%chatgpt%'
  OR ${UA} LIKE '%oai-searchbot%'
  OR ${UA} LIKE '%openai%'
  OR ${UA} LIKE '%anthropic%'
  OR ${UA} LIKE '%claudebot%'
  OR ${UA} LIKE '%perplexity%'
  OR ${UA} LIKE '%bytespider%'
  OR ${UA} LIKE '%amazonbot%'
  OR ${UA} LIKE '%exasearch%'
  OR ${UA} LIKE '%exa.ai%'
  OR ${UA} LIKE '%elevenlabs%'
  OR ${UA} LIKE '%webmcpregistry%'
  OR ${UA} LIKE '%ccbot%'
  OR ${UA} LIKE '%mcp%bot%'
  OR ${UA} LIKE '%aiagent%'
`;

/** Classic SEO / link / search bots (excluding agent list above). */
const SEO_BOT_UA_SQL = `
  (
    ${UA} LIKE '%bot%'
    OR ${UA} LIKE '%crawler%'
    OR ${UA} LIKE '%spider%'
    OR ${UA} LIKE '%slurp%'
    OR ${UA} LIKE '%semrush%'
    OR ${UA} LIKE '%ahrefs%'
    OR ${UA} LIKE '%petalbot%'
    OR ${UA} LIKE '%bingbot%'
    OR ${UA} LIKE '%googlebot%'
    OR ${UA} LIKE '%applebot%'
    OR ${UA} LIKE '%facebookexternalhit%'
    OR ${UA} LIKE '%linkedinbot%'
    OR ${UA} LIKE '%twitterbot%'
    OR ${UA} LIKE '%yandex%'
    OR ${UA} LIKE '%dataforseo%'
    OR ${UA} LIKE '%pageindexer%'
    OR ${UA} LIKE '%datacircle%'
    OR ${UA} LIKE '%curl/%'
    OR ${UA} LIKE '%wget/%'
    OR ${UA} LIKE '%python-requests%'
    OR ${UA} LIKE '%go-http-client%'
    OR ${UA} LIKE '%scrapy%'
    OR ${UA} LIKE '%headless%'
    OR COALESCE(user_agent, '') = ''
  )
  AND NOT (${AGENT_UA_SQL})
`;

const HUMAN_UA_SQL = `
  (
    ${UA} LIKE '%mozilla/%'
    OR ${UA} LIKE '%chrome/%'
    OR ${UA} LIKE '%safari/%'
    OR ${UA} LIKE '%firefox/%'
    OR ${UA} LIKE '%edg/%'
  )
  AND NOT (${AGENT_UA_SQL})
  AND NOT (${SEO_BOT_UA_SQL})
`;

const AUDIENCE_CASE_SQL = `
  CASE
    WHEN ${AGENT_UA_SQL} THEN 'agents'
    WHEN ${SEO_BOT_UA_SQL} THEN 'seo_bots'
    WHEN ${HUMAN_UA_SQL} THEN 'humans'
    ELSE 'other'
  END
`;

function classifyUserAgent(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  const agentHints = [
    'shapbot',
    'riverbot',
    'keenable',
    'reflectionbot',
    'meta-externalagent',
    'gptbot',
    'chatgpt',
    'oai-searchbot',
    'openai',
    'anthropic',
    'claudebot',
    'perplexity',
    'bytespider',
    'amazonbot',
    'exasearch',
    'exa.ai',
    'elevenlabs',
    'webmcpregistry',
    'ccbot',
    'aiagent',
  ];
  if (agentHints.some((h) => ua.includes(h)) || /mcp.*bot|bot.*mcp/.test(ua)) {
    return 'agents';
  }
  const seoHints = [
    'bot',
    'crawler',
    'spider',
    'slurp',
    'semrush',
    'ahrefs',
    'petalbot',
    'bingbot',
    'googlebot',
    'applebot',
    'facebookexternalhit',
    'linkedinbot',
    'twitterbot',
    'yandex',
    'dataforseo',
    'pageindexer',
    'datacircle',
    'curl/',
    'wget/',
    'python-requests',
    'go-http-client',
    'scrapy',
    'headless',
  ];
  if (!ua || seoHints.some((h) => ua.includes(h))) {
    return 'seo_bots';
  }
  if (
    ua.includes('mozilla/') ||
    ua.includes('chrome/') ||
    ua.includes('safari/') ||
    ua.includes('firefox/') ||
    ua.includes('edg/')
  ) {
    return 'humans';
  }
  return 'other';
}

module.exports = {
  AGENT_UA_SQL,
  SEO_BOT_UA_SQL,
  HUMAN_UA_SQL,
  AUDIENCE_CASE_SQL,
  classifyUserAgent,
};
