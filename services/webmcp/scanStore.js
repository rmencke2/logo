'use strict';

/**
 * Persist WebMCP scans in SQLite + keep an in-memory progress map for live UI.
 */

const crypto = require('crypto');
const { getDatabase } = require('../../database');

const progressById = new Map();

function runDb(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getDbRow(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

let ensured = false;

async function ensureScanTables() {
  if (ensured) return;
  const db = await getDatabase();
  await runDb(
    db,
    `CREATE TABLE IF NOT EXISTS webmcp_scans (
      id TEXT PRIMARY KEY,
      host TEXT,
      url TEXT NOT NULL,
      email TEXT,
      relationship TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      progress_json TEXT,
      result_json TEXT,
      scorecard_json TEXT,
      published INTEGER DEFAULT 0,
      newsletter_subscribed INTEGER DEFAULT 0,
      ip TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    )`,
  );
  await runDb(db, `CREATE INDEX IF NOT EXISTS idx_webmcp_scans_host ON webmcp_scans(host)`);
  await runDb(db, `CREATE INDEX IF NOT EXISTS idx_webmcp_scans_email ON webmcp_scans(email)`);
  ensured = true;
}

function newScanId() {
  return crypto.randomBytes(12).toString('hex');
}

async function createScan({ url, host, email, relationship, ip }) {
  await ensureScanTables();
  const db = await getDatabase();
  const id = newScanId();
  const progress = {
    status: 'queued',
    phase: 'queued',
    message: 'Scan queued…',
    pages_scanned: 0,
    pages_total: 6,
    tools_detected: 0,
    crashes: 0,
    elapsed_ms: 0,
  };
  progressById.set(id, progress);
  await runDb(
    db,
    `INSERT INTO webmcp_scans
      (id, host, url, email, relationship, status, progress_json, ip)
     VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
    [id, host || null, url, email || null, relationship || 'owner', JSON.stringify(progress), ip || null],
  );
  return id;
}

async function updateScanProgress(id, patch) {
  const prev = progressById.get(id) || {};
  const next = { ...prev, ...patch, updated_at: new Date().toISOString() };
  progressById.set(id, next);
  try {
    await ensureScanTables();
    const db = await getDatabase();
    await runDb(
      db,
      `UPDATE webmcp_scans
       SET status = ?, progress_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [next.status || 'running', JSON.stringify(next), id],
    );
  } catch (err) {
    console.warn('webmcp scan progress persist failed:', err.message);
  }
  return next;
}

async function finishScan(id, { status, result, scorecard, published, newsletter, error }) {
  await ensureScanTables();
  const db = await getDatabase();
  const progress = {
    ...(progressById.get(id) || {}),
    status,
    phase: status,
    message:
      status === 'completed'
        ? 'Scan complete'
        : status === 'failed'
          ? error || 'Scan failed'
          : status,
    tools_detected: result?.tools?.length || 0,
    pages_scanned: result?.pages_scanned || 0,
    crashes: result?.crashes || 0,
    elapsed_ms: result?.elapsed_ms || 0,
  };
  progressById.set(id, progress);
  await runDb(
    db,
    `UPDATE webmcp_scans
     SET status = ?, progress_json = ?, result_json = ?, scorecard_json = ?,
         published = ?, newsletter_subscribed = ?, error = ?, host = COALESCE(?, host),
         finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      status,
      JSON.stringify(progress),
      result ? JSON.stringify(result) : null,
      scorecard ? JSON.stringify(scorecard) : null,
      published ? 1 : 0,
      newsletter ? 1 : 0,
      error || null,
      result?.host || null,
      id,
    ],
  );
  return getScan(id);
}

async function getScan(id) {
  await ensureScanTables();
  const live = progressById.get(id);
  const db = await getDatabase();
  const row = await getDbRow(db, 'SELECT * FROM webmcp_scans WHERE id = ?', [id]);
  if (!row) return null;
  const progress = live || safeJson(row.progress_json) || {};
  return {
    id: row.id,
    host: row.host,
    url: row.url,
    email: row.email,
    relationship: row.relationship,
    status: row.status,
    progress,
    result: safeJson(row.result_json),
    scorecard: safeJson(row.scorecard_json),
    published: Boolean(row.published),
    newsletter_subscribed: Boolean(row.newsletter_subscribed),
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    finished_at: row.finished_at,
  };
}

function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function countRecentScansByIp(ip, windowMs = 60 * 60 * 1000) {
  await ensureScanTables();
  const db = await getDatabase();
  const row = await getDbRow(
    db,
    `SELECT COUNT(*) AS c FROM webmcp_scans
     WHERE ip = ? AND created_at >= datetime('now', ?)`,
    [ip, `-${Math.ceil(windowMs / 1000)} seconds`],
  );
  return Number(row?.c || 0);
}

module.exports = {
  ensureScanTables,
  createScan,
  updateScanProgress,
  finishScan,
  getScan,
  countRecentScansByIp,
};
