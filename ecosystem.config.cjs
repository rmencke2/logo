'use strict';

/**
 * PM2 process file for production.
 * Start: pm2 start ecosystem.config.cjs
 * Restart: pm2 restart logo-generator --update-env
 */
module.exports = {
  apps: [
    {
      name: 'logo-generator',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      // 1GB Lightsail — leave headroom for nginx + OS
      max_memory_restart: process.env.PM2_MAX_MEMORY || '450M',
      exp_backoff_restart_delay: 2000,
      max_restarts: 20,
      min_uptime: 10000,
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '4000',
        MCP_WARM_PROBE: process.env.MCP_WARM_PROBE || '0',
      },
    },
  ],
};
