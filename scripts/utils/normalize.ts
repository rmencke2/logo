/**
 * Type definitions for the MCP catalog pipeline.
 * Implementation: normalize.js
 */

export type McpTransport = 'stdio' | 'http' | 'sse' | 'unknown';
export type McpSource = 'glama' | 'smithery' | 'awesome-mcp' | 'manual';

export interface McpTool {
  name: string;
  description: string;
}

export interface Server {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  official: boolean;
  transport: McpTransport;
  tools: McpTool[];
  github_url?: string;
  docs_url?: string;
  stars: number;
  source: McpSource;
  last_updated: string;
  icon?: string;
}

export const STANDARD_CATEGORIES = [
  'Dev Tools',
  'Search & Web',
  'Databases',
  'Design',
  'Cloud & Infra',
  'Communication',
  'Data & Analytics',
  'Security & Monitoring',
  'Payments & Commerce',
  'AI & Memory',
  'Files & Docs',
  'Automation',
] as const;
