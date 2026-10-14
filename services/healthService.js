'use strict';

/**
 * Cheap liveness / readiness for watchdog + load balancers.
 * Registered early so it works even if later services fail to init.
 */

const { monitorEventLoopDelay } = require('perf_hooks');

const startedAt = Date.now();
let histogram;

function ensureHistogram() {
  if (histogram) return histogram;
  try {
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
  } catch {
    histogram = null;
  }
  return histogram;
}

function eventLoopLagMs() {
  const h = ensureHistogram();
  if (!h) return null;
  // mean is in nanoseconds
  return Math.round(h.mean / 1e6);
}

/**
 * @param {import('express').Application} app
 */
function registerHealthRoutes(app) {
  ensureHistogram();

  const handler = (req, res) => {
    const lagMs = eventLoopLagMs();
    const maxLag = Number(process.env.HEALTHZ_MAX_LAG_MS) || 8000;
    const graceS = Number(process.env.HEALTHZ_LAG_GRACE_S) || 90;
    const uptimeS = Math.round((Date.now() - startedAt) / 1000);
    const payload = {
      status: 'ok',
      uptime_s: uptimeS,
      pid: process.pid,
      lag_ms: lagMs,
    };

    res.setHeader('Cache-Control', 'no-store');

    // After boot grace: if we can still answer but the loop is wedged, fail
    // so the external watchdog restarts us. Primary signal is still curl
    // --max-time (stuck loop → timeout → restart).
    if (uptimeS >= graceS && lagMs != null && lagMs > maxLag) {
      payload.status = 'degraded';
      payload.error = `event_loop_lag_${lagMs}ms`;
      return res.status(503).json(payload);
    }

    return res.status(200).json(payload);
  };

  app.get('/healthz', handler);
  // Keep legacy /health as an alias (utilityService may overwrite later with a stub).
  app.get('/health', handler);
}

module.exports = {
  registerHealthRoutes,
  eventLoopLagMs,
};
