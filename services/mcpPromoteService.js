'use strict';

/**
 * Paid Sponsored placements. Ads, not quality. Two $249 slots ≈ $500/month hosting.
 * Buyers sit labeled at the top of homepage, /mcp, and the handshake scoreboard.
 */

const fs = require('fs');
const path = require('path');
const { findMcpServerBySlug } = require('./mcpDirectoryService');
const { getPromoteTerms, hasAcceptedPromoteTerms, TERMS_VERSION, TERMS_PATH } = require('./mcpPromoteTerms');

const SITE_BASE = 'https://www.influzer.ai';
const SLOTS_PATH = path.join(__dirname, '..', 'data', 'mcp-promote-slots.json');
const DEFAULT_REQUESTS_PATH = path.join(__dirname, '..', 'data', 'mcp-promote-requests.json');

const DEFAULT_PRODUCT = {
  id: 'scoreboard-pin',
  name: 'Sponsored placement',
  price_usd: 249,
  currency: 'usd',
  interval_days: 30,
  max_concurrent: 2,
};

const PLACEMENTS = [
  {
    id: 'home',
    label: 'Homepage',
    where: 'First band after search — labeled Sponsored, above the fund meter',
  },
  {
    id: 'directory',
    label: 'MCP directory',
    where: 'Top of /mcp and /mcp/all — above the organic Top 100 list',
  },
  {
    id: 'webmcp',
    label: 'WebMCP directory',
    where: 'Top of /webmcp — labeled Sponsored MCP ad (WebMCP is not MCP)',
  },
  {
    id: 'scoreboard',
    label: 'Scoreboard',
    where: 'Pinned above the handshake table — not mixed into rank',
  },
  {
    id: 'listing',
    label: 'Your listing',
    where: 'Sponsored pill on the listing page so the ad is labeled there too',
  },
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadConfig() {
  const raw = readJson(SLOTS_PATH, {});
  return {
    product: { ...DEFAULT_PRODUCT, ...(raw.product || {}) },
    slots: Array.isArray(raw.slots) ? raw.slots : [],
  };
}

function isSlotActive(slot, now = Date.now()) {
  if (!slot || slot.active === false) return false;
  if (slot.starts_at && Date.parse(slot.starts_at) > now) return false;
  if (slot.ends_at && Date.parse(slot.ends_at) <= now) return false;
  return Boolean(slot.slug || slot.name || slot.href);
}

function getActivePins(now = Date.now()) {
  return loadConfig().slots.filter((s) => isSlotActive(s, now)).slice(0, loadConfig().product.max_concurrent);
}

function isSponsoredSlug(slug, now = Date.now()) {
  const needle = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/mcp\//, '');
  if (!needle) return false;
  return getActivePins(now).some((s) => String(s.slug || '').toLowerCase() === needle);
}

function presentPin(slot) {
  const server = slot?.slug ? findMcpServerBySlug(slot.slug) : null;
  const name = (server && server.name) || slot?.name || 'Sponsored listing';
  const href = slot?.href || (server ? `/mcp/${server.slug}` : slot?.url || '/mcp/promote');
  const sourceBlurb = slot?.blurb || (server && server.description) || 'Paid placement. Handshake facts are not for sale.';
  const external = /^https:\/\//i.test(href);
  return {
    filled: true,
    open: false,
    slug: (server && server.slug) || slot?.slug || null,
    name,
    blurb: String(sourceBlurb).replace(/\s+/g, ' ').trim().slice(0, 180),
    href,
    cta: server ? 'Open listing' : 'Visit',
    initial: String(name).charAt(0).toUpperCase() || 'S',
    category: (server && server.category) || '',
    sponsor_label: 'Sponsored',
    sponsored: true,
    safety_badge: null,
    rel: external ? 'noopener noreferrer sponsored' : undefined,
    external,
  };
}

function presentOpenSlot(product = DEFAULT_PRODUCT) {
  return {
    filled: false,
    open: true,
    slug: null,
    name: 'Your server here',
    blurb: `Labeled Sponsored on the homepage, /mcp, /webmcp, and handshake scoreboard. $${product.price_usd}/month. Rank is not for sale.`,
    href: '/mcp/promote',
    cta: 'Buy this slot',
    initial: '+',
    category: '',
    sponsor_label: 'Available',
    sponsored: false,
    safety_badge: null,
    rel: undefined,
    external: false,
  };
}

function presentSponsorRail(now = Date.now()) {
  const { product } = loadConfig();
  const filled = getActivePins(now).map(presentPin);
  const remaining = Math.max(0, product.max_concurrent - filled.length);
  const open = Array.from({ length: remaining }, () => presentOpenSlot(product));
  return {
    filled,
    open,
    items: [...filled, ...open],
    max: product.max_concurrent,
    remaining,
    price_usd: product.price_usd,
    kicker: 'Sponsored · paid placement · handshake unchanged',
    safety_badge: null,
  };
}

function slotsRemaining(now = Date.now()) {
  const { product } = loadConfig();
  return Math.max(0, product.max_concurrent - getActivePins(now).length);
}

function getPromoteOffer(now = Date.now()) {
  const { product } = loadConfig();
  const remaining = slotsRemaining(now);
  const monthlyIfSoldOut = product.price_usd * product.max_concurrent;
  const slotsSold = product.max_concurrent - remaining;
  const fundedUsd = slotsSold * product.price_usd;
  const fundedPct = monthlyIfSoldOut ? Math.round((fundedUsd / monthlyIfSoldOut) * 100) : 0;
  return {
    product,
    remaining,
    slots_sold: slotsSold,
    funded_usd: fundedUsd,
    funded_pct: fundedPct,
    sold_out: remaining === 0,
    monthly_if_sold_out_usd: monthlyIfSoldOut,
    stripe_ready: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PROMOTE_PRICE_ID),
    payment_link: process.env.STRIPE_PROMOTE_PAYMENT_LINK || null,
    contact: 'hello@influzer.ai',
    placements: PLACEMENTS,
    includes: [
      `Labeled Sponsored card at the top of the homepage ($${product.price_usd}/mo)`,
      'Labeled Sponsored card at the top of /mcp and /mcp/all',
      'Labeled Sponsored card at the top of /webmcp (MCP ad, not a WebMCP listing)',
      'Labeled Sponsored pin above the handshake scoreboard',
      'Sponsored pill on your listing page',
    ],
    excludes: [
      'Not a SAFE or “approved” badge',
      'Does not change live_ok / auth_required / unreachable',
      'Does not buy Top 100 catalog rank',
    ],
    terms: getPromoteTerms(),
    terms_path: TERMS_PATH,
    terms_version: TERMS_VERSION,
    safety_badge: null,
  };
}

function requestsPath() {
  return process.env.MCP_PROMOTE_REQUESTS_PATH || DEFAULT_REQUESTS_PATH;
}

function appendRequest(record) {
  const filePath = requestsPath();
  const current = readJson(filePath, []);
  const list = Array.isArray(current) ? current : [];
  list.push(record);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2) + '\n');
}

function validatePromoteInput(body) {
  const email = String(body?.email || '')
    .trim()
    .toLowerCase();
  const slug = String(body?.slug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/mcp\//, '');
  const company = String(body?.company || '').trim().slice(0, 120);
  const url = String(body?.url || '').trim();
  const note = String(body?.note || '').trim().slice(0, 500);
  if (!hasAcceptedPromoteTerms(body)) {
    const err = new Error('You must accept the Sponsored Placement Terms before checkout.');
    err.status = 400;
    throw err;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('A real email is required.');
    err.status = 400;
    throw err;
  }
  if (url && !/^https:\/\//i.test(url)) {
    const err = new Error('MCP URL must be https://');
    err.status = 400;
    throw err;
  }
  return {
    email,
    slug,
    company,
    url,
    note,
    accept_terms: true,
    terms_version: TERMS_VERSION,
  };
}

async function createStripeCheckout(input) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  const { product } = loadConfig();
  const params = new URLSearchParams();
  const priceId = process.env.STRIPE_PROMOTE_PRICE_ID;
  // Recurring Stripe prices (Influzer Promo $249/month) need subscription mode.
  const mode = priceId
    ? String(process.env.STRIPE_PROMOTE_MODE || 'subscription')
    : 'payment';
  params.set('mode', mode);
  params.set('success_url', `${SITE_BASE}/mcp/promote?paid=1`);
  params.set('cancel_url', `${SITE_BASE}/mcp/promote?canceled=1`);
  params.set('customer_email', input.email);
  params.set('metadata[slug]', input.slug || '');
  params.set('metadata[company]', input.company || '');
  params.set('metadata[product]', product.id);
  params.set('metadata[terms_version]', input.terms_version || TERMS_VERSION);
  params.set('metadata[terms_accepted]', '1');
  if (priceId) {
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
  } else {
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', product.currency);
    params.set('line_items[0][price_data][unit_amount]', String(Math.round(product.price_usd * 100)));
    params.set('line_items[0][price_data][product_data][name]', `${product.name} (${product.interval_days} days)`);
    params.set(
      'line_items[0][price_data][product_data][description]',
      'Labeled Sponsored placement on the Influzer homepage, /mcp, /webmcp, and handshake scoreboard. Not a SAFE badge.',
    );
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const json = await res.json();
  if (!res.ok || !json.url) {
    const err = new Error(json.error?.message || 'Stripe checkout failed');
    err.status = 502;
    throw err;
  }
  return { id: json.id, url: json.url };
}

async function submitPromoteRequest(body) {
  const offer = getPromoteOffer();
  if (offer.sold_out) {
    const err = new Error('Both sponsored slots are taken this month. Email hello@influzer.ai to waitlist.');
    err.status = 409;
    throw err;
  }
  const input = validatePromoteInput(body);
  if (input.slug && !findMcpServerBySlug(input.slug)) {
    const err = new Error('Unknown listing slug. Submit the server first, or leave slug blank and send the HTTPS URL.');
    err.status = 400;
    throw err;
  }

  const record = {
    ...input,
    created_at: new Date().toISOString(),
    product_id: offer.product.id,
    price_usd: offer.product.price_usd,
    terms_path: TERMS_PATH,
    terms_accepted_at: new Date().toISOString(),
  };
  appendRequest(record);

  const paymentLink = process.env.STRIPE_PROMOTE_PAYMENT_LINK || null;
  let checkout = null;
  try {
    checkout = await createStripeCheckout(input);
  } catch (err) {
    if (process.env.STRIPE_SECRET_KEY) throw err;
  }

  return {
    ok: true,
    remaining: slotsRemaining() - (checkout || paymentLink ? 0 : 0),
    checkout_url: checkout?.url || paymentLink,
    invoice: !checkout && !paymentLink,
    contact: 'hello@influzer.ai',
    note: 'Sponsored placement is an ad on the homepage, directory, and scoreboard. Handshake status is not for sale. Policy violations may be removed without refund.',
    terms_version: TERMS_VERSION,
    terms_path: TERMS_PATH,
    safety_badge: null,
  };
}

module.exports = {
  loadConfig,
  getActivePins,
  presentPin,
  presentOpenSlot,
  presentSponsorRail,
  isSponsoredSlug,
  slotsRemaining,
  getPromoteOffer,
  submitPromoteRequest,
  validatePromoteInput,
  isSlotActive,
  DEFAULT_PRODUCT,
  PLACEMENTS,
  getPromoteTerms,
  TERMS_VERSION,
  TERMS_PATH,
};
