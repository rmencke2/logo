'use strict';

/**
 * Per-listing install snippets for Cursor, Claude, ChatGPT, Claude Code, and ACP.
 * Remote HTTPS is the org path. Stdio is labeled Cursor/CLI-only.
 */

const SITE_BASE = 'https://www.influzer.ai';

function configKey(slug) {
  const raw = String(slug || 'mcp-server')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw.slice(0, 64) || 'mcp-server';
}

function httpsRemoteUrl(server) {
  const candidates = [server.mcp_endpoint, server.deployment_url, server.connection_url];
  for (const candidate of candidates) {
    const url = String(candidate || '').trim();
    if (/^https:\/\//i.test(url)) return url;
  }
  return null;
}

function parseStdioFromInstall(installCommand) {
  const cmd = String(installCommand || '').trim();
  if (!cmd) return null;
  const npx = cmd.match(/\bnpx\s+(?:-y\s+)?(\S+)/);
  if (npx) {
    return { command: 'npx', args: ['-y', npx[1]] };
  }
  return null;
}

function cursorRemoteJson(key, url) {
  return JSON.stringify({ mcpServers: { [key]: { url } } }, null, 2);
}

function cursorStdioJson(key, stdio) {
  return JSON.stringify(
    { mcpServers: { [key]: { command: stdio.command, args: stdio.args } } },
    null,
    2,
  );
}

function acpHttpJson(key, url) {
  return JSON.stringify(
    [
      {
        type: 'http',
        name: key,
        url,
      },
    ],
    null,
    2,
  );
}

function acpStdioJson(key, stdio) {
  return JSON.stringify(
    [
      {
        type: 'stdio',
        name: key,
        command: stdio.command,
        args: stdio.args,
        env: [],
      },
    ],
    null,
    2,
  );
}

function claudeCodeHttp(key, url) {
  return `claude mcp add --transport http ${key} \\\n  ${url}`;
}

function markdownBlock(title, lang, code) {
  if (!code) return '';
  return `### ${title}\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
}

/**
 * @param {object} server
 */
function buildInstallSnippets(server) {
  if (!server || !server.slug) return null;

  const key = configKey(server.slug);
  const remoteUrl = httpsRemoteUrl(server);
  const stdio = parseStdioFromInstall(server.install_command);
  const quality = server.quality || {};
  const pageUrl = `${SITE_BASE}/mcp/${server.slug}`;
  const probeUrl = remoteUrl
    ? `${SITE_BASE}/api/v1/probe?url=${encodeURIComponent(remoteUrl)}`
    : null;
  const installApi = `${SITE_BASE}/api/v1/install/${server.slug}`;
  const markdownUrl = `${SITE_BASE}/embed/mcp/${server.slug}.md`;

  const chatUnavailable =
    'This listing has no public HTTPS MCP URL. Claude and ChatGPT connectors cannot reach localhost / stdio. Use Cursor or Claude Code, or ask the vendor for a remote endpoint.';

  const clients = {
    cursor: remoteUrl
      ? {
          available: true,
          label: 'Cursor',
          summary: 'Paste into Settings → MCP or .cursor/mcp.json.',
          language: 'json',
          code: cursorRemoteJson(key, remoteUrl),
        }
      : stdio
        ? {
            available: true,
            label: 'Cursor',
            summary: 'Local stdio — laptop only. Not an org-wide connector.',
            language: 'json',
            code: cursorStdioJson(key, stdio),
          }
        : {
            available: false,
            label: 'Cursor',
            summary: 'No remote URL or npx install command on this listing.',
            language: 'text',
            code: '',
          },
    claude: remoteUrl
      ? {
          available: true,
          label: 'Claude',
          summary: 'Settings → Connectors → Add → Custom → Web. Paste the URL. Enable in a new chat.',
          language: 'text',
          code: [
            'Claude → Settings → Connectors → Add → Custom → Web',
            `Name: ${server.name}`,
            `URL: ${remoteUrl}`,
            'OAuth only if this server requires it.',
            'Save, start a new chat, enable the connector.',
          ].join('\n'),
        }
      : {
          available: false,
          label: 'Claude',
          summary: chatUnavailable,
          language: 'text',
          code: chatUnavailable,
        },
    chatgpt: remoteUrl
      ? {
          available: true,
          label: 'ChatGPT',
          summary: 'Developer mode custom connector. ChatGPT cannot reach localhost.',
          language: 'text',
          code: [
            'Settings → Apps & Connectors → Advanced → Developer mode ON',
            'Create custom connector',
            `Name: ${server.name}`,
            `MCP server URL: ${remoteUrl}`,
            'Auth: none unless the server requires OAuth',
            'New chat → + → Developer mode → enable the connector',
          ].join('\n'),
        }
      : {
          available: false,
          label: 'ChatGPT',
          summary: chatUnavailable,
          language: 'text',
          code: chatUnavailable,
        },
    'claude-code': remoteUrl
      ? {
          available: true,
          label: 'Claude Code',
          summary: 'Register the HTTPS URL, then claude mcp list.',
          language: 'bash',
          code: claudeCodeHttp(key, remoteUrl),
        }
      : server.install_command
        ? {
            available: true,
            label: 'Claude Code',
            summary: 'CLI / stdio install from the listing. Restart the client after.',
            language: 'bash',
            code: server.install_command,
          }
        : {
            available: false,
            label: 'Claude Code',
            summary: 'No install command or remote URL on this listing.',
            language: 'text',
            code: '',
          },
    acp: remoteUrl
      ? {
          available: true,
          label: 'ACP',
          summary: 'Pass on session/new as mcpServers when the agent advertised HTTP MCP.',
          language: 'json',
          code: acpHttpJson(key, remoteUrl),
        }
      : stdio
        ? {
            available: true,
            label: 'ACP',
            summary: 'stdio MCP for ACP session/new. Agent must advertise session.mcp.stdio.',
            language: 'json',
            code: acpStdioJson(key, stdio),
          }
        : {
            available: false,
            label: 'ACP',
            summary: 'No HTTPS URL or parseable npx command to put in mcpServers.',
            language: 'text',
            code: '',
          },
  };

  const note =
    quality.note ||
    'Observable listing facts — not a safe-to-install badge. Handshake tools/list before you connect.';

  const markdown = [
    `## Connect ${server.name} (MCP)`,
    '',
    remoteUrl ? `Remote URL: \`${remoteUrl}\`` : 'No public HTTPS MCP URL on this listing (stdio / docs only).',
    '',
    `Quality: ${quality.demoware_tier_label || 'Unverified'} · Handshake: ${quality.live_status_label || 'Not probed'} · Auth: ${quality.auth_gate_label || 'Unknown'}`,
    '',
    note,
    '',
    markdownBlock('Cursor', 'json', clients.cursor.code).trim(),
    '',
    markdownBlock('Claude Code', 'bash', clients['claude-code'].code).trim(),
    '',
    markdownBlock('ACP mcpServers', 'json', clients.acp.code).trim(),
    '',
    `[${server.name} on Influzer](${pageUrl}) · [Install JSON](${installApi}) · Probe is not a SAFE badge.`,
    '',
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

  const embedHtml = `<div data-influzer-install="${server.slug}"></div>\n<script async src="${SITE_BASE}/embed/install.js"></script>`;

  return {
    ok: true,
    slug: server.slug,
    name: server.name,
    config_key: key,
    remote_url: remoteUrl,
    has_remote: Boolean(remoteUrl),
    stdio_only: !remoteUrl && Boolean(stdio || server.install_command),
    page_url: pageUrl,
    probe_url: probeUrl,
    probe_docs: `${SITE_BASE}/mcp/probe`,
    install_api: installApi,
    markdown_url: markdownUrl,
    quality: {
      demoware_tier: quality.demoware_tier || null,
      demoware_tier_label: quality.demoware_tier_label || null,
      live_status: quality.live_status || null,
      live_status_label: quality.live_status_label || null,
      auth_gate: quality.auth_gate || null,
      safety_badge: null,
      note,
    },
    clients,
    markdown,
    embed_html: embedHtml,
    safety_badge: null,
  };
}

/**
 * Compact payload for Discovery get_mcp_server (no markdown dump).
 */
function slimInstallForAgent(server) {
  const snippets = buildInstallSnippets(server);
  if (!snippets) return null;
  const clients = {};
  for (const id of ['cursor', 'claude', 'chatgpt', 'claude-code', 'acp']) {
    const client = snippets.clients[id];
    if (!client) continue;
    clients[id] = {
      available: client.available,
      label: client.label,
      summary: client.summary,
      language: client.language,
      code: client.code,
    };
  }
  return {
    safety_badge: null,
    has_remote: snippets.has_remote,
    stdio_only: snippets.stdio_only,
    remote_url: snippets.remote_url,
    probe_url: snippets.probe_url,
    install_api: snippets.install_api,
    markdown_url: snippets.markdown_url,
    skill_url: `${SITE_BASE}/skills/influzer-mcp/SKILL.md`,
    skill_page: `${SITE_BASE}/mcp/discovery/skill`,
    clients,
    note: snippets.quality.note,
  };
}

module.exports = {
  buildInstallSnippets,
  slimInstallForAgent,
  configKey,
  httpsRemoteUrl,
  parseStdioFromInstall,
};
