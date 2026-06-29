// Heuristic relevance scoring + optional LLM enrichment.

const { truncate, titleSimilarity } = require('./utils');

function scoreHeuristic(article, config) {
  const text = `${article.title} ${article.raw_summary}`.toLowerCase();
  const scoring = config.scoring || {};
  const allowlist = scoring.allowlist || [];
  const denylist = scoring.denylist || [];
  const boosts = scoring.boostTerms || [];

  let score = 0.15;
  let allowHits = 0;

  for (const term of allowlist) {
    if (text.includes(term.toLowerCase())) {
      allowHits += 1;
      score += 0.08;
    }
  }

  for (const boost of boosts) {
    if (text.includes(boost.term.toLowerCase())) {
      score += Number(boost.weight) || 0.1;
    }
  }

  for (const term of denylist) {
    if (text.includes(term.toLowerCase())) {
      score -= 0.35;
    }
  }

  if (allowHits === 0) score -= 0.2;

  const signal = Number(article.score_signal) || 0;
  if (signal > 0) {
    score += Math.min(0.15, Math.log10(signal + 1) * 0.05);
  }

  return Math.max(0, Math.min(1, score));
}

function fallbackBlurb(article) {
  if (article.raw_summary && article.raw_summary.length > 40) {
    return truncate(article.raw_summary, 160);
  }
  return 'Worth a scan if you are wiring MCP tools or AI agents into your stack.';
}

async function enrichWithLlm(articles, config) {
  const llm = config.llm || {};
  if (!llm.enabled || !process.env.ANTHROPIC_API_KEY) {
    return articles.map((article) => ({
      ...article,
      editorial_blurb: article.editorial_blurb || fallbackBlurb(article),
    }));
  }

  const maxArticles = llm.maxArticles || 20;
  const candidates = [...articles]
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, maxArticles);

  const candidateSet = new Set(candidates.map((a) => a.canonical_url));

  for (const article of candidates) {
    try {
      const result = await callAnthropicHaiku(article, llm.model);
      article.relevance_score = clamp(
        article.relevance_score * 0.45 + result.relevance * 0.55,
      );
      article.editorial_blurb = result.blurb || fallbackBlurb(article);
    } catch (error) {
      article.editorial_blurb = fallbackBlurb(article);
      article.llm_error = error.message;
    }
  }

  return articles.map((article) => {
    if (!candidateSet.has(article.canonical_url)) {
      return {
        ...article,
        editorial_blurb: article.editorial_blurb || fallbackBlurb(article),
      };
    }
    return article;
  });
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

async function callAnthropicHaiku(article, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-haiku-latest',
      max_tokens: 180,
      temperature: 0.4,
      system:
        'You curate MCP (Model Context Protocol) news for developers using AI coding tools. Reply ONLY with compact JSON: {"relevance":0.0-1.0,"blurb":"one punchy sentence"}. Be opinionated and practical.',
      messages: [
        {
          role: 'user',
          content: `Title: ${article.title}\nSource: ${article.source}\nSummary: ${article.raw_summary}\n\nIs this about MCP servers, Model Context Protocol, or AI coding agents (Cursor, Claude Code, etc.)? Score relevance 0-1 and write a one-sentence blurb on why it matters.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = (data.content || []).map((c) => c.text || '').join('\n').trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM response missing JSON');
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    relevance: clamp(Number(parsed.relevance) || 0),
    blurb: String(parsed.blurb || '').trim(),
  };
}

function dedupeArticles(articles, config) {
  const threshold = config.fuzzyTitleSimilarity ?? 0.82;
  const kept = [];

  for (const article of articles) {
    const existing = kept.find(
      (item) =>
        item.canonical_url === article.canonical_url ||
        titleSimilarity(item.title, article.title) >= threshold,
    );

    if (!existing) {
      kept.push(article);
      continue;
    }

    if ((article.score_signal || 0) > (existing.score_signal || 0)) {
      Object.assign(existing, article, {
        source: `${existing.source}, ${article.source}`,
      });
    }
  }

  return kept;
}

module.exports = {
  scoreHeuristic,
  fallbackBlurb,
  enrichWithLlm,
  dedupeArticles,
};
