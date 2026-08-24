/**
 * Resolve curated MCP comparison pages against the live catalog.
 */

const { findMcpServerBySlug } = require('./mcpDirectoryService');
const { attachBranding } = require('../utils/mcpBranding');
const { getMcpTopicBySlug } = require('../data/mcp-topics');
const { categorySlugFromName } = require('../data/mcp-categories');
const {
  getAllMcpComparisons,
  getMcpComparisonBySlug,
  getMcpComparisonSeoContent,
  getMcpComparisonsIndexSeoContent,
} = require('../data/mcp-comparisons');

function reversedComparisonSlug(slug) {
  const match = String(slug || '').match(/^(.+)-vs-(.+)$/);
  if (!match) return null;
  return `${match[2]}-vs-${match[1]}`;
}

function lookupComparison(slug) {
  const direct = getMcpComparisonBySlug(slug);
  if (direct) return { comparison: direct, isCanonical: true };
  const reversed = reversedComparisonSlug(slug);
  const other = reversed ? getMcpComparisonBySlug(reversed) : null;
  if (other) return { comparison: other, isCanonical: false };
  return { comparison: null, isCanonical: true };
}

function brand(server) {
  return attachBranding(server);
}

function liveTableRows(left, right) {
  const fmtStars = (n) => (n ? Number(n).toLocaleString() : '—');
  return [
    { label: 'Category', left: left.category || '—', right: right.category || '—' },
    {
      label: 'Transport',
      left: left.transportBadge || left.transport || '—',
      right: right.transportBadge || right.transport || '—',
    },
    { label: 'Official listing', left: left.official ? 'Yes' : 'No', right: right.official ? 'Yes' : 'No' },
    {
      label: 'Indexed tools',
      left: String(left.tools?.length || 0),
      right: String(right.tools?.length || 0),
    },
    { label: 'GitHub stars', left: fmtStars(left.stars), right: fmtStars(right.stars) },
  ];
}

function bothServersExist(comparison) {
  return Boolean(findMcpServerBySlug(comparison.leftSlug) && findMcpServerBySlug(comparison.rightSlug));
}

function getComparisonSummaries() {
  return getAllMcpComparisons()
    .filter(bothServersExist)
    .map((comparison) => ({
      slug: comparison.slug,
      title: comparison.title,
      shortTitle: comparison.shortTitle,
      metaDescription: comparison.metaDescription,
      intro: comparison.intro,
      leftSlug: comparison.leftSlug,
      rightSlug: comparison.rightSlug,
    }));
}

function relatedComparisons(comparison) {
  const bySlug = new Map(getAllMcpComparisons().map((c) => [c.slug, c]));
  return (comparison.relatedSlugs || [])
    .map((slug) => bySlug.get(slug))
    .filter((c) => c && c.slug !== comparison.slug && bothServersExist(c));
}

function getComparisonPage(slug) {
  const { comparison, isCanonical } = lookupComparison(slug);
  if (!comparison) return { comparison: null, isCanonical: true };

  const leftRaw = findMcpServerBySlug(comparison.leftSlug);
  const rightRaw = findMcpServerBySlug(comparison.rightSlug);
  if (!leftRaw || !rightRaw) {
    return { comparison: null, isCanonical: true };
  }

  const left = brand(leftRaw);
  const right = brand(rightRaw);
  const relatedTopics = (comparison.relatedTopicSlugs || []).map(getMcpTopicBySlug).filter(Boolean);

  return {
    comparison,
    isCanonical,
    left,
    right,
    tableRows: [...liveTableRows(left, right), ...(comparison.rows || [])],
    related: relatedComparisons(comparison),
    relatedTopics,
    leftCategorySlug: categorySlugFromName(left.category),
    rightCategorySlug: categorySlugFromName(right.category),
    seoContent: getMcpComparisonSeoContent(comparison),
  };
}

function getComparisonsForServer(serverSlug) {
  const slug = String(serverSlug || '');
  return getComparisonSummaries()
    .filter((c) => c.leftSlug === slug || c.rightSlug === slug)
    .map((c) => ({
      slug: c.slug,
      shortTitle: c.shortTitle,
      opponentSlug: c.leftSlug === slug ? c.rightSlug : c.leftSlug,
      href: `/mcp/compare/${c.slug}`,
    }));
}

module.exports = {
  getComparisonSummaries,
  getComparisonPage,
  getComparisonsForServer,
  getMcpComparisonsIndexSeoContent,
  lookupComparison,
};
