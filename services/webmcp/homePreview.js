'use strict';

/**
 * Homepage preview of data/webmcp-sites.json.
 *
 * The catalog file is ~100MB because every site embeds full tool schemas.
 * catalogPublisher writes sites in tool_count descending order, so the first
 * qualifying rows are the preview. Reading those headers avoids JSON.parse of
 * the whole file, which OOMs the production heap.
 */

const fs = require('fs');

const HEADER_KEYS = new Set([
  'host',
  'slug',
  'name',
  'description',
  'site_type',
  'verification_status',
  'favicon_url',
  'tool_count',
]);

function qualifies(site) {
  return Boolean(site && site.host && (site.site_type === 'live' || site.verification_status === 'verified'));
}

function parseJsonValue(raw) {
  const trimmed = raw.endsWith(',') ? raw.slice(0, -1) : raw;
  return JSON.parse(trimmed);
}

/**
 * @param {string} filePath
 * @param {number} [limit]
 * @returns {Array<object>}
 */
function readHomePreviewSync(filePath, limit = 6) {
  const want = Math.max(1, Number(limit) || 6);
  const fd = fs.openSync(filePath, 'r');
  const chunk = Buffer.alloc(128 * 1024);
  let pending = Buffer.alloc(0);
  let filePos = 0;
  let header = null;
  const picked = [];

  function consider(line) {
    if (header == null) {
      if (line === '    {') header = {};
      return false;
    }
    if (line.startsWith('      "tools"') || line === '    },' || line === '    }') {
      if (qualifies(header)) picked.push(header);
      header = null;
      return picked.length >= want;
    }
    const match = line.match(/^      "([a-z_]+)": (.*)$/);
    if (!match || !HEADER_KEYS.has(match[1])) return false;
    try {
      header[match[1]] = parseJsonValue(match[2]);
    } catch {
      /* skip values that are objects or broken lines */
    }
    return false;
  }

  try {
    for (;;) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, filePos);
      if (n > 0) {
        filePos += n;
        pending = pending.length ? Buffer.concat([pending, chunk.subarray(0, n)]) : Buffer.from(chunk.subarray(0, n));
      }
      let nl = pending.indexOf(0x0a);
      while (nl !== -1) {
        const line = pending.subarray(0, nl).toString('utf8').replace(/\r$/, '');
        pending = pending.subarray(nl + 1);
        if (consider(line)) return picked;
        nl = pending.indexOf(0x0a);
      }
      if (n === 0) {
        if (pending.length && consider(pending.toString('utf8').replace(/\r$/, ''))) return picked;
        return picked;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = {
  readHomePreviewSync,
  qualifies,
};
