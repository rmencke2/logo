# MCP Server Directory

A fast, searchable directory of Model Context Protocol (MCP) servers for developers.

## Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Local typed data in `data/servers.ts` (no database)

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
npm run build
npm start
```

## Deploy (AWS Lightsail + PM2)

```bash
npm run build
pm2 start npm --name "mcp-directory" -- start
# or: PORT=3001 pm2 start npm --name "mcp-directory" -- start
pm2 save
```

Configure Nginx to reverse-proxy to the app port if needed.
