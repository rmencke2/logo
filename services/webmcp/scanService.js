'use strict';

/**
 * Orchestrate WebMCP scan → scorecard → newsletter → catalog publish.
 */

const { assertSafePublicUrl } = require('./ssrf');
const { scanWebsite } = require('./scanner');
const { buildScorecard, suggestJourneys } = require('./scorecard');
const { publishScannedSite } = require('./catalogPublisher');
const {
  createScan,
  updateScanProgress,
  finishScan,
  getScan,
  countRecentScansByIp,
  ensureScanTables,
} = require('./scanStore');
const { subscribeToNewsletter } = require('../newsletterService');

const RATE_LIMIT_PER_HOUR = Number(process.env.WEBMCP_SCAN_RATE_LIMIT || 5);
const running = new Set();

function publicScanView(scan) {
  if (!scan) return null;
  return {
    id: scan.id,
    host: scan.host,
    url: scan.url,
    status: scan.status,
    progress: scan.progress,
    scorecard: scan.scorecard,
    published: scan.published,
    newsletter_subscribed: scan.newsletter_subscribed,
    error: scan.error,
    created_at: scan.created_at,
    finished_at: scan.finished_at,
    result: scan.result
      ? {
          host: scan.result.host,
          canonical_url: scan.result.canonical_url,
          pages_scanned: scan.result.pages_scanned,
          crashes: scan.result.crashes,
          elapsed_ms: scan.result.elapsed_ms,
          tool_count: scan.result.tools?.length || 0,
          tools: (scan.result.tools || []).map((t) => ({
            name: t.name,
            description: t.description,
            kind: t.kind,
            page_url: t.page_url,
          })),
          journeys: scan.result.journeys || [],
          pages: (scan.result.pages || []).map((p) => ({
            path: p.path,
            ok: p.ok,
            tool_count: p.tool_count,
            error: p.error || null,
          })),
        }
      : null,
    directory_url: scan.host ? `https://www.influzer.ai/webmcp/sites/${scan.host}` : null,
    demo_hint: 'https://www.influzer.ai/webmcp/demo',
  };
}

async function startWebmcpScan({
  url,
  email,
  relationship = 'owner',
  ip = 'unknown',
  newsletterOptIn = true,
  clearCache,
}) {
  await ensureScanTables();

  const recent = await countRecentScansByIp(ip);
  if (recent >= RATE_LIMIT_PER_HOUR) {
    const err = new Error('Too many scans from this IP. Please try again later.');
    err.code = 'RATE_LIMIT';
    throw err;
  }

  const safe = await assertSafePublicUrl(url);
  const id = await createScan({
    url: safe.href,
    host: safe.host,
    email,
    relationship,
    ip,
  });

  // Fire-and-forget worker
  setImmediate(() => {
    runScanJob(id, {
      url: safe.href,
      email,
      newsletterOptIn,
      clearCache,
    }).catch((err) => {
      console.error('WebMCP scan job failed:', id, err);
    });
  });

  return getScan(id);
}

async function runScanJob(id, { url, email, newsletterOptIn, clearCache }) {
  if (running.has(id)) return;
  running.add(id);
  let newsletter = false;

  try {
    await updateScanProgress(id, {
      status: 'running',
      phase: 'newsletter',
      message: newsletterOptIn ? 'Saving email & starting scan…' : 'Starting scan…',
    });

    if (newsletterOptIn && email) {
      try {
        const sub = await subscribeToNewsletter(email, 'webmcp-submit', 'scan');
        newsletter = Boolean(sub?.success);
      } catch (err) {
        console.warn('WebMCP newsletter subscribe failed:', err.message);
      }
    }

    const result = await scanWebsite({
      url,
      onProgress: (patch) => {
        updateScanProgress(id, patch).catch(() => {});
      },
    });

    const scorecard = buildScorecard({
      tools: result.tools,
      pagesScanned: result.pages_scanned,
      crashes: result.crashes,
      host: result.host,
    });
    result.journeys = suggestJourneys(result.tools, result.host);
    result.scorecard = scorecard;

    let published = false;
    let publishReason = 'not_eligible';
    if (result.tools.length > 0) {
      await updateScanProgress(id, {
        status: 'running',
        phase: 'publishing',
        message: 'Publishing to Influzer WebMCP Directory…',
        tools_detected: result.tools.length,
        pages_scanned: result.pages_scanned,
        crashes: result.crashes,
      });
      const pub = publishScannedSite({
        scanResult: result,
        scorecard,
        clearCache,
      });
      published = Boolean(pub.published);
      publishReason = pub.reason;
    } else {
      publishReason = 'no_tools';
    }

    await finishScan(id, {
      status: 'completed',
      result: { ...result, publish_reason: publishReason },
      scorecard,
      published,
      newsletter,
      error: null,
    });
  } catch (err) {
    await finishScan(id, {
      status: 'failed',
      result: null,
      scorecard: null,
      published: false,
      newsletter,
      error: String(err.message || err).slice(0, 500),
    });
  } finally {
    running.delete(id);
  }
}

module.exports = {
  startWebmcpScan,
  getScan,
  publicScanView,
  RATE_LIMIT_PER_HOUR,
};
