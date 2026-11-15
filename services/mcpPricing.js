'use strict';

/**
 * Optional vendor pricing for MCP directory listings.
 * Stored on manual (or future catalog) rows as `pricing`.
 */

const PRICING_MODELS = Object.freeze(['free', 'freemium', 'paid', 'usage', 'contact']);

const MODEL_LABELS = Object.freeze({
  free: 'Free',
  freemium: 'Freemium',
  paid: 'Paid',
  usage: 'Usage-based',
  contact: 'Contact for pricing',
});

function sanitizeText(input, maxLen) {
  const text = String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

function sanitizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Normalize a pricing payload from JSON / form body.
 * Returns null when empty (no pricing to show).
 * Throws on invalid shapes when `strict` is true.
 */
function normalizePricing(raw, { strict = false } = {}) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    if (strict) throw new Error('Pricing must be an object');
    return null;
  }

  const modelRaw = String(raw.model || '')
    .trim()
    .toLowerCase();
  const model = PRICING_MODELS.includes(modelRaw) ? modelRaw : '';
  const summary = sanitizeText(raw.summary, 280);
  const startingPrice = sanitizeText(raw.starting_price || raw.startingPrice, 40);
  const url = sanitizeUrl(raw.url || raw.pricing_url || raw.pricingUrl);

  if (!model && !summary && !startingPrice && !url) return null;

  if (strict) {
    if (!summary) throw new Error('Pricing summary is required when pricing is set');
    if (modelRaw && !model) {
      throw new Error(`Pricing model must be one of: ${PRICING_MODELS.join(', ')}`);
    }
    if ((raw.url || raw.pricing_url || raw.pricingUrl) && !url) {
      throw new Error('Pricing URL must be a valid http(s) link');
    }
  }

  const out = {};
  if (model) out.model = model;
  if (summary) out.summary = summary;
  if (startingPrice) out.starting_price = startingPrice;
  if (url) out.url = url;
  return Object.keys(out).length ? out : null;
}

function pricingFromEditBody(body = {}) {
  // Explicit clear
  if (body.clearPricing === true || body.pricing === null) return null;

  if (body.pricing && typeof body.pricing === 'object') {
    return normalizePricing(body.pricing, { strict: true });
  }

  // Flat form fields from admin / owner UI
  const hasFlat =
    body.pricingModel != null ||
    body.pricing_summary != null ||
    body.pricingSummary != null ||
    body.pricingStartingPrice != null ||
    body.pricing_url != null ||
    body.pricingUrl != null;

  if (!hasFlat) return undefined; // leave existing pricing untouched

  return normalizePricing(
    {
      model: body.pricingModel,
      summary: body.pricingSummary ?? body.pricing_summary,
      starting_price: body.pricingStartingPrice ?? body.pricing_starting_price,
      url: body.pricingUrl ?? body.pricing_url,
    },
    { strict: true },
  );
}

function attachPricingDisplay(server) {
  const pricing = normalizePricing(server?.pricing);
  if (!pricing) return server;
  return {
    ...server,
    pricing: {
      ...pricing,
      model_label: pricing.model ? MODEL_LABELS[pricing.model] : null,
      glance_value:
        pricing.starting_price ||
        (pricing.model ? MODEL_LABELS[pricing.model] : null) ||
        'See details',
    },
  };
}

module.exports = {
  PRICING_MODELS,
  MODEL_LABELS,
  normalizePricing,
  pricingFromEditBody,
  attachPricingDisplay,
};
