/** PM2 config: pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: "mcp-directory",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3000,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};
