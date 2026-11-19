'use strict';

function normalizeUtm(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .slice(0, 120);
  return text || null;
}

function extractUtms(query = {}) {
  return {
    utm_source: normalizeUtm(query.utm_source),
    utm_medium: normalizeUtm(query.utm_medium),
    utm_campaign: normalizeUtm(query.utm_campaign),
    utm_content: normalizeUtm(query.utm_content),
    utm_term: normalizeUtm(query.utm_term),
  };
}

module.exports = {
  normalizeUtm,
  extractUtms,
};
