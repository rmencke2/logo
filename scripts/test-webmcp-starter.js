#!/usr/bin/env node
'use strict';

async function main() {
  const assert = require('assert');
  const { buildWebmcpStarter, buildSuggestedTools, inferSiteProfile, slugifyToolName } = require('../services/webmcp/starterGenerator');
  const { aggregatePageSignals } = require('../services/webmcp/scanner');

  assert.equal(slugifyToolName('Search Hackathons!'), 'search_hackathons');
  assert.equal(inferSiteProfile('devpost.com', { headings: ['Hackathons'] }, []), 'hackathons');

  const devpostScan = {
    host: 'devpost.com',
    canonical_url: 'https://devpost.com/',
    pages_scanned: 4,
    tools: [],
    site_signals: {
      nav_links: [
        { path: '/hackathons', text: 'Browse hackathons' },
        { path: '/software', text: 'Projects' },
        { path: '/', text: 'Home' },
      ],
      search_inputs: [{ name: 'search', placeholder: 'Search hackathons', page_url: '/' }],
      forms: [],
      headings: ['Devpost is the home for hackathons'],
      buttons: ['Search hackathons'],
    },
    pages: [{ path: '/', title: 'Devpost - The home for hackathons', ok: true }],
  };

  const suggested = buildSuggestedTools(devpostScan);
  assert.ok(suggested.some((t) => t.name === 'get_site_overview'));
  assert.ok(suggested.some((t) => t.name === 'navigate_to'));
  assert.ok(suggested.some((t) => t.name === 'search_hackathons'));
  assert.ok(suggested.some((t) => t.name === 'open_webmcp_challenge'));

  const starter = buildWebmcpStarter(devpostScan);
  assert.ok(starter.starter_js.includes('document.modelContext.registerTool'));
  assert.ok(starter.starter_js.includes('search_hackathons'));
  assert.ok(starter.starter_js.includes('open_webmcp_challenge'));
  assert.equal(starter.tool_count, suggested.length);
  assert.ok(starter.install_steps.length >= 4);
  assert.ok(['R1', 'R2', 'R3'].includes(starter.estimated_grade_after));
  assert.ok(starter.html_snippet.startsWith('<script>'));

  const withExisting = buildWebmcpStarter({
    ...devpostScan,
    tools: [{ name: 'existing_tool', description: 'Already live' }],
  });
  assert.ok(withExisting.install_steps[0].includes('already exposes'));

  const pages = [
    {
      ok: true,
      path: '/',
      signals: {
        nav_links: [{ path: '/about', text: 'About' }],
        search_inputs: [],
        forms: [],
        headings: ['Hello'],
        buttons: [],
      },
    },
  ];
  const aggregated = aggregatePageSignals(pages);
  assert.equal(aggregated.nav_links.length, 1);
  assert.equal(aggregated.headings[0], 'Hello');

  console.log('webmcp starter generator tests OK');
  console.log(`  devpost starter: ${starter.tool_count} tools → est. ${starter.estimated_grade_after}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
