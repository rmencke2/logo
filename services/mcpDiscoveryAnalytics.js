/**
 * Usage analytics for Influzer MCP Discovery (POST /mcp/discovery).
 *
 * One row per JSON-RPC message: initialize, tools/list, tools/call, ping, etc.
 */

const { getDatabase } = require('../database');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function clip(value, max) {
  if (value == null || value === '') return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function emptyStats(days) {
  return {
    days,
    totalCalls: 0,
    uniqueIps: 0,
    toolCalls: 0,
    failedCalls: 0,
    byMethod: [],
    byTool: [],
    byClient: [],
    byDay: [],
  };
}

async function ensureMcpDiscoveryAnalyticsTables() {
  const db = await getDatabase();
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS mcp_discovery_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rpc_method TEXT NOT NULL,
      tool_name TEXT,
      success INTEGER DEFAULT 1,
      error_message TEXT,
      duration_ms INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      client_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  );
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_mcp_discovery_calls_created ON mcp_discovery_calls(created_at)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_mcp_discovery_calls_rpc ON mcp_discovery_calls(rpc_method)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_mcp_discovery_calls_tool ON mcp_discovery_calls(tool_name)');
}

function getClientIp(req) {
  const forwardedFor = req?.headers?.['x-forwarded-for'];
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim() || null;
  return req?.ip || req?.connection?.remoteAddress || null;
}

function inferClientName(rpcMethod, params, userAgent) {
  const fromInit =
    params?.clientInfo?.name || params?.client_info?.name || params?.clientInfo?.title;
  if (fromInit) return clip(fromInit, 80);

  const ua = String(userAgent || '');
  if (/cursor/i.test(ua)) return 'cursor';
  if (/claude|anthropic/i.test(ua)) return 'claude';
  if (/chatgpt|openai/i.test(ua)) return 'chatgpt';
  if (/vscode|visual studio code/i.test(ua)) return 'vscode';
  return null;
}

async function logMcpDiscoveryCall(entry = {}) {
  const db = await getDatabase();
  await run(
    db,
    `INSERT INTO mcp_discovery_calls
      (rpc_method, tool_name, success, error_message, duration_ms, ip_address, user_agent, client_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clip(entry.rpcMethod || 'unknown', 80) || 'unknown',
      entry.toolName ? clip(entry.toolName, 80) : null,
      entry.success === false ? 0 : 1,
      entry.errorMessage ? clip(entry.errorMessage, 300) : null,
      Number.isFinite(entry.durationMs) ? Math.max(0, Math.round(entry.durationMs)) : null,
      entry.ipAddress ? clip(entry.ipAddress, 80) : null,
      entry.userAgent ? clip(entry.userAgent, 240) : null,
      entry.clientName ? clip(entry.clientName, 80) : null,
    ],
  );
}

function recordMcpDiscoveryCall(req, details = {}) {
  const userAgent = req?.headers?.['user-agent'] || '';
  logMcpDiscoveryCall({
    rpcMethod: details.rpcMethod,
    toolName: details.toolName,
    success: details.success,
    errorMessage: details.errorMessage,
    durationMs: details.durationMs,
    ipAddress: getClientIp(req),
    userAgent,
    clientName: inferClientName(details.rpcMethod, details.params, userAgent),
  }).catch(() => {});
}

async function getMcpDiscoveryAnalytics(days = 7) {
  const windowDays = Number(days);
  const safeDays = Number.isFinite(windowDays) && windowDays > 0 ? Math.min(windowDays, 90) : 7;
  const sinceExpr = `-${safeDays} days`;

  try {
    const db = await getDatabase();
    const totals = await get(
      db,
      `SELECT
         COUNT(*) as total_calls,
         COUNT(DISTINCT ip_address) as unique_ips,
         SUM(CASE WHEN rpc_method = 'tools/call' THEN 1 ELSE 0 END) as tool_calls,
         SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_calls
       FROM mcp_discovery_calls
       WHERE created_at > datetime('now', ?)`,
      [sinceExpr],
    );
    const byMethod = await all(
      db,
      `SELECT rpc_method as rpcMethod, COUNT(*) as calls,
              SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
       FROM mcp_discovery_calls
       WHERE created_at > datetime('now', ?)
       GROUP BY rpc_method
       ORDER BY calls DESC`,
      [sinceExpr],
    );
    const byTool = await all(
      db,
      `SELECT tool_name as toolName, COUNT(*) as calls,
              SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
              AVG(duration_ms) as avgDurationMs
       FROM mcp_discovery_calls
       WHERE created_at > datetime('now', ?) AND rpc_method = 'tools/call' AND tool_name IS NOT NULL
       GROUP BY tool_name
       ORDER BY calls DESC`,
      [sinceExpr],
    );
    const byClient = await all(
      db,
      `SELECT COALESCE(NULLIF(client_name, ''), 'unknown') as clientName,
              COUNT(*) as calls,
              COUNT(DISTINCT ip_address) as uniqueIps
       FROM mcp_discovery_calls
       WHERE created_at > datetime('now', ?)
       GROUP BY COALESCE(NULLIF(client_name, ''), 'unknown')
       ORDER BY calls DESC
       LIMIT 15`,
      [sinceExpr],
    );
    const byDay = await all(
      db,
      `SELECT DATE(created_at) as day,
              COUNT(*) as calls,
              SUM(CASE WHEN rpc_method = 'tools/call' THEN 1 ELSE 0 END) as toolCalls
       FROM mcp_discovery_calls
       WHERE created_at > datetime('now', ?)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [sinceExpr],
    );

    return {
      days: safeDays,
      totalCalls: totals?.total_calls || 0,
      uniqueIps: totals?.unique_ips || 0,
      toolCalls: totals?.tool_calls || 0,
      failedCalls: totals?.failed_calls || 0,
      byMethod,
      byTool,
      byClient,
      byDay,
    };
  } catch (err) {
    if (String(err.message || '').includes('no such table')) {
      return emptyStats(safeDays);
    }
    throw err;
  }
}

module.exports = {
  ensureMcpDiscoveryAnalyticsTables,
  logMcpDiscoveryCall,
  recordMcpDiscoveryCall,
  getMcpDiscoveryAnalytics,
  getClientIp,
  inferClientName,
};
