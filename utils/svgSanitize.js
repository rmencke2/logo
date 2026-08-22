'use strict';

const LOGO_ICON_MAX_GRAPHEMES = 4;

function escapeSvgText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sanitize user-provided logo icon text (emoji) before embedding in SVG.
 * Rejects markup/control characters; escapes XML entities as defense in depth.
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
function sanitizeLogoIcon(raw) {
  if (raw == null || raw === '') return null;

  const icon = String(raw).trim();
  if (!icon) return null;

  const graphemes = [...icon];
  if (graphemes.length > LOGO_ICON_MAX_GRAPHEMES) {
    throw new Error('Icon is too long');
  }

  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(icon)) {
    throw new Error('Icon contains invalid characters');
  }

  if (/[<>&]/.test(icon)) {
    throw new Error('Icon contains invalid characters');
  }

  return escapeSvgText(icon);
}

module.exports = {
  escapeSvgText,
  sanitizeLogoIcon,
  LOGO_ICON_MAX_GRAPHEMES,
};
