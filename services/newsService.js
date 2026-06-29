// ================================
//  News Service — curated MCP briefs
// ================================

const fs = require('fs');
const path = require('path');

const NEWS_DIR = path.join(__dirname, '..', 'content', 'news');

function getAllNewsItems() {
  if (!fs.existsSync(NEWS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(NEWS_DIR).filter((file) => file.endsWith('.json'));
  const items = [];

  for (const file of files) {
    try {
      const fullPath = path.join(NEWS_DIR, file);
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

      if (!parsed.slug || !parsed.title || !parsed.date || !parsed.excerpt || !parsed.contentHtml) {
        continue;
      }

      items.push({
        slug: parsed.slug,
        title: parsed.title,
        date: parsed.date,
        excerpt: parsed.excerpt,
        contentHtml: parsed.contentHtml,
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        category: parsed.category || 'MCP Ecosystem',
        sourceName: parsed.sourceName || '',
        sourceUrl: parsed.sourceUrl || '',
        relatedInsightSlug: parsed.relatedInsightSlug || '',
      });
    } catch (error) {
      console.error(`❌ Failed to load news file ${file}:`, error.message);
    }
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return items;
}

function findNewsItemBySlug(slug) {
  return getAllNewsItems().find((item) => item.slug === slug);
}

function formatNewsDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

module.exports = {
  getAllNewsItems,
  findNewsItemBySlug,
  formatNewsDate,
};
