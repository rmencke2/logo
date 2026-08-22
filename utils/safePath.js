'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Resolve a client-provided /generated_img/... path to an absolute file path
 * inside the generated_img directory. Rejects path traversal.
 *
 * @param {string} logoPath - e.g. /generated_img/foo.png
 * @param {string} projectRoot - absolute path to repo root
 * @returns {{ ok: true, filePath: string } | { ok: false, error: string }}
 */
function resolveGeneratedImgPath(logoPath, projectRoot) {
  if (typeof logoPath !== 'string' || !logoPath.trim()) {
    return { ok: false, error: 'Invalid path' };
  }

  const normalized = logoPath.trim().replace(/\\/g, '/');
  if (!normalized.startsWith('/generated_img/')) {
    return { ok: false, error: 'Path must be under /generated_img/' };
  }

  const relative = normalized.slice('/generated_img/'.length);
  if (!relative || relative.includes('..')) {
    return { ok: false, error: 'Invalid path' };
  }

  const baseDir = path.resolve(projectRoot, 'generated_img');
  const filePath = path.resolve(baseDir, relative);

  if (!filePath.startsWith(`${baseDir}${path.sep}`) && filePath !== baseDir) {
    return { ok: false, error: 'Invalid path' };
  }

  if (!fs.existsSync(filePath)) {
    return { ok: false, error: 'Logo file not found', status: 404 };
  }

  return { ok: true, filePath };
}

module.exports = { resolveGeneratedImgPath };
