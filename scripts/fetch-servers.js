#!/usr/bin/env node
/**
 * MCP directory data pipeline — fetches registries and writes data/servers-generated.json
 * Run: npm run refresh-data
 */

const fs = require('fs');
const path = require('path');
const {
  STANDARD_CATEGORIES,
  slugify,
  normalizeGithubUrl,
  mapCategory,
  mapTransport,
  normalizeTools,
  isOfficial,
  dedupeServers,
  filterNoise,
  ensureUniqueSlugs,
  finalizeServer,
} = require('./utils/normalize');

const ROOT = path.join(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'data', 'servers-generated.json');
const MANUAL_PATH = path.join(ROOT, 'data', 'mcp-servers-manual.json');
const LEGACY_MANUAL_PATH = path.join(ROOT, 'data', 'mcp-servers.json');
const LAST_UPDATED_PATH = path.join(ROOT, 'data', 'last-updated.json');

const GLAMA_BASE = 'https://glama.ai/api/mcp/v1';
const SMITHERY_BASE = 'https://api.smithery.ai/servers';
const AWESOME_README =
  'https://raw.githubusercontent.com/wong2/awesome-mcp-servers/main/README.md';

const GLAMA_TARGET = Number(process.env.GLAMA_TARGET) || 800;
const GLAMA_PAGE_SIZE = 100;
const GLAMA_DETAIL_DELAY_MS = Number(process.env.GLAMA_DETAIL_DELAY_MS) || 200;
const SMITHERY_PAGE_SIZE = 100;
const SMITHERY_MAX_PAGES = Number(process.env.SMITHERY_MAX_PAGES) || 60;
const FETCH_TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {import('./utils/normalize').CatalogServer} partial
 */
function toCatalogServer(partial) {
  return finalizeServer({
    id: partial.id || slugify(partial.name),
    slug: partial.slug || partial.id || slugify(partial.name),
    name: partial.name,
    description: partial.description || '',
    category: partial.category || mapCategory(partial.name, partial.description || ''),
    official: Boolean(partial.official),
    transport: partial.transport || 'unknown',
    tools: partial.tools || [],
    github_url: partial.github_url,
    docs_url: partial.docs_url,
    stars: partial.stars || 0,
    source: partial.source,
    last_updated: partial.last_updated || new Date().toISOString().slice(0, 10),
    icon: partial.icon,
    smithery_qualified_name: partial.smithery_qualified_name,
  });
}

// ——— Glama ———

async function fetchGlamaList() {
  const collected = [];
  let after = null;
  let page = 0;

  console.log('\n📡 Glama: listing servers…');

  while (collected.length < GLAMA_TARGET) {
    page += 1;
    const params = new URLSearchParams({ pageSize: String(GLAMA_PAGE_SIZE) });
    if (after) params.set('after', after);
    const url = `${GLAMA_BASE}/servers?${params}`;
    let data;
    try {
      data = await fetchJson(url);
    } catch (err) {
      console.error(`❌ Glama list failed (page ${page}):`, err.message);
      break;
    }

    const batch = data.servers || [];
    if (!batch.length) break;

    for (const item of batch) {
      collected.push(item);
      if (collected.length >= GLAMA_TARGET) break;
    }

    if (collected.length % 50 < batch.length || collected.length % 50 === 0) {
      console.log(`   … ${collected.length} servers listed (page ${page})`);
    }

    if (!data.pageInfo?.hasNextPage) break;
    after = data.pageInfo.endCursor;
    await sleep(100);
  }

  console.log(`✅ Glama list: ${collected.length} servers`);
  return collected;
}

/**
 * @param {object} item
 */
async function fetchGlamaDetail(item) {
  const ns = item.namespace;
  const slug = item.slug;
  if (!ns || !slug) return item;

  const url = `${GLAMA_BASE}/servers/${encodeURIComponent(ns)}/${encodeURIComponent(slug)}`;
  try {
    const detail = await fetchJson(url);
    return { ...item, ...detail, tools: detail.tools?.length ? detail.tools : item.tools };
  } catch {
    return item;
  }
}

async function fetchGlamaServers() {
  const list = await fetchGlamaList();
  const servers = [];
  let idx = 0;

  console.log(`\n📡 Glama: fetching details (${GLAMA_DETAIL_DELAY_MS}ms between requests)…`);

  for (const item of list) {
    idx += 1;
    const detail = await fetchGlamaDetail(item);
    const gh = detail.repository?.url || detail.github_url;
    const attrs = detail.attributes || [];
    const transport = attrs.some((a) => String(a).includes('remote'))
      ? 'http'
      : attrs.some((a) => String(a).includes('local'))
        ? 'stdio'
        : 'unknown';

    servers.push(
      toCatalogServer({
        id: slugify(`${detail.namespace}-${detail.slug}`),
        slug: slugify(detail.slug || detail.name),
        name: detail.name || detail.slug,
        description: detail.description || '',
        category: mapCategory(detail.name, detail.description || '', detail.categories),
        official: isOfficial(attrs),
        transport: mapTransport(transport),
        tools: normalizeTools(detail.tools),
        github_url: gh,
        docs_url: detail.url || detail.docs_url,
        glama_url: detail.url || `https://glama.ai/mcp/servers/${detail.id || ''}`,
        glama_id: detail.id,
        glama_namespace: detail.namespace,
        glama_slug: detail.slug,
        stars: detail.stars || detail.starCount || 0,
        source: 'glama',
      }),
    );

    if (idx % 50 === 0) console.log(`   … ${idx}/${list.length} details fetched`);
    await sleep(GLAMA_DETAIL_DELAY_MS);
  }

  console.log(`✅ Glama: ${servers.length} servers normalized`);
  return servers;
}

// ——— Smithery ———

async function fetchSmitheryServers() {
  console.log('\n📡 Smithery: listing servers…');
  const servers = [];
  let page = 1;
  let totalPages = 1;

  while (page <= SMITHERY_MAX_PAGES && page <= totalPages) {
    const url = `${SMITHERY_BASE}?page=${page}&pageSize=${SMITHERY_PAGE_SIZE}`;
    let data;
    try {
      data = await fetchJson(url);
    } catch (err) {
      console.error(`❌ Smithery page ${page} failed:`, err.message);
      break;
    }

    totalPages = data.pagination?.totalPages || totalPages;
    const batch = data.servers || [];

    for (const item of batch) {
      const qn = item.qualifiedName || item.namespace;
      const homepage = item.homepage || '';
      const gh =
        homepage.includes('github.com') ? homepage : item.repository?.url || undefined;

      servers.push(
        toCatalogServer({
          id: slugify(qn || item.displayName),
          slug: slugify(qn || item.displayName),
          name: item.displayName || qn,
          description: item.description || '',
          category: mapCategory(item.displayName || '', item.description || ''),
          official: Boolean(item.verified),
          transport: item.remote ? 'http' : 'stdio',
          tools: [],
          github_url: gh,
          docs_url: item.homepage || `https://smithery.ai/servers/${qn}`,
          stars: item.useCount || item.score || 0,
          source: 'smithery',
          smithery_qualified_name: qn,
        }),
      );
    }

    if (page % 10 === 0 || page === 1) {
      console.log(`   … page ${page}/${Math.min(totalPages, SMITHERY_MAX_PAGES)} (${servers.length} servers)`);
    }

    page += 1;
    await sleep(150);
  }

  console.log(`✅ Smithery: ${servers.length} servers normalized`);
  return servers;
}

// ——— Awesome MCP README ———

async function fetchAwesomeMcpServers() {
  console.log('\n📡 awesome-mcp-servers: parsing README…');
  const servers = [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(AWESOME_README, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();

    const linkRe = /^\s*[-*]\s+\*\*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\*\*\s*[-–—]\s*(.+)$/gm;
    let match;
    while ((match = linkRe.exec(md)) !== null) {
      const [, name, url, description] = match;
      const gh = url.includes('github.com') ? url.replace(/\/$/, '').split('#')[0] : undefined;
      servers.push(
        toCatalogServer({
          id: slugify(name),
          slug: slugify(name),
          name: name.trim(),
          description: description.trim(),
          category: mapCategory(name, description),
          official: /modelcontextprotocol/i.test(url),
          transport: 'unknown',
          tools: [],
          github_url: gh,
          docs_url: gh ? undefined : url,
          stars: 0,
          source: 'awesome-mcp',
        }),
      );
    }

    const simpleLinkRe = /^\s*[-*]\s+\[([^\]]+)\]\((https?:\/\/github\.com\/[^)]+)\)\s*[-–—]?\s*(.*)$/gm;
    while ((match = simpleLinkRe.exec(md)) !== null) {
      const [, name, url, description] = match;
      if (servers.some((s) => normalizeGithubUrl(s.github_url) === normalizeGithubUrl(url))) continue;
      servers.push(
        toCatalogServer({
          id: slugify(name),
          slug: slugify(name),
          name: name.trim(),
          description: (description || name).trim(),
          category: mapCategory(name, description || name),
          official: /modelcontextprotocol/i.test(url),
          transport: 'unknown',
          tools: [],
          github_url: url.replace(/\/$/, '').split('#')[0],
          stars: 0,
          source: 'awesome-mcp',
        }),
      );
    }
  } catch (err) {
    console.error('❌ awesome-mcp-servers failed:', err.message);
  }

  console.log(`✅ awesome-mcp-servers: ${servers.length} entries parsed`);
  return servers;
}

// ——— Manual seed ———

function loadManualServers() {
  const manualFile = fs.existsSync(MANUAL_PATH)
    ? MANUAL_PATH
    : fs.existsSync(LEGACY_MANUAL_PATH)
      ? LEGACY_MANUAL_PATH
      : null;

  if (!manualFile) {
    console.log('\n⚠️  No manual seed file found');
    return [];
  }

  const data = JSON.parse(fs.readFileSync(manualFile, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);

  return (data.servers || []).map((s) =>
    toCatalogServer({
      id: s.slug || slugify(s.name),
      slug: s.slug || slugify(s.name),
      name: s.name,
      description: s.description || '',
      category: s.category,
      official: Boolean(s.official),
      transport: s.transport || 'stdio',
      tools: s.tools || [],
      github_url: s.github_url,
      docs_url: s.docs_url,
      stars: s.stars || 0,
      source: 'manual',
      last_updated: today,
      icon: s.icon,
      mcp_endpoint: s.mcp_endpoint,
      deployment_url: s.mcp_endpoint || s.deployment_url,
    }),
  );
}

function printSummary(servers, stats) {
  const bySource = {};
  const byCategory = {};
  for (const s of servers) {
    bySource[s.source] = (bySource[s.source] || 0) + 1;
    byCategory[s.category] = (byCategory[s.category] || 0) + 1;
  }

  console.log('\n══════════ Summary ══════════');
  console.log(`Fetched (raw):     ${stats.fetched}`);
  console.log(`After dedupe:      ${stats.deduped}`);
  console.log(`After noise filter:${stats.filtered}`);
  console.log(`Final count:       ${servers.length}`);
  console.log('\nBy source:');
  for (const [k, v] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('\nBy category:');
  for (const cat of STANDARD_CATEGORIES) {
    console.log(`  ${cat}: ${byCategory[cat] || 0}`);
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const stats = { fetched: 0, deduped: 0, filtered: 0 };

  const manual = loadManualServers();
  console.log(`📦 Manual seed: ${manual.length} servers`);

  let glama = [];
  try {
    glama = await fetchGlamaServers();
  } catch (err) {
    console.error('❌ Glama pipeline error:', err.message);
  }

  let smithery = [];
  try {
    smithery = await fetchSmitheryServers();
  } catch (err) {
    console.error('❌ Smithery pipeline error:', err.message);
  }

  let awesome = [];
  try {
    awesome = await fetchAwesomeMcpServers();
  } catch (err) {
    console.error('❌ Awesome MCP error:', err.message);
  }

  const combined = [...manual, ...glama, ...smithery, ...awesome];
  stats.fetched = combined.length;

  let servers = dedupeServers(combined);
  stats.deduped = servers.length;

  servers = filterNoise(servers);
  stats.filtered = servers.length;

  servers = ensureUniqueSlugs(servers);

  const { enrichSmitheryTools } = require('./utils/enrich-tools');
  const { attachSetupInfo } = require('./utils/setup-info');
  await enrichSmitheryTools(servers, { delayMs: 80, logEvery: 25, allSmithery: true });
  for (let i = 0; i < servers.length; i++) {
    servers[i] = attachSetupInfo(servers[i]);
  }

  servers.sort((a, b) => (b.stars || 0) - (a.stars || 0) || a.name.localeCompare(b.name));

  const output = {
    generated_at: generatedAt,
    categories: STANDARD_CATEGORIES,
    servers,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');

  const lastUpdated = {
    iso: generatedAt,
    display: new Date(generatedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
  fs.writeFileSync(LAST_UPDATED_PATH, JSON.stringify(lastUpdated, null, 2) + '\n');

  printSummary(servers, stats);
  console.log(`\n💾 Wrote ${OUT_PATH}`);
  console.log(`💾 Wrote ${LAST_UPDATED_PATH}`);

  console.log('\n📌 Building Top 100 slice…');
  const { buildTop100FromCatalog } = require('./build-top100');
  const top100Payload = buildTop100FromCatalog(output);
  output.top100_slugs = top100Payload.top100_slugs;
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
  fs.writeFileSync(
    path.join(ROOT, 'data', 'servers-top100.json'),
    JSON.stringify(top100Payload, null, 2) + '\n',
  );
  console.log(`✅ Top 100: ${top100Payload.count} servers → data/servers-top100.json`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
