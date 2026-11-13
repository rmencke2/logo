// ================================
//  Utility Service - Health, Location, Usage Limits
// ================================

const express = require('express');
const { requireAuth } = require('../auth');
const { checkUserLimits } = require('../abuseProtection');
const { getClientIp } = require('../utils/clientIp');

/**
 * Initialize utility service endpoints
 * @param {express.Application} app - Express application instance
 */
function initializeUtilityService(app) {
  // /health and /healthz are registered early in server.js (healthService).

  // Get user location from IP address
  app.get('/api/location', async (req, res) => {
    try {
      const clientIp = getClientIp(req);
      if (!clientIp || clientIp === 'unknown') {
        return res.json({ location: null });
      }

      const geoResponse = await fetch(
        `http://ip-api.com/json/${encodeURIComponent(clientIp)}?fields=status,message,city,regionName,country`,
      );
      const geoData = await geoResponse.json();

      if (geoData.status === 'success') {
        const location = [geoData.city, geoData.regionName, geoData.country]
          .filter(Boolean)
          .join(', ');
        res.json({ location });
      } else {
        res.json({ location: null });
      }
    } catch (err) {
      console.error('Location detection error:', err);
      res.json({ location: null });
    }
  });

  // Get usage limits endpoint
  app.get('/api/usage-limits', requireAuth, async (req, res) => {
    try {
      const limits = await checkUserLimits(req.user.id, req.user.subscription_tier);
      res.json(limits);
    } catch (err) {
      console.error('Error getting usage limits:', err);
      res.status(500).json({ error: 'Failed to get usage limits' });
    }
  });
}

module.exports = { initializeUtilityService };

