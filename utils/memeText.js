'use strict';

/**
 * Overlay text for FFmpeg drawtext. The filter graph treats colon, comma,
 * backslash, and quotes as syntax, so user text never goes into that string.
 * Callers write this value to a caption file and pass textfile= instead.
 */
function sanitizeMemeText(value) {
  const text = String(value || '')
    .replace(/[^\p{L}\p{N} .,'!?-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return text;
}

function finiteInRange(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

module.exports = {
  sanitizeMemeText,
  finiteInRange,
};
