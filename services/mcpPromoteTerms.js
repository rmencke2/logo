'use strict';

/**
 * Sponsored Placement advertising rules.
 * Buyers must accept before checkout. Influzer may remove ads that break these
 * and keep fees already paid for the period.
 */

const TERMS_VERSION = '2026-10-10';
const TERMS_PATH = '/mcp/promote/terms';

const ALLOWED = [
  'Legitimate Model Context Protocol (MCP) servers, developer tools, and related infrastructure',
  'Honest descriptions of what the server does — no fake “SAFE”, “approved”, or handshake status claims',
  'Company or product names you have the right to promote',
  'Links to your Influzer listing or a real HTTPS MCP endpoint',
];

const PROHIBITED = [
  {
    id: 'adult',
    label: 'Adult / sexual content',
    detail: 'Pornography, sexual services, dating-for-sex, or sexually explicit imagery or tools',
  },
  {
    id: 'gambling',
    label: 'Gambling & betting',
    detail: 'Casinos, sportsbooks, lottery, crypto gambling, or “get rich quick” wagering schemes',
  },
  {
    id: 'illegal',
    label: 'Illegal activity',
    detail: 'Anything illegal where Influzer operates or where the buyer targets users, including stolen goods and unlicensed substances',
  },
  {
    id: 'scam',
    label: 'Scams & fraud',
    detail: 'Phishing, fake credentials, pyramid / MLM schemes, investment scams, or deceptive “AI agent” monetization',
  },
  {
    id: 'malware',
    label: 'Malware & abuse',
    detail: 'Malware, credential theft, unauthorized access tools, spam infrastructure, or weaponized automation',
  },
  {
    id: 'hate',
    label: 'Hate & violence',
    detail: 'Hate speech, harassment, extremism, or promotion of violence against people or groups',
  },
  {
    id: 'weapons',
    label: 'Weapons & dual-use harm',
    detail: 'Firearms sales, explosives, or instructions primarily aimed at causing physical harm',
  },
  {
    id: 'misleading',
    label: 'Misleading ranking claims',
    detail: 'Implying Influzer certified, ranked, or handshaked the listing because of payment',
  },
  {
    id: 'impersonation',
    label: 'Impersonation',
    detail: 'Pretending to be another company, open-source project, or Influzer itself',
  },
];

const REMOVAL_RIGHTS = [
  'Influzer may refuse, pause, edit, or remove a Sponsored placement at any time if it violates these terms, applicable law, or harms the directory’s users or reputation.',
  'If we remove or refuse a placement for a policy violation, fees already paid for that billing period are non-refundable. We may also cancel the Stripe subscription and keep amounts already collected.',
  'We may keep a record of the violation and refuse future promotions from the same buyer or company.',
  'If Influzer removes a placement for our own convenience (not a policy violation), we will offer a pro-rated credit or refund for unused paid time.',
];

function getPromoteTerms() {
  return {
    version: TERMS_VERSION,
    path: TERMS_PATH,
    title: 'Sponsored Placement Terms',
    effective_date: TERMS_VERSION,
    summary:
      'Ads must be legitimate MCP / developer products. No porn, gambling, scams, malware, hate, or illegal offers. We can cancel violating ads and keep the money.',
    allowed: ALLOWED,
    prohibited: PROHIBITED,
    removal_rights: REMOVAL_RIGHTS,
    contact: 'hello@influzer.ai',
    safety_badge: null,
  };
}

function hasAcceptedPromoteTerms(body) {
  const raw = body?.accept_terms ?? body?.acceptTerms ?? body?.terms;
  if (raw === true || raw === 1) return true;
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  return value === '1' || value === 'true' || value === 'on' || value === 'yes';
}

module.exports = {
  TERMS_VERSION,
  TERMS_PATH,
  ALLOWED,
  PROHIBITED,
  REMOVAL_RIGHTS,
  getPromoteTerms,
  hasAcceptedPromoteTerms,
};
