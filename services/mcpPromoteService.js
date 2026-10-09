'use strict';

/**
 * Paid scoreboard pins. Ads, not quality. Two $249 slots ≈ $500/month hosting.
 */

const fs = require('fs');
const path = require('path');
const { findMcpServerBySlug } = require('./mcpDirectoryService');

const SITE_BASE = 'https://www.influzer.ai';
const SLOTS_PATH = path.join(__dirname, '..', 'data', 'mcp-promote-slots.json');
const DEFAULT_REQUESTS_PATH = path.join(__dirname, '..', 'data', 'mcp-promote-requests.json');

const DEFAULT_PRODUCT = {
  id: 'scoreboard-pin',
  name: 'Scoreboard pin',
  price_usd: 249,
  currency: 'usd',
  interval_days: 30,
  max_concurrent: 2,
};

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
    includes: [
      `Pin on /mcp/scoreboard billed monthly ($${product.price_usd}/mo)`,
      'Labeled Sponsored — never mixed into organic handshake rank',
      'Link to your Influzer listing or HTTPS MCP URL',
    ],
    excludes: [
      'Not a SAFE or “approved” badge',
      'Does not change live_ok / auth_required / unreachable',
      'Does not buy Top 100 catalog rank',
    ],
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
  return { email, slug, company, url, note };
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
      'Sponsored pin on the Influzer MCP handshake scoreboard. Not a SAFE badge.',
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
    const err = new Error('Both pins are taken this month. Email hello@influzer.ai to waitlist.');
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
    note: 'Sponsored pin is an ad. Handshake status is not for sale.',
    safety_badge: null,
  };
}

module.exports = {
  loadConfig,
  getActivePins,
  slotsRemaining,
  getPromoteOffer,
  submitPromoteRequest,
  validatePromoteInput,
  isSlotActive,
  DEFAULT_PRODUCT,
};
