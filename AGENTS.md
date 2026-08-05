# AGENTS.md

## Cursor Cloud specific instructions

### Product / service
Single Node/Express app (`npm start` → `server.js`) on **port 4000**. SQLite (`logo_generator.db`) is embedded and created on first start — no Redis/Postgres/Docker Compose required. Optional: FFmpeg (already common on the VM) for video/GIF tools; email/OAuth/Turnstile/GA4 for those features only.

### Run / lint / test
- **Run:** copy `.env.example` → `.env` if missing, then `npm start` (see `LOCAL_SETUP.md`).
- **Lint:** `npm run lint:js` currently fails because root `eslint.config.js` is an Expo flat-config stub that requires `eslint/config` + `eslint-config-expo`, while `package.json` pins ESLint 8.46 without those packages. Do not treat this as an environment install failure.
- **Test:** `npm test` is a stub (`no test specified`) and exits 1 by design — there is no automated test suite.
- **Build:** no separate web build step (server-rendered EJS + static `public/`).

### Gotchas
- Native modules (`canvas`, `sharp`, `sqlite3`, `bcrypt`) must be built for the current Linux arch. If you see `invalid ELF header` or sharp platform errors, wipe `node_modules` and re-run `npm ci` (the startup update script). System packages for canvas (`libcairo2-dev`, `libpango1.0-dev`, etc.) are assumed present on the snapshot; the update script does not reinstall OS packages.
- Core smoke checks without a browser: `GET /health`, `POST /generate-logo`, `POST /auth/register` + `/auth/login`, `GET /api/mcp/catalog`.
- Expo mobile sources under `app/` / `src/` are incomplete relative to this `package.json` (no Expo deps); do not expect `npx expo start` to work without restoring a separate mobile dependency set.
- Python `main.py` / `requirements.txt` is an unused FastAPI stub; the live product is the Node server.
