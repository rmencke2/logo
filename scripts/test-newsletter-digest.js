#!/usr/bin/env node
/**
 * Sanity-check newsletter digest HTML and the new policy-before-plugins post.
 */

const assert = require('assert');
const path = require('path');
const { buildBlogNewsletterHtml, buildBlogNewsletterText, resolveNewsletterSubject } = require('../emailService');
const { findBlogPostBySlug } = require('../services/staticService');
const { findNewsItemBySlug } = require('../services/newsService');

const post = findBlogPostBySlug('policy-before-plugins-mcp-allowlist');
assert.ok(post, 'Insight post should load');
assert.strictEqual(post.featured, true);
assert.ok(post.newsletterSubject);
assert.ok(post.newsletterIntro);
assert.ok(post.newsletterPullQuote);
assert.ok(post.coverImage.includes('policy-before-plugins'));
assert.ok(post.contentHtml.includes('Policy before plugins'));

const brief = findNewsItemBySlug('policy-before-plugins-mcp-allowlist');
assert.ok(brief, 'Companion brief should load');
assert.strictEqual(brief.relatedInsightSlug, 'policy-before-plugins-mcp-allowlist');

const html = buildBlogNewsletterHtml({
  post,
  postUrl: 'https://www.influzer.ai/insights/policy-before-plugins-mcp-allowlist',
  coverImageUrl: 'https://www.influzer.ai/images/blog/policy-before-plugins-mcp-allowlist-cover.png',
  customIntro: post.newsletterIntro,
  unsubscribeUrl: 'https://www.influzer.ai/newsletter/unsubscribe?token=preview',
  recentMcpServers: [
    { slug: 'example-server', name: 'Example Server', description: 'A test listing', category: 'Dev Tools' },
  ],
  recentBriefs: [
    { slug: 'dont-put-secrets-in-mcp-headers', title: "Don't put secrets in MCP headers", excerpt: 'Header routing footgun.' },
  ],
  aroundTheWeb: [
    { title: 'Building a Pre-Execution Policy Gate for MCP Tool Calls', source: 'Dev.to', url: 'https://example.com/policy-gate' },
  ],
  catalogStat: {
    label: '6,000 MCP servers in the directory',
    detail: 'About 7% have indexed tools.',
  },
  pullQuote: post.newsletterPullQuote,
});

assert.ok(html.includes('Fresh briefs'));
assert.ok(html.includes('From around the web'));
assert.ok(html.includes('New in the MCP directory'));
assert.ok(html.includes('Catalog this week'));
assert.ok(html.includes('POLICY FIRST') || html.includes('allowlist') || html.includes(post.newsletterPullQuote.slice(0, 24)));
assert.ok(html.includes("Don't put secrets in MCP headers"));
assert.ok(html.includes('Example Server'));
assert.ok(html.includes('Pre-Execution Policy Gate'));
assert.ok(html.includes('mencke@gmail.com'));

const text = buildBlogNewsletterText({
  post,
  postUrl: 'https://www.influzer.ai/insights/policy-before-plugins-mcp-allowlist',
  customIntro: post.newsletterIntro,
  unsubscribeUrl: 'https://www.influzer.ai/newsletter/unsubscribe?token=preview',
  recentMcpServers: [{ slug: 'example-server', name: 'Example Server', description: 'A test listing' }],
  recentBriefs: [{ slug: 'dont-put-secrets-in-mcp-headers', title: "Don't put secrets in MCP headers" }],
  aroundTheWeb: [{ title: 'Policy gate', source: 'Dev.to', url: 'https://example.com/policy-gate' }],
  catalogStat: { label: '6,000 MCP servers in the directory' },
  pullQuote: post.newsletterPullQuote,
});
assert.ok(text.includes('Fresh briefs'));
assert.ok(text.includes('From around the web'));
assert.ok(text.includes('Example Server'));

assert.strictEqual(
  resolveNewsletterSubject(post),
  'Your agent can already do more than your policy admits',
);

console.log('newsletter digest + policy-before-plugins content OK');
console.log('subject:', resolveNewsletterSubject(post));
console.log('cover:', path.basename(post.coverImage));
