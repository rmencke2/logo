'use strict';

/**
 * Build data/mcp-handshake-diff.json from recent committed validation states.
 * Usage: node scripts/backfill-mcp-handshake-diff.js [commits]
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const {
  diffValidationEntry,
  appendHandshakeEvents,
  COMMITTED_PATH,
} = require('../services/mcpHandshakeDiffService');

const commits = Number(process.argv[2]) || 8;
const revs = execFileSync(
  'git',
  ['rev-list', `--max-count=${commits}`, 'HEAD', '--', 'data/mcp-validation-state.json'],
  { cwd: path.join(__dirname, '..'), encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)
  .reverse();

function loadState(rev) {
  const raw = execFileSync('git', ['show', `${rev}:data/mcp-validation-state.json`], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

let previous = null;
const events = [];
for (const rev of revs) {
  const state = loadState(rev);
  if (previous) {
    const slugs = new Set([
      ...Object.keys(previous.servers || {}),
      ...Object.keys(state.servers || {}),
    ]);
    for (const slug of slugs) {
      const change = diffValidationEntry(previous.servers?.[slug], state.servers?.[slug], {
        slug,
        at: state.last_run,
        source: 'validation',
      });
      if (change) events.push(change);
    }
  }
  previous = state;
}

const added = appendHandshakeEvents(events, { filePath: COMMITTED_PATH });
console.log(`Handshake diff backfill: ${added} new event(s) from ${revs.length} validation states → ${COMMITTED_PATH}`);
