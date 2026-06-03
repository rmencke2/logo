#!/usr/bin/env node
/**
 * Regenerates data/mcp-servers.json from the curated catalog below.
 * Run: node scripts/build-mcp-servers-json.js
 */

const fs = require('fs');
const path = require('path');

const CATEGORIES = [
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
];

/** @param {string} name @param {string} slug @param {string} category @param {string} desc @param {string[]} tools [name, description][] */
function srv(name, slug, category, desc, tools, extra = {}) {
  return {
    name,
    slug,
    category,
    description: desc,
    official: extra.official ?? false,
    transport: extra.transport ?? 'stdio',
    icon: extra.icon ?? 'boxes',
    tools: tools.map(([n, d]) => ({ name: n, description: d })),
    ...(extra.github_url ? { github_url: extra.github_url } : {}),
    ...(extra.docs_url ? { docs_url: extra.docs_url } : {}),
    ...(extra.install_command ? { install_command: extra.install_command } : {}),
    ...(extra.stars ? { stars: extra.stars } : {}),
  };
}

const servers = [
  // —— Dev Tools ——
  srv(
    'GitHub',
    'github',
    'Dev Tools',
    'Repos, pull requests, issues, commits, and code search via the GitHub API.',
    [
      ['search_repositories', 'Search GitHub repositories'],
      ['get_file_contents', 'Read file contents from a repo'],
      ['create_issue', 'Open a new issue'],
      ['create_pull_request', 'Create a pull request'],
      ['list_commits', 'List commits on a branch'],
    ],
    {
      official: true,
      icon: 'github',
      stars: 3800,
      github_url: 'https://github.com/modelcontextprotocol/servers',
      install_command: 'claude mcp add github -- npx -y @modelcontextprotocol/server-github',
    },
  ),
  srv(
    'GitLab',
    'gitlab',
    'Dev Tools',
    'GitLab repositories, merge requests, CI/CD pipelines, and project management.',
    [
      ['list_projects', 'List accessible GitLab projects'],
      ['get_merge_requests', 'List and inspect merge requests'],
      ['get_pipeline_status', 'Check CI pipeline status'],
      ['search_code', 'Search code across repositories'],
    ],
    { icon: 'gitlab', github_url: 'https://github.com/zereight/gitlab-mcp' },
  ),
  srv(
    'Desktop Commander',
    'desktop-commander',
    'Dev Tools',
    'Terminal access, process management, and ripgrep-powered search on the local machine.',
    [
      ['execute_command', 'Run shell commands in a controlled environment'],
      ['list_processes', 'List running processes'],
      ['search_files', 'Ripgrep search across directories'],
      ['read_file', 'Read file contents from disk'],
    ],
    { icon: 'terminal', github_url: 'https://github.com/wonderwhy-er/desktop-commander-mcp' },
  ),
  srv(
    'Filesystem',
    'filesystem',
    'Dev Tools',
    'Official reference server for secure local file read, write, and directory operations within allowed paths.',
    [
      ['read_file', 'Read contents of a file'],
      ['write_file', 'Create or overwrite a file'],
      ['list_directory', 'List files and directories'],
      ['search_files', 'Search for files by pattern'],
    ],
    {
      official: true,
      icon: 'folder',
      stars: 4200,
      github_url: 'https://github.com/modelcontextprotocol/servers',
      install_command:
        'claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /path/to/allowed',
    },
  ),
  srv(
    'E2B',
    'e2b',
    'Dev Tools',
    'Sandboxed cloud code execution environments for running untrusted code safely.',
    [
      ['create_sandbox', 'Provision a new cloud sandbox'],
      ['run_code', 'Execute code in the sandbox'],
      ['upload_file', 'Upload a file to the sandbox'],
      ['download_file', 'Download results from the sandbox'],
    ],
    { icon: 'sandbox', docs_url: 'https://e2b.dev/docs', github_url: 'https://github.com/e2b-dev/mcp-server' },
  ),
  srv(
    'Context7',
    'context7',
    'Dev Tools',
    'Live versioned documentation fetching for libraries and frameworks.',
    [
      ['resolve-library-id', 'Resolve a package name to Context7 ID'],
      ['get-library-docs', 'Fetch up-to-date documentation for a library'],
    ],
    {
      icon: 'book-open',
      transport: 'http',
      stars: 2100,
      github_url: 'https://github.com/upstash/context7',
      docs_url: 'https://context7.com',
    },
  ),
  srv(
    'Sourcegraph Cody',
    'sourcegraph-cody',
    'Dev Tools',
    'Semantic codebase search and navigation across large repositories.',
    [
      ['search_code', 'Semantic search across codebases'],
      ['find_references', 'Find symbol references'],
      ['explain_symbol', 'Explain a function or type in context'],
    ],
    { icon: 'code', docs_url: 'https://sourcegraph.com/cody', github_url: 'https://github.com/sourcegraph/cody' },
  ),
  srv(
    'Replit',
    'replit',
    'Dev Tools',
    'Cloud coding environments: create repls, run code, and manage projects remotely.',
    [
      ['create_repl', 'Create a new Replit project'],
      ['run_code', 'Execute code in a repl'],
      ['list_files', 'List project files'],
      ['deploy', 'Deploy a repl application'],
    ],
    { icon: 'cloud-code', docs_url: 'https://docs.replit.com' },
  ),
  srv(
    'StackBlitz',
    'stackblitz',
    'Dev Tools',
    'Browser-based dev environments with instant Node and web project bootstrapping.',
    [
      ['open_project', 'Open or create a StackBlitz project'],
      ['run_dev_server', 'Start the development server'],
      ['edit_file', 'Update project files'],
    ],
    { icon: 'browser', docs_url: 'https://developer.stackblitz.com' },
  ),
  srv(
    'Linear',
    'linear',
    'Dev Tools',
    'Issue tracking, sprints, roadmaps, and engineering workflow in Linear.',
    [
      ['search_issues', 'Search issues by query'],
      ['create_issue', 'Create a new issue'],
      ['update_issue', 'Update issue fields'],
      ['list_cycles', 'List team cycles and roadmaps'],
    ],
    { icon: 'layout-list', stars: 920, github_url: 'https://github.com/jerhadad/linear-mcp-server', docs_url: 'https://linear.app/docs' },
  ),

  // —— Search & Web ——
  srv(
    'Brave Search',
    'brave-search',
    'Search & Web',
    'Web search via the Brave Search API for up-to-date information retrieval.',
    [
      ['brave_web_search', 'Search the web via Brave'],
      ['brave_local_search', 'Search local businesses and places'],
    ],
    {
      official: true,
      icon: 'search',
      install_command: 'claude mcp add brave-search -- npx -y @modelcontextprotocol/server-brave-search',
      github_url: 'https://github.com/modelcontextprotocol/servers',
    },
  ),
  srv(
    'Firecrawl',
    'firecrawl',
    'Search & Web',
    'URL-to-clean-Markdown scraping for LLM-ready web content extraction.',
    [
      ['scrape_url', 'Scrape a single URL to markdown'],
      ['crawl_site', 'Crawl a site with depth limits'],
      ['map_site', 'Discover URLs on a domain'],
    ],
    { icon: 'flame', docs_url: 'https://docs.firecrawl.dev', github_url: 'https://github.com/mendableai/firecrawl-mcp-server' },
  ),
  srv(
    'Jina Reader',
    'jina-reader',
    'Search & Web',
    'Web content extraction optimized for readability and RAG pipelines.',
    [
      ['read_url', 'Extract clean content from a URL'],
      ['search_web', 'Search and read top results'],
    ],
    { icon: 'globe', docs_url: 'https://jina.ai/reader' },
  ),
  srv(
    'Fetch',
    'fetch',
    'Search & Web',
    'Raw HTML and Markdown fetching for LLM consumption.',
    [
      ['fetch', 'Fetch a URL and return markdown or HTML content'],
    ],
    {
      official: true,
      icon: 'globe',
      install_command: 'claude mcp add fetch -- npx -y @modelcontextprotocol/server-fetch',
      github_url: 'https://github.com/modelcontextprotocol/servers',
    },
  ),
  srv(
    'Perplexity',
    'perplexity',
    'Search & Web',
    'AI-powered semantic search with cited answers from the web.',
    [
      ['search', 'Run a Perplexity search query'],
      ['ask', 'Ask a question with web grounding'],
    ],
    { icon: 'search', docs_url: 'https://docs.perplexity.ai' },
  ),
  srv('Exa', 'exa', 'Search & Web', 'Neural semantic web search for research and retrieval.', [
    ['search', 'Semantic web search'],
    ['find_similar', 'Find pages similar to a URL'],
    ['get_contents', 'Fetch full text for result URLs'],
  ], { icon: 'search', docs_url: 'https://docs.exa.ai', github_url: 'https://github.com/exa-labs/exa-mcp-server' }),
  srv(
    'Tavily',
    'tavily',
    'Search & Web',
    'Search API optimized for AI agents and research workflows.',
    [
      ['search', 'Agent-optimized web search'],
      ['extract', 'Extract content from URLs'],
    ],
    { icon: 'search', docs_url: 'https://docs.tavily.com', github_url: 'https://github.com/tavily-ai/tavily-mcp' },
  ),
  srv(
    'SearXNG',
    'searxng',
    'Search & Web',
    'Self-hosted meta-search aggregating multiple search engines.',
    [
      ['search', 'Meta-search across configured engines'],
      ['image_search', 'Search images via SearXNG'],
    ],
    { icon: 'search', github_url: 'https://github.com/searxng/searxng' },
  ),
  srv(
    'GPT Researcher',
    'gpt-researcher',
    'Search & Web',
    'Deep research report generation from multi-source web investigation.',
    [
      ['conduct_research', 'Run a deep research task'],
      ['generate_report', 'Produce a structured research report'],
    ],
    { icon: 'book-open', github_url: 'https://github.com/assafelovic/gpt-researcher' },
  ),
  srv(
    'Puppeteer',
    'puppeteer',
    'Search & Web',
    'Headless browser automation for navigation, screenshots, and DOM interaction.',
    [
      ['puppeteer_navigate', 'Navigate to a URL'],
      ['puppeteer_screenshot', 'Capture a screenshot'],
      ['puppeteer_click', 'Click an element'],
      ['puppeteer_evaluate', 'Run JavaScript in the page'],
    ],
    {
      official: true,
      icon: 'monitor',
      install_command: 'claude mcp add puppeteer -- npx -y @modelcontextprotocol/server-puppeteer',
      github_url: 'https://github.com/modelcontextprotocol/servers',
    },
  ),

  // —— Databases ——
  srv(
    'PostgreSQL',
    'postgres',
    'Databases',
    'Full SQL access to PostgreSQL with schema inspection and query execution.',
    [
      ['query', 'Execute SQL queries'],
      ['list_tables', 'List tables in the database'],
      ['describe_table', 'Get column definitions for a table'],
    ],
    {
      official: true,
      icon: 'database',
      install_command:
        'claude mcp add postgres -- npx -y @modelcontextprotocol/server-postgres postgresql://user:pass@localhost/db',
      github_url: 'https://github.com/modelcontextprotocol/servers',
    },
  ),
  srv('MySQL', 'mysql', 'Databases', 'MySQL query and schema tools for relational data access.', [
    ['query', 'Run SQL against MySQL'],
    ['list_tables', 'List database tables'],
    ['describe_table', 'Show table schema'],
  ], { icon: 'database', github_url: 'https://github.com/benborla/mcp-server-mysql' }),
  srv(
    'SQLite',
    'sqlite',
    'Databases',
    'Local SQLite database operations with schema discovery.',
    [
      ['read_query', 'Run SELECT queries'],
      ['write_query', 'Run INSERT/UPDATE/DELETE'],
      ['list_tables', 'List all tables'],
    ],
    { icon: 'database', github_url: 'https://github.com/modelcontextprotocol/servers' },
  ),
  srv(
    'Supabase',
    'supabase',
    'Databases',
    'Postgres plus auth, storage, and edge functions for Supabase projects.',
    [
      ['list_projects', 'List Supabase projects'],
      ['execute_sql', 'Run SQL against a project'],
      ['list_tables', 'List tables in a schema'],
    ],
    { icon: 'database', github_url: 'https://github.com/supabase-community/supabase-mcp', docs_url: 'https://supabase.com/docs' },
  ),
  srv(
    'Neon',
    'neon',
    'Databases',
    'Serverless Postgres with branching via remote HTTP MCP transport.',
    [
      ['run_query', 'Execute SQL on a Neon branch'],
      ['list_branches', 'List database branches'],
      ['create_branch', 'Create a new database branch'],
    ],
    { icon: 'database', transport: 'http', docs_url: 'https://neon.tech/docs', github_url: 'https://github.com/neondatabase/mcp-server-neon' },
  ),
  srv('MongoDB', 'mongodb', 'Databases', 'Document database queries and collection management.', [
    ['find', 'Query documents in a collection'],
    ['aggregate', 'Run aggregation pipelines'],
    ['list_collections', 'List collections in a database'],
  ], { icon: 'database', github_url: 'https://github.com/mongodb-js/mongodb-mcp-server' }),
  srv('Redis', 'redis', 'Databases', 'Key-value store access for cache and session inspection.', [
    ['get', 'Get value by key'],
    ['set', 'Set a key value'],
    ['keys', 'List keys matching a pattern'],
  ], { icon: 'database', github_url: 'https://github.com/redis/mcp-redis' }),
  srv(
    'MotherDuck',
    'motherduck',
    'Databases',
    'Analytical SQL with DuckDB in-process and MotherDuck cloud sync.',
    [
      ['query', 'Run DuckDB SQL queries'],
      ['list_tables', 'List tables and views'],
      ['attach_database', 'Attach a MotherDuck database'],
    ],
    { icon: 'database', docs_url: 'https://motherduck.com/docs', github_url: 'https://github.com/motherduckdb/mcp-server-motherduck' },
  ),
  srv('Milvus', 'milvus', 'Databases', 'Vector database search for embeddings and similarity retrieval.', [
    ['search_vectors', 'Similarity search on embeddings'],
    ['insert_vectors', 'Insert embedding records'],
    ['list_collections', 'List vector collections'],
  ], { icon: 'database', github_url: 'https://github.com/milvus-io/mcp-server-milvus' }),
  srv(
    'MindsDB',
    'mindsdb',
    'Databases',
    'Connect and unify data across platforms and databases as a single MCP server.',
    [
      ['query', 'Query federated data sources'],
      ['list_databases', 'List connected data integrations'],
      ['create_model', 'Create a predictive model'],
    ],
    { icon: 'database', github_url: 'https://github.com/mindsdb/mindsdb', docs_url: 'https://docs.mindsdb.com' },
  ),

  // —— Design ——
  srv(
    'Figma',
    'figma',
    'Design',
    'Live design layers to code via official Figma Dev Mode and REST APIs.',
    [
      ['get_file', 'Fetch Figma file metadata and structure'],
      ['get_node', 'Get details for a specific node'],
      ['export_asset', 'Export images or SVGs from nodes'],
    ],
    { icon: 'figma', github_url: 'https://github.com/GLips/Figma-Context-MCP' },
  ),
  srv(
    'Magic UI',
    'magic-ui',
    'Design',
    'React and Tailwind component library for rapid UI generation.',
    [
      ['list_components', 'Browse available UI components'],
      ['get_component_code', 'Fetch component source code'],
    ],
    { icon: 'figma', github_url: 'https://github.com/magicuidesign/mcp' },
  ),
  srv(
    'Builder Fusion',
    'builder-fusion',
    'Design',
    'Visual canvas with GitHub integration for design-to-code workflows.',
    [
      ['sync_design', 'Sync canvas to repository'],
      ['export_code', 'Export generated code'],
    ],
    { icon: 'figma', docs_url: 'https://www.builder.io' },
  ),
  srv('Canva', 'canva', 'Design', 'Design generation and editing through the Canva API.', [
    ['create_design', 'Create a new design from template'],
    ['export_design', 'Export design assets'],
    ['list_templates', 'Browse design templates'],
  ], { icon: 'image', docs_url: 'https://www.canva.dev/docs' }),
  srv('Storybook', 'storybook', 'Design', 'Component documentation and story access for design systems.', [
    ['list_stories', 'List component stories'],
    ['get_story', 'Get story metadata and args'],
  ], { icon: 'book-open', github_url: 'https://github.com/storybookjs/mcp-storybook' }),
  srv(
    'SlideSpeak',
    'slidespeak',
    'Design',
    'Create presentations and PowerPoints using AI from outlines and data.',
    [
      ['create_presentation', 'Generate a slide deck from a brief'],
      ['add_slide', 'Add a slide to an existing deck'],
      ['export_pptx', 'Export to PowerPoint format'],
    ],
    { icon: 'file-text', github_url: 'https://github.com/SlideSpeak/slidespeak-mcp' },
  ),

  // —— Cloud & Infra ——
  srv('AWS', 'aws', 'Cloud & Infra', 'S3, Lambda, EC2, and other AWS service operations.', [
    ['list_s3_buckets', 'List S3 buckets'],
    ['describe_ec2_instances', 'Describe EC2 instances'],
    ['invoke_lambda', 'Invoke a Lambda function'],
  ], { icon: 'cloud', docs_url: 'https://aws.amazon.com/blogs/aws/aws-mcp-servers/', github_url: 'https://github.com/awslabs/mcp' }),
  srv('Google Cloud', 'google-cloud', 'Cloud & Infra', 'GCP services access for compute, storage, and APIs.', [
    ['list_projects', 'List GCP projects'],
    ['run_gcloud', 'Execute allowed gcloud commands'],
    ['query_bigtable', 'Query Bigtable instances'],
  ], { icon: 'cloud', docs_url: 'https://cloud.google.com/mcp' }),
  srv('Azure', 'azure', 'Cloud & Infra', 'Azure resource management and cloud operations.', [
    ['list_resources', 'List resources in a resource group'],
    ['get_resource', 'Get resource details'],
    ['run_cli', 'Execute allowed Azure CLI commands'],
  ], { icon: 'cloud', docs_url: 'https://learn.microsoft.com/azure' }),
  srv('Vercel', 'vercel', 'Cloud & Infra', 'Deploy projects, manage domains, and view analytics.', [
    ['list_deployments', 'List recent deployments'],
    ['get_deployment', 'Get deployment status'],
    ['add_domain', 'Configure a custom domain'],
  ], { icon: 'cloud', docs_url: 'https://vercel.com/docs', github_url: 'https://github.com/vercel/mcp-handler' }),
  srv('Netlify', 'netlify', 'Cloud & Infra', 'Build and deploy management for Netlify sites.', [
    ['list_sites', 'List Netlify sites'],
    ['trigger_deploy', 'Trigger a new deploy'],
    ['get_build_logs', 'Fetch build logs'],
  ], { icon: 'cloud', docs_url: 'https://docs.netlify.com' }),
  srv(
    'Kubernetes',
    'kubernetes',
    'Cloud & Infra',
    'Cluster and pod management: logs, deployments, and manifests.',
    [
      ['list_pods', 'List pods in a namespace'],
      ['get_pod_logs', 'Stream logs from a pod'],
      ['apply_manifest', 'Apply a YAML manifest'],
    ],
    { icon: 'boxes', github_url: 'https://github.com/Flux159/mcp-server-kubernetes' },
  ),
  srv(
    'Metoro',
    'metoro',
    'Cloud & Infra',
    'Query and interact with Kubernetes environments for observability.',
    [
      ['query_cluster', 'Query cluster metrics and state'],
      ['list_workloads', 'List deployments and services'],
    ],
    { icon: 'boxes', github_url: 'https://github.com/metoro-io/metoro-mcp-server' },
  ),
  srv('Terraform', 'terraform', 'Cloud & Infra', 'Infrastructure-as-code plan, apply, and state operations.', [
    ['plan', 'Run terraform plan'],
    ['apply', 'Apply infrastructure changes'],
    ['show_state', 'Inspect Terraform state'],
  ], { icon: 'boxes', github_url: 'https://github.com/hashicorp/terraform-mcp-server' }),
  srv('Docker', 'docker', 'Cloud & Infra', 'Container build, run, and image management.', [
    ['list_containers', 'List running containers'],
    ['build_image', 'Build a Docker image'],
    ['run_container', 'Start a container'],
  ], { icon: 'boxes', github_url: 'https://github.com/docker/mcp-server' }),
  srv(
    'Microsoft MCP Gateway',
    'microsoft-mcp-gateway',
    'Cloud & Infra',
    'Kubernetes-native reverse proxy for MCP routing in enterprise environments.',
    [
      ['register_server', 'Register an upstream MCP server'],
      ['route_request', 'Route client requests to backends'],
    ],
    { icon: 'cloud', docs_url: 'https://learn.microsoft.com' },
  ),

  // —— Communication ——
  srv(
    'Slack',
    'slack',
    'Communication',
    'Channels, messages, threads, and workspace collaboration.',
    [
      ['list_channels', 'List accessible channels'],
      ['post_message', 'Send a message to a channel'],
      ['get_channel_history', 'Read recent messages'],
    ],
    {
      official: true,
      icon: 'message-square',
      install_command: 'claude mcp add slack -- npx -y @modelcontextprotocol/server-slack',
      github_url: 'https://github.com/modelcontextprotocol/servers',
    },
  ),
  srv('Gmail', 'gmail', 'Communication', 'Read, compose, and search email via Gmail API.', [
    ['search_messages', 'Search inbox messages'],
    ['send_email', 'Compose and send email'],
    ['read_thread', 'Read an email thread'],
  ], { icon: 'mail', github_url: 'https://github.com/GongRzhe/Gmail-MCP-Server' }),
  srv('Google Calendar', 'google-calendar', 'Communication', 'Events, scheduling, and calendar management.', [
    ['list_events', 'List upcoming events'],
    ['create_event', 'Create a calendar event'],
    ['find_free_time', 'Find available time slots'],
  ], { icon: 'calendar', docs_url: 'https://developers.google.com/calendar' }),
  srv('Outlook', 'outlook', 'Communication', 'Microsoft email and calendar access.', [
    ['list_messages', 'List Outlook messages'],
    ['send_mail', 'Send an email'],
    ['list_events', 'List calendar events'],
  ], { icon: 'mail', docs_url: 'https://learn.microsoft.com/graph' }),
  srv('Microsoft Teams', 'microsoft-teams', 'Communication', 'Teams messaging and channel collaboration.', [
    ['list_channels', 'List Teams channels'],
    ['send_message', 'Post a Teams message'],
    ['list_chats', 'List recent chats'],
  ], { icon: 'message-square', docs_url: 'https://learn.microsoft.com/microsoftteams' }),
  srv(
    'Notion',
    'notion',
    'Communication',
    'Pages, databases, blocks, and workspace knowledge management.',
    [
      ['search', 'Search pages and databases'],
      ['get_page', 'Retrieve page content'],
      ['create_page', 'Create a new page'],
    ],
    { icon: 'file-text', github_url: 'https://github.com/makenotion/notion-mcp-server', docs_url: 'https://developers.notion.com' },
  ),
  srv('Confluence', 'confluence', 'Communication', 'Atlassian wiki access for documentation search and edits.', [
    ['search_pages', 'Search Confluence pages'],
    ['get_page', 'Get page content'],
    ['create_page', 'Create a wiki page'],
  ], { icon: 'file-text', docs_url: 'https://developer.atlassian.com/cloud/confluence' }),
  srv('Jira', 'jira', 'Communication', 'Tickets, sprints, and project tracking in Jira.', [
    ['search_issues', 'Search Jira issues'],
    ['create_issue', 'Create a ticket'],
    ['transition_issue', 'Move issue through workflow'],
  ], { icon: 'layout-list', docs_url: 'https://developer.atlassian.com/cloud/jira' }),
  srv('Asana', 'asana', 'Communication', 'Tasks and project management in Asana.', [
    ['list_tasks', 'List tasks in a project'],
    ['create_task', 'Create a new task'],
    ['update_task', 'Update task status'],
  ], { icon: 'layout-list', docs_url: 'https://developers.asana.com' }),
  srv('Monday.com', 'monday', 'Communication', 'Boards, items, and workflow automation on Monday.com.', [
    ['list_boards', 'List workspace boards'],
    ['create_item', 'Add an item to a board'],
    ['update_column', 'Update column values'],
  ], { icon: 'layout-list', docs_url: 'https://developer.monday.com' }),

  // —— Data & Analytics ——
  srv('Google Sheets', 'google-sheets', 'Data & Analytics', 'Spreadsheet read and write via Google Sheets API.', [
    ['read_range', 'Read cell range values'],
    ['write_range', 'Write values to cells'],
    ['list_sheets', 'List tabs in a spreadsheet'],
  ], { icon: 'bar-chart', docs_url: 'https://developers.google.com/sheets/api' }),
  srv('Airtable', 'airtable', 'Data & Analytics', 'Base and table operations for structured data.', [
    ['list_records', 'List records in a table'],
    ['create_record', 'Create a new record'],
    ['update_record', 'Update record fields'],
  ], { icon: 'bar-chart', docs_url: 'https://airtable.com/developers/web/api' }),
  srv('Amplitude', 'amplitude', 'Data & Analytics', 'Product analytics dashboards and event exploration.', [
    ['query_events', 'Query event segments'],
    ['get_chart', 'Fetch chart data'],
  ], { icon: 'bar-chart', docs_url: 'https://www.docs.developers.amplitude.com' }),
  srv('Mixpanel', 'mixpanel', 'Data & Analytics', 'Event analytics and funnel analysis.', [
    ['query_insights', 'Run insights queries'],
    ['export_report', 'Export analytics report'],
  ], { icon: 'bar-chart', docs_url: 'https://developer.mixpanel.com' }),
  srv('Hex', 'hex', 'Data & Analytics', 'Collaborative data notebooks and SQL workspaces.', [
    ['run_cell', 'Execute a notebook cell'],
    ['list_projects', 'List Hex projects'],
  ], { icon: 'bar-chart', docs_url: 'https://learn.hex.tech' }),
  srv('Metabase', 'metabase', 'Data & Analytics', 'BI dashboard querying and question execution.', [
    ['run_question', 'Run a saved Metabase question'],
    ['list_dashboards', 'List dashboards'],
  ], { icon: 'bar-chart', github_url: 'https://github.com/metabase/mcp-metabase' }),
  srv(
    'Snowflake',
    'snowflake',
    'Data & Analytics',
    'Cloud data warehouse SQL and schema inspection.',
    [
      ['run_query', 'Execute a SQL query'],
      ['list_databases', 'List available databases'],
      ['describe_table', 'Show table columns and types'],
    ],
    { icon: 'bar-chart', github_url: 'https://github.com/isaacwasserman/mcp-snowflake-server' },
  ),
  srv('BigQuery', 'bigquery', 'Data & Analytics', 'Google analytics warehouse queries and table management.', [
    ['run_query', 'Execute BigQuery SQL'],
    ['list_datasets', 'List datasets in a project'],
    ['get_table_schema', 'Describe table schema'],
  ], { icon: 'bar-chart', docs_url: 'https://cloud.google.com/bigquery/docs' }),
  srv(
    'Keboola',
    'keboola',
    'Data & Analytics',
    'Data workflows, integrations, and analytics pipelines.',
    [
      ['list_tables', 'List storage tables'],
      ['run_transformation', 'Execute a transformation'],
      ['create_flow', 'Configure a data flow'],
    ],
    { icon: 'bar-chart', github_url: 'https://github.com/keboola/mcp-server', docs_url: 'https://developers.keboola.com' },
  ),
  srv('VegaLite', 'vega-lite', 'Data & Analytics', 'Generate data visualizations from tabular data specs.', [
    ['render_chart', 'Render a Vega-Lite chart'],
    ['validate_spec', 'Validate a visualization spec'],
  ], { icon: 'bar-chart', github_url: 'https://github.com/vega/vega-lite' }),

  // —— Security & Monitoring ——
  srv(
    'Sentry',
    'sentry',
    'Security & Monitoring',
    'Error tracking and issue triage with stack traces and releases.',
    [
      ['list_issues', 'List unresolved issues'],
      ['get_issue_details', 'Get stack trace and context'],
      ['search_events', 'Search error events'],
    ],
    { icon: 'shield-alert', transport: 'http', github_url: 'https://github.com/getsentry/sentry-mcp', docs_url: 'https://docs.sentry.io' },
  ),
  srv(
    'Datadog',
    'datadog',
    'Security & Monitoring',
    'Logs, metrics, and APM for observability-driven debugging.',
    [
      ['query_metrics', 'Query timeseries metrics'],
      ['search_logs', 'Search log indexes'],
      ['list_monitors', 'List configured monitors'],
    ],
    { icon: 'activity', github_url: 'https://github.com/GeLi2001/datadog-mcp-server' },
  ),
  srv('PagerDuty', 'pagerduty', 'Security & Monitoring', 'Incident management and on-call workflows.', [
    ['list_incidents', 'List open incidents'],
    ['acknowledge_incident', 'Acknowledge an incident'],
    ['create_incident', 'Create a new incident'],
  ], { icon: 'shield-alert', docs_url: 'https://developer.pagerduty.com' }),
  srv('Snyk', 'snyk', 'Security & Monitoring', 'Vulnerability scanning for dependencies and containers.', [
    ['test_project', 'Scan project for vulnerabilities'],
    ['list_issues', 'List security issues'],
  ], { icon: 'shield-alert', docs_url: 'https://docs.snyk.io' }),
  srv('SonarQube', 'sonarqube', 'Security & Monitoring', 'Seamless code quality and static analysis integration.', [
    ['analyze_project', 'Run code quality analysis'],
    ['get_issues', 'List code smells and bugs'],
  ], { icon: 'shield-alert', github_url: 'https://github.com/SonarSource/sonarqube-mcp-server' }),
  srv('Grafana', 'grafana', 'Security & Monitoring', 'Dashboard and alert access for metrics visualization.', [
    ['list_dashboards', 'List Grafana dashboards'],
    ['query_datasource', 'Query a Prometheus or Loki datasource'],
  ], { icon: 'activity', github_url: 'https://github.com/grafana/mcp-grafana' }),
  srv('New Relic', 'new-relic', 'Security & Monitoring', 'Observability platform for APM and infrastructure.', [
    ['query_nrql', 'Run NRQL queries'],
    ['list_entities', 'List monitored entities'],
  ], { icon: 'activity', docs_url: 'https://docs.newrelic.com' }),

  // —— Payments & Commerce ——
  srv(
    'Stripe',
    'stripe',
    'Payments & Commerce',
    'Payments, customers, subscriptions, and invoices.',
    [
      ['list_customers', 'List Stripe customers'],
      ['get_payment', 'Retrieve payment intent details'],
      ['list_subscriptions', 'List active subscriptions'],
    ],
    { icon: 'credit-card', docs_url: 'https://stripe.com/docs', github_url: 'https://github.com/stripe/agent-toolkit' },
  ),
  srv('Shopify', 'shopify', 'Payments & Commerce', 'Store, products, orders, and inventory management.', [
    ['list_products', 'List store products'],
    ['get_order', 'Retrieve order details'],
    ['update_inventory', 'Update product inventory'],
  ], { icon: 'credit-card', docs_url: 'https://shopify.dev/docs/api' }),
  srv(
    'Mercado Libre',
    'mercado-libre',
    'Payments & Commerce',
    'Marketplace interaction and product integration for Latin America.',
    [
      ['search_listings', 'Search marketplace listings'],
      ['get_item', 'Get product listing details'],
      ['update_listing', 'Update a product listing'],
    ],
    { icon: 'credit-card', github_url: 'https://github.com/mercadolibre/mcp-mercadolibre' },
  ),
  srv('Mercado Pago', 'mercado-pago', 'Payments & Commerce', 'Latin America payments API for charges and refunds.', [
    ['create_payment', 'Create a payment'],
    ['get_payment_status', 'Check payment status'],
    ['refund_payment', 'Issue a refund'],
  ], { icon: 'credit-card', docs_url: 'https://www.mercadopago.com/developers' }),
  srv(
    'ShopSavvy',
    'shopsavvy',
    'Payments & Commerce',
    'Product and pricing data, barcode and ASIN search, and price history.',
    [
      ['search_product', 'Search by barcode or ASIN'],
      ['get_price_history', 'Fetch historical pricing'],
      ['compare_prices', 'Compare retailer prices'],
    ],
    { icon: 'credit-card', github_url: 'https://github.com/shopsavvy/mcp-server' },
  ),

  // —— AI & Memory ——
  srv(
    'Memory',
    'memory',
    'AI & Memory',
    'Persistent agent memory with entities, relations, and facts across sessions.',
    [
      ['create_entities', 'Create new memory entities'],
      ['search_nodes', 'Search the knowledge graph'],
      ['read_graph', 'Read full memory graph'],
    ],
    {
      official: true,
      icon: 'brain',
      install_command: 'claude mcp add memory -- npx -y @modelcontextprotocol/server-memory',
      github_url: 'https://github.com/modelcontextprotocol/servers',
    },
  ),
  srv('Mem0', 'mem0', 'AI & Memory', 'Long-term memory layer for AI agents across conversations.', [
    ['add_memory', 'Store a new memory'],
    ['search_memory', 'Retrieve relevant memories'],
    ['list_memories', 'List stored memories'],
  ], { icon: 'brain', github_url: 'https://github.com/mem0ai/mem0', docs_url: 'https://docs.mem0.ai' }),
  srv('Zep', 'zep', 'AI & Memory', 'Temporal knowledge graph memory for agents.', [
    ['add_message', 'Add messages to session memory'],
    ['search_facts', 'Search extracted facts'],
    ['get_session', 'Retrieve session context'],
  ], { icon: 'brain', docs_url: 'https://docs.getzep.com', github_url: 'https://github.com/getzep/zep' }),
  srv('OpenRouter', 'openrouter', 'AI & Memory', 'Multi-model API routing across LLM providers.', [
    ['list_models', 'List available models'],
    ['chat_completion', 'Route a chat completion request'],
  ], { icon: 'brain', docs_url: 'https://openrouter.ai/docs' }),
  srv('Replicate', 'replicate', 'AI & Memory', 'Image and video generation via standard MCP calls.', [
    ['run_model', 'Run a Replicate model prediction'],
    ['list_models', 'Browse available models'],
  ], { icon: 'image', docs_url: 'https://replicate.com/docs' }),
  srv('Fal.ai', 'fal-ai', 'AI & Memory', 'Fast AI image and media generation.', [
    ['generate_image', 'Generate an image from prompt'],
    ['get_result', 'Poll generation job status'],
  ], { icon: 'image', docs_url: 'https://fal.ai/docs' }),
  srv('Deepseek', 'deepseek', 'AI & Memory', 'Fallback model switching and Deepseek API access.', [
    ['chat', 'Send a chat completion'],
    ['list_models', 'List Deepseek models'],
  ], { icon: 'brain', docs_url: 'https://api-docs.deepseek.com' }),
  srv('Taskade', 'taskade', 'AI & Memory', 'Workspace memory plus agent automation for tasks.', [
    ['create_task', 'Create a workspace task'],
    ['run_agent', 'Trigger an automation agent'],
    ['search_workspace', 'Search workspace content'],
  ], { icon: 'brain', docs_url: 'https://www.taskade.com/api' }),

  // —— Files & Docs ——
  srv(
    'Google Drive',
    'google-drive',
    'Files & Docs',
    'File listing, search, and read access in Google Drive.',
    [
      ['search', 'Search files in Drive'],
      ['read_file', 'Read file contents'],
      ['list_files', 'List files in a folder'],
    ],
    {
      official: true,
      icon: 'hard-drive',
      install_command: 'claude mcp add gdrive -- npx -y @modelcontextprotocol/server-gdrive',
      github_url: 'https://github.com/modelcontextprotocol/servers',
    },
  ),
  srv('Dropbox', 'dropbox', 'Files & Docs', 'File access and sharing in Dropbox.', [
    ['list_folder', 'List folder contents'],
    ['download_file', 'Download a file'],
    ['upload_file', 'Upload a file'],
  ], { icon: 'hard-drive', docs_url: 'https://www.dropbox.com/developers/documentation' }),
  srv('Box', 'box', 'Files & Docs', 'Enterprise file management and collaboration.', [
    ['search_files', 'Search Box content'],
    ['get_file', 'Download file metadata and content'],
  ], { icon: 'hard-drive', docs_url: 'https://developer.box.com' }),
  srv('OneDrive', 'onedrive', 'Files & Docs', 'Microsoft cloud storage file operations.', [
    ['list_items', 'List OneDrive items'],
    ['read_file', 'Read file content'],
    ['upload_file', 'Upload a file'],
  ], { icon: 'hard-drive', docs_url: 'https://learn.microsoft.com/graph/onedrive' }),
  srv(
    'iMessage',
    'imessage',
    'Files & Docs',
    'Safely query and analyze iMessage conversations including attachments.',
    [
      ['list_conversations', 'List recent conversations'],
      ['search_messages', 'Search message history'],
      ['export_thread', 'Export a conversation thread'],
    ],
    { icon: 'message-square', github_url: 'https://github.com/tylerwince/mcp-imessage' },
  ),
  srv(
    'Playwright',
    'playwright',
    'Files & Docs',
    'Full browser automation and end-to-end testing with Playwright.',
    [
      ['browser_navigate', 'Open a URL in the browser'],
      ['browser_snapshot', 'Capture accessibility snapshot'],
      ['browser_click', 'Click by ref or selector'],
    ],
    { icon: 'monitor-play', github_url: 'https://github.com/executeautomation/mcp-playwright' },
  ),

  // —— Automation ——
  srv(
    'n8n',
    'n8n',
    'Automation',
    'Conversational workflow automation and node orchestration.',
    [
      ['list_workflows', 'List n8n workflows'],
      ['execute_workflow', 'Trigger a workflow run'],
      ['get_execution', 'Get execution status'],
    ],
    { icon: 'boxes', docs_url: 'https://docs.n8n.io', github_url: 'https://github.com/n8n-io/n8n' },
  ),
  srv('Zapier', 'zapier', 'Automation', '5,000+ app integrations via Zapier actions.', [
    ['list_zaps', 'List configured Zaps'],
    ['run_action', 'Execute a Zapier action'],
  ], { icon: 'boxes', docs_url: 'https://platform.zapier.com' }),
  srv(
    'Pipedream',
    'pipedream',
    'Automation',
    'Connect with 2,500 APIs and 8,000+ prebuilt tools.',
    [
      ['list_actions', 'List available actions'],
      ['run_action', 'Execute a connected action'],
    ],
    { icon: 'boxes', github_url: 'https://github.com/PipedreamHQ/pipedream', docs_url: 'https://pipedream.com/docs' },
  ),
  srv('Make', 'make', 'Automation', 'Visual automation flows (Integromat) for multi-step integrations.', [
    ['list_scenarios', 'List Make scenarios'],
    ['run_scenario', 'Execute a scenario'],
  ], { icon: 'boxes', docs_url: 'https://www.make.com/en/api-documentation' }),
  srv('HubSpot', 'hubspot', 'Automation', 'CRM contacts, deals, and marketing campaigns.', [
    ['search_contacts', 'Search CRM contacts'],
    ['create_deal', 'Create a sales deal'],
    ['list_campaigns', 'List marketing campaigns'],
  ], { icon: 'boxes', docs_url: 'https://developers.hubspot.com' }),
  srv('Salesforce', 'salesforce', 'Automation', 'Enterprise CRM operations and record management.', [
    ['query_records', 'Run SOQL queries'],
    ['create_record', 'Create a CRM record'],
    ['update_record', 'Update record fields'],
  ], { icon: 'boxes', docs_url: 'https://developer.salesforce.com' }),
  srv(
    'Publora',
    'publora',
    'Automation',
    'Social media posting across 10 platforms from one workflow.',
    [
      ['schedule_post', 'Schedule a social post'],
      ['list_accounts', 'List connected social accounts'],
    ],
    { icon: 'globe', docs_url: 'https://publora.com' },
  ),
  srv(
    'Bluesky',
    'bluesky',
    'Automation',
    'Connect and interact with the Bluesky social network.',
    [
      ['create_post', 'Publish a post'],
      ['get_timeline', 'Read home timeline'],
      ['search_posts', 'Search public posts'],
    ],
    { icon: 'globe', github_url: 'https://github.com/bluesky-social/mcp-bluesky' },
  ),
];

const slugs = new Set();
for (const s of servers) {
  if (slugs.has(s.slug)) throw new Error(`Duplicate slug: ${s.slug}`);
  slugs.add(s.slug);
}

const out = { categories: CATEGORIES, servers };
const outPath = path.join(__dirname, '..', 'data', 'mcp-servers.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${servers.length} servers to ${outPath}`);
