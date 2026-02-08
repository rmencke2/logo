// ================================
//  Utility Service - Health, Location, Usage Limits
// ================================

const express = require('express');
const { requireAuth } = require('../auth');
const { checkUserLimits } = require('../abuseProtection');

/**
 * Initialize utility service endpoints
 * @param {express.Application} app - Express application instance
 */
function initializeUtilityService(app) {
  // Health check endpoint for service monitoring
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Get user location from IP address
  app.get('/api/location', async (req, res) => {
    try {
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || 
                       req.headers['x-real-ip'] || 
                       req.connection.remoteAddress || 
                       req.socket.remoteAddress ||
                       '8.8.8.8'; // Fallback IP

      // Use a free IP geolocation service
      const geoResponse = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,message,city,regionName,country`);
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

