'use strict';

/**
 * Index data/webmcp-sites.json without keeping every tool schema in the heap.
 *
 * One JSON.parse of the whole file (~100MB of schemas) crosses Node's heap
 * limit on the 1GB production instance and the process dies. This reads the
 * file as a buffer, parses one site object at a time, and retains a slim
 * record plus the byte range of the original object so a site page can load
 * full schemas on demand.
 */

const fs = require('fs');

function toolSearchText(tool) {
  const props = tool.input_schema?.properties || {};
  const propText = Object.entries(props)
    .map(([key, value]) => `${key} ${value && value.description ? value.description : ''}`)
    .join(' ');
  return [tool.name, tool.description, tool.host, ...(tool.required || []), propText]
    .join(' ')
    .toLowerCase();
}

function slimTool(tool) {
  return {
    name: tool.name,
    description: tool.description,
    kind: tool.kind,
    implementation_type: tool.implementation_type,
    required: Array.isArray(tool.required) ? tool.required : [],
    host: tool.host,
    page_url: tool.page_url,
    stable_key: tool.stable_key,
    search: toolSearchText(tool),
  };
}

function slimSite(site) {
  const tools = Array.isArray(site.tools) ? site.tools.map(slimTool) : [];
  const slim = { ...site, tools };
  return slim;
}

function indexSitesBuffer(raw) {
  const marker = Buffer.from('\n  "sites": [');
  let i = raw.indexOf(marker);
  if (i < 0) {
    throw new Error('webmcp sites array not found');
  }
  i += marker.length;

  const sites = [];
  const ranges = [];
  let inString = false;
  let escape = false;
  let depth = 0;
  let objStart = -1;

  while (i < raw.length) {
    const c = raw[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === 0x5c) escape = true;
      else if (c === 0x22) inString = false;
      i += 1;
      continue;
    }
    if (c === 0x22) {
      inString = true;
      i += 1;
      continue;
    }
    if (c === 0x7b) {
      if (depth === 0) objStart = i;
      depth += 1;
      i += 1;
      continue;
    }
    if (c === 0x7d) {
      depth -= 1;
      if (depth === 0 && objStart >= 0) {
        const objEnd = i + 1;
        const site = JSON.parse(raw.toString('utf8', objStart, objEnd));
        if (site && site.host && site.published !== false) {
          sites.push(slimSite(site));
          ranges.push({ host: site.host, start: objStart, end: objEnd });
        }
        objStart = -1;
      }
      i += 1;
      continue;
    }
    if (c === 0x5d && depth === 0) break;
    i += 1;
  }

  return { sites, ranges };
}

function loadSlimCatalog(filePath) {
  const raw = fs.readFileSync(filePath);
  const { sites, ranges } = indexSitesBuffer(raw);
  const byHost = new Map();
  const rangeByHost = new Map();
  for (let n = 0; n < sites.length; n += 1) {
    byHost.set(sites[n].host, sites[n]);
    rangeByHost.set(ranges[n].host, ranges[n]);
  }
  return { sites, byHost, rangeByHost };
}

function readSiteRange(filePath, range) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const len = range.end - range.start;
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, range.start);
    return JSON.parse(buf.toString('utf8', 0, n));
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = {
  loadSlimCatalog,
  readSiteRange,
  slimTool,
  toolSearchText,
};
