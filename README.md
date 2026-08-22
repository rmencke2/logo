# Influzer Logo Generator

Logo generator and MCP directory platform for [Influzer.ai](https://www.influzer.ai).

## Quick start

```bash
npm install
cp .env.example .env   # edit as needed
npm start
```

Open http://localhost:4000

See [LOCAL_SETUP.md](LOCAL_SETUP.md) for full local development setup and [DEPLOY_INSTRUCTIONS.md](DEPLOY_INSTRUCTIONS.md) for production deploy.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run deploy:remote` | Pull + restart on Lightsail |
| `npm run deploy:prod` | Push main + deploy |
| `node --test scripts/test-security-utils.js` | Security utility tests |
| `node scripts/test-mcp-submit-rate-limit.js` | MCP submit rate limit tests |
