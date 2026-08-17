'use strict';

/**
 * Fetch and normalize the canonical WebMCP standards repository state.
 * Source of truth: https://github.com/webmachinelearning/webmcp
 */

const DEFAULT_REPO = process.env.WEBMCP_STANDARD_REPO || 'webmachinelearning/webmcp';
const DEFAULT_TIMEOUT_MS = Number(process.env.WEBMCP_STANDARD_TIMEOUT_MS || 20000);

async function ghJson(path, { token, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'InfluzerWebMcpStandardTracker/1.0 (+https://www.influzer.ai/webmcp/ecosystem)',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com${path}`, { signal: controller.signal, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GitHub ${res.status} for ${path}: ${body.slice(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function decodeBase64Content(content) {
  return Buffer.from(String(content || '').replace(/\n/g, ''), 'base64').toString('utf8');
}

/**
 * Parse implementation-status.md into structured browser rows.
 */
function parseImplementationStatus(markdown) {
  const text = String(markdown || '');
  const browsers = [];
  const sections = text.split(/\n# /).slice(1); // skip title

  for (const section of sections) {
    const lines = section.split('\n');
    const heading = (lines[0] || '').trim();
    if (!heading || /brave|chrome|edge|firefox|safari/i.test(heading) === false && heading.length > 40) {
      // still allow Brave/Chrome/etc only
    }
    const name = heading.replace(/<[^>]+>/g, '').trim();
    if (!['Brave', 'Chrome', 'Edge', 'Firefox', 'Safari'].includes(name)) continue;

    const body = lines.slice(1).join('\n').trim();
    const lower = body.toLowerCase();
    let support_status = 'unknown';
    let version_or_flag = null;

    if (/origin trial/.test(lower)) {
      support_status = 'origin_trial';
      const ver = body.match(/(?:Chrome|Edge)\s+(\d+)/i);
      if (ver) version_or_flag = `${name} ${ver[1]} origin trial`;
    } else if (/experimental support/.test(lower)) {
      support_status = 'partial';
      version_or_flag = 'Experimental';
    } else if (/standards-positions|bugzilla|webkit standards/.test(lower)) {
      support_status = 'planned';
    } else if (/supported|shipped|stable/.test(lower)) {
      support_status = 'supported';
    }

    const links = [];
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let m;
    while ((m = linkRe.exec(body))) {
      links.push({ label: m[1], url: m[2] });
    }

    browsers.push({
      name,
      slug: name.toLowerCase(),
      group: 'browsers',
      support_status,
      version_or_flag,
      summary: body
        .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 420),
      evidence_url: links[0]?.url || `https://github.com/${DEFAULT_REPO}/blob/main/implementation-status.md`,
      links,
      source: 'implementation-status.md',
    });
  }

  return browsers;
}

function mapBrowserToEcosystemEntry(browser, checkedAt) {
  const sortOrder = { chrome: 10, edge: 20, brave: 30, firefox: 40, safari: 50 };
  return {
    name: browser.name === 'Chrome' ? 'Google Chrome' : browser.name === 'Edge' ? 'Microsoft Edge' : browser.name,
    slug:
      browser.slug === 'chrome'
        ? 'google-chrome'
        : browser.slug === 'edge'
          ? 'microsoft-edge'
          : browser.slug,
    group: 'browsers',
    support_status: browser.support_status,
    version_or_flag: browser.version_or_flag,
    summary: browser.summary,
    evidence_url: browser.evidence_url,
    verified_at: checkedAt.slice(0, 10),
    sort_order: sortOrder[browser.slug] || 99,
    tracked_from: 'webmachinelearning/webmcp',
  };
}

async function fetchStandardSnapshot({
  repo = DEFAULT_REPO,
  token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
  commitCount = 12,
} = {}) {
  const checkedAt = new Date().toISOString();
  const [repoInfo, commits, readmeFile, statusFile] = await Promise.all([
    ghJson(`/repos/${repo}`, { token }),
    ghJson(`/repos/${repo}/commits?per_page=${commitCount}`, { token }),
    ghJson(`/repos/${repo}/contents/README.md`, { token }).catch(() => null),
    ghJson(`/repos/${repo}/contents/implementation-status.md`, { token }).catch(() => null),
  ]);

  const implementationMarkdown = statusFile?.content ? decodeBase64Content(statusFile.content) : '';
  const browsers = parseImplementationStatus(implementationMarkdown);

  const recentCommits = (commits || []).map((c) => ({
    sha: String(c.sha || '').slice(0, 7),
    full_sha: c.sha,
    message: String(c.commit?.message || '')
      .split('\n')[0]
      .slice(0, 200),
    author: c.commit?.author?.name || c.author?.login || 'unknown',
    date: c.commit?.author?.date || null,
    url: c.html_url,
  }));

  return {
    version: 1,
    checked_at: checkedAt,
    repo: {
      full_name: repoInfo.full_name,
      description: repoInfo.description,
      html_url: repoInfo.html_url,
      homepage: repoInfo.homepage,
      default_branch: repoInfo.default_branch,
      stars: repoInfo.stargazers_count,
      forks: repoInfo.forks_count,
      open_issues: repoInfo.open_issues_count,
      pushed_at: repoInfo.pushed_at,
      updated_at: repoInfo.updated_at,
      license: repoInfo.license?.spdx_id || null,
      head_sha: recentCommits[0]?.full_sha || null,
      head_sha_short: recentCommits[0]?.sha || null,
    },
    links: {
      github: repoInfo.html_url,
      homepage: repoInfo.homepage,
      implementation_status: `${repoInfo.html_url}/blob/main/implementation-status.md`,
      explainer: repoInfo.homepage || `${repoInfo.html_url}#readme`,
      npm_types: 'https://www.npmjs.com/package/webmcp-types',
      chrome_docs: 'https://developer.chrome.com/docs/ai/webmcp',
    },
    recent_commits: recentCommits,
    implementation_browsers: browsers,
    readme_excerpt: readmeFile?.content
      ? decodeBase64Content(readmeFile.content).split('\n').slice(0, 12).join('\n')
      : null,
  };
}

module.exports = {
  fetchStandardSnapshot,
  parseImplementationStatus,
  mapBrowserToEcosystemEntry,
  DEFAULT_REPO,
};
