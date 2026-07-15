/**
 * Influzer MCP Discovery — Streamable HTTP JSON-RPC endpoint (stateless, read-only).
 *
 * Endpoint: POST/GET https://www.influzer.ai/mcp/discovery
 * Cursor config example:
 *   { "mcpServers": { "influzer-discovery": { "url": "https://www.influzer.ai/mcp/discovery" } } }
 */

const rateLimit = require('express-rate-limit');
const { TOOL_DEFINITIONS, handleToolCall } = require('./mcpDiscoveryTools');
const { getDiscoverySetupGuide, MCP_DISCOVERY_SETUP } = require('../data/mcp-discovery-promo');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'influzer-mcp-discovery',
  version: '1.0.0',
};

const discoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.MCP_DISCOVERY_RATE_LIMIT) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many MCP discovery requests — try again later.' },
});

function setDiscoveryCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function dispatchMethod(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    case 'notifications/initialized':
      return null;
    case 'tools/list':
      return { tools: TOOL_DEFINITIONS };
    case 'tools/call': {
      const toolName = params?.name;
      const args = params?.arguments || {};
      if (!toolName) {
        throw Object.assign(new Error('tools/call requires params.name'), { code: -32602 });
      }
      return handleToolCall(toolName, args);
    }
    case 'ping':
      return {};
    default:
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

/**
 * @param {import('express').Request} req
 * @returns {object[]}
 */
function parseJsonRpcBatch(req) {
  const body = req.body;
  if (!body) return [];
  return Array.isArray(body) ? body : [body];
}

function registerMcpDiscoveryRoutes(app) {
  app.get('/mcp/discovery/setup', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const guide = getDiscoverySetupGuide();
    res.render('mcp-discovery-setup', {
      guide,
      canonicalUrl: MCP_DISCOVERY_SETUP,
    });
  });

  app.options('/mcp/discovery', (req, res) => {
    setDiscoveryCors(res);
    res.status(204).end();
  });

  app.get('/mcp/discovery', discoveryLimiter, (req, res) => {
    setDiscoveryCors(res);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      description:
        'Read-only Influzer.ai MCP server directory — search by capability, get setup details, browse topic guides.',
      transport: 'streamable-http',
      protocol: PROTOCOL_VERSION,
      endpoint: 'https://www.influzer.ai/mcp/discovery',
      stateless: true,
      tools: TOOL_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
      })),
      cursor_config: {
        mcpServers: {
          'influzer-discovery': {
            url: 'https://www.influzer.ai/mcp/discovery',
          },
        },
      },
      docs: 'https://www.influzer.ai/insights/what-is-model-context-protocol',
      setup_guide: MCP_DISCOVERY_SETUP,
      directory: 'https://www.influzer.ai/mcp',
    });
  });

  app.post('/mcp/discovery', discoveryLimiter, async (req, res) => {
    setDiscoveryCors(res);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    const messages = parseJsonRpcBatch(req);
    if (!messages.length) {
      return res.status(400).json(jsonRpcError(null, -32600, 'Invalid JSON-RPC request'));
    }

    const responses = [];

    for (const msg of messages) {
      if (!msg || msg.jsonrpc !== '2.0' || !msg.method) continue;

      const isNotification = msg.id === undefined || msg.id === null;
      if (isNotification) {
        if (msg.method === 'notifications/initialized') continue;
        continue;
      }

      try {
        const result = await dispatchMethod(msg.method, msg.params);
        if (result !== null) {
          responses.push(jsonRpcResult(msg.id, result));
        }
      } catch (err) {
        responses.push(jsonRpcError(msg.id, err.code || -32603, err.message || 'Internal error'));
      }
    }

    if (!responses.length) {
      return res.status(202).end();
    }

    if (responses.length === 1) {
      return res.json(responses[0]);
    }
    return res.json(responses);
  });
}

module.exports = {
  registerMcpDiscoveryRoutes,
  SERVER_INFO,
  PROTOCOL_VERSION,
};
