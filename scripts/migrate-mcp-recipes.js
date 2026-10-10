// ================================
//  MCP Recipes schema migration
//  Usage: node scripts/migrate-mcp-recipes.js
// ================================

const { getDatabase } = require('../database');
const { initializeRecipeTables } = require('../services/mcpRecipeService');

async function main() {
  const db = await getDatabase();
  await initializeRecipeTables(db);
  console.log('✅ MCP Recipes tables ready');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
