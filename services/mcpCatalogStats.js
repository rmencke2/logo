/**
 * One source of truth for public catalog counts.
 *
 * serversListed
 *   MCP servers in the catalog that are not hidden.
 * serversWithIndexedTools
 *   Listed servers whose stored tools array has at least one entry.
 * toolsIndexed
 *   Sum of stored tool entries across listed servers.
 * serversWithSuccessfulHandshakeLast7Days
 *   Listed servers whose latest stored probe has endpoint_status "ok" or
 *   "ok_empty" and validated_at within the last 7 days. "ok_empty" means
 *   tools/list returned an empty list. auth_required is a response, not a
 *   successful tools/list. Null when the validation file cannot be read —
 *   callers must omit the metric rather than show a placeholder.
 */

const HANDSHAKE_WINDOW_DAYS = 7;
const HANDSHAKE_WINDOW_MS = HANDSHAKE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const SUCCESSFUL_ENDPOINT_STATUSES = new Set(['ok', 'ok_empty']);

const CAPTIONS = {
  serversListed: 'servers listed',
  serversWithIndexedTools: 'servers with at least one indexed tool',
  toolsIndexed: 'tools indexed',
  serversWithSuccessfulHandshakeLast7Days: 'servers with a successful handshake in the last 7 days',
  categories: 'categories',
  catalogUpdated: 'catalog updated',
};

function formatExactCount(n) {
  if (n == null || n === '') return null;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.trunc(v).toLocaleString('en-US');
}

function isSuccessfulHandshake(entry, nowMs) {
  if (!entry || typeof entry !== 'object') return false;
  const status = String(entry.endpoint_status || '').trim().toLowerCase();
  if (!SUCCESSFUL_ENDPOINT_STATUSES.has(status)) return false;
  const at = Date.parse(entry.validated_at || '');
  if (!Number.isFinite(at) || !Number.isFinite(nowMs)) return false;
  const age = nowMs - at;
  return age >= 0 && age <= HANDSHAKE_WINDOW_MS;
}

function indexValidation(validationBySlug) {
  const bySlug = new Map();
  if (!validationBySlug || typeof validationBySlug !== 'object') return bySlug;
  for (const [key, value] of Object.entries(validationBySlug)) {
    const slug = String(key || '').trim().toLowerCase();
    if (slug) bySlug.set(slug, value);
  }
  return bySlug;
}

/**
 * @param {{
 *   servers?: object[],
 *   validationBySlug?: object|null,
 *   validationAvailable?: boolean,
 *   categoryCount?: number,
 *   catalogUpdatedDisplay?: string|null,
 *   catalogUpdatedIso?: string|null,
 *   now?: Date|number|string,
 * }} [input]
 */
function computeCatalogStats(input = {}) {
  const list = Array.isArray(input.servers) ? input.servers : [];
  const validationAvailable = Boolean(input.validationAvailable);
  const nowMs = input.now instanceof Date ? input.now.getTime() : Date.parse(input.now || new Date());
  const validation = validationAvailable ? indexValidation(input.validationBySlug) : null;

  let serversListed = 0;
  let serversWithIndexedTools = 0;
  let toolsIndexed = 0;
  let serversWithSuccessfulHandshakeLast7Days = validationAvailable ? 0 : null;

  for (const server of list) {
    if (!server || server.hidden) continue;
    serversListed += 1;
    const toolCount = Array.isArray(server.tools) ? server.tools.length : 0;
    toolsIndexed += toolCount;
    if (toolCount > 0) serversWithIndexedTools += 1;
    if (!validation) continue;
    const slug = String(server.slug || server.id || '').trim().toLowerCase();
    if (slug && isSuccessfulHandshake(validation.get(slug), nowMs)) {
      serversWithSuccessfulHandshakeLast7Days += 1;
    }
  }

  const categoryCount = Number(input.categoryCount);
  return {
    serversListed,
    serversWithIndexedTools,
    toolsIndexed,
    serversWithSuccessfulHandshakeLast7Days,
    categoryCount: Number.isFinite(categoryCount) && categoryCount >= 0 ? Math.trunc(categoryCount) : 0,
    catalogUpdatedDisplay: input.catalogUpdatedDisplay ? String(input.catalogUpdatedDisplay) : null,
    catalogUpdatedIso: input.catalogUpdatedIso ? String(input.catalogUpdatedIso) : null,
    handshakeWindowDays: HANDSHAKE_WINDOW_DAYS,
  };
}

function unitLabel(countLabel, singular, plural) {
  if (countLabel == null) return plural;
  const n = Number(String(countLabel).replace(/,/g, ''));
  return n === 1 ? singular : plural;
}

function describeCatalogStats(stats = {}) {
  const listed = formatExactCount(stats.serversListed);
  const withTools = formatExactCount(stats.serversWithIndexedTools);
  const tools = formatExactCount(stats.toolsIndexed);
  const handshake = stats.serversWithSuccessfulHandshakeLast7Days == null
    ? null
    : formatExactCount(stats.serversWithSuccessfulHandshakeLast7Days);
  const categories = formatExactCount(stats.categoryCount);
  const updated = stats.catalogUpdatedDisplay ? String(stats.catalogUpdatedDisplay) : null;
  const captions = {
    serversListed: unitLabel(listed, 'server listed', CAPTIONS.serversListed),
    serversWithIndexedTools: unitLabel(withTools, 'server with at least one indexed tool', CAPTIONS.serversWithIndexedTools),
    toolsIndexed: unitLabel(tools, 'tool indexed', CAPTIONS.toolsIndexed),
    serversWithSuccessfulHandshakeLast7Days: unitLabel(
      handshake,
      'server with a successful handshake in the last 7 days',
      CAPTIONS.serversWithSuccessfulHandshakeLast7Days,
    ),
    categories: unitLabel(categories, 'category', CAPTIONS.categories),
    catalogUpdated: CAPTIONS.catalogUpdated,
  };

  const parts = [];
  if (listed != null) parts.push(`${listed} ${captions.serversListed}`);
  if (withTools != null) parts.push(`${withTools} ${captions.serversWithIndexedTools}`);
  if (tools != null) parts.push(`${tools} ${captions.toolsIndexed}`);
  if (handshake != null) parts.push(`${handshake} ${captions.serversWithSuccessfulHandshakeLast7Days}`);
  const countSentence = parts.join(', ');

  function metaDescription(featuredTitle) {
    const title = featuredTitle ? String(featuredTitle).trim() : '';
    if (!countSentence) {
      return title
        ? `MCP server directory. Featured insight: ${title}`
        : 'MCP server directory and executive AI insights from Influzer.ai.';
    }
    return title
      ? `${countSentence}. Featured insight: ${title}`
      : `${countSentence}. MCP server directory and executive AI insights from Influzer.ai.`;
  }

  return {
    listed,
    withTools,
    tools,
    handshake,
    categories,
    updated,
    countSentence,
    metaDescription,
    captions,
  };
}

module.exports = {
  HANDSHAKE_WINDOW_DAYS,
  CAPTIONS,
  SUCCESSFUL_ENDPOINT_STATUSES,
  formatExactCount,
  isSuccessfulHandshake,
  computeCatalogStats,
  describeCatalogStats,
};
