// ================================
//  Admin Service - User Management & Monitoring
// ================================

const express = require('express');
const { getDatabase } = require('../database');
const { requireAuth } = require('../auth');

/**
 * Middleware to check if user is admin (requires auth first)
 */
async function requireAdmin(req, res, next) {
  // First check authentication
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const db = await getDatabase();
    const user = await db.getUserById(req.user.id);
    
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (err) {
    console.error('Admin check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Initialize admin service
 * @param {express.Application} app - Express application instance
 */
function initializeAdminService(app) {
  // Serve admin dashboard page (requires auth + admin)
  app.get('/admin', async (req, res, next) => {
    // Check authentication first
    if (!req.user || !req.user.id) {
      // If not authenticated via Passport, check session
      if (req.session && req.session.userId) {
        try {
          const db = await getDatabase();
          const user = await db.getUserById(req.session.userId);
          if (user) {
            req.user = user;
          }
        } catch (err) {
          // Continue to redirect
        }
      }
      
      // If still not authenticated, redirect to login
      if (!req.user || !req.user.id) {
        return res.redirect('/?redirect=/admin');
      }
    }
    
    // Now check admin status
    try {
      const db = await getDatabase();
      const user = await db.getUserById(req.user.id);
      
      if (!user || !user.is_admin) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Access Denied</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>Access Denied</h1>
            <p>Admin privileges required to access this page.</p>
            <p><a href="/">Return to Homepage</a></p>
          </body>
          </html>
        `);
      }
      
      // User is authenticated and is admin, serve the page
      const path = require('path');
      res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
    } catch (err) {
      console.error('Admin route error:', err);
      res.status(500).send('Internal server error');
    }
  });

  // Check admin status endpoint
  app.get('/admin/api/check', requireAuth, async (req, res) => {
    try {
      const db = await getDatabase();
      const user = await db.getUserById(req.user.id);
      res.json({ isAdmin: !!user?.is_admin });
    } catch (err) {
      res.status(500).json({ error: 'Failed to check admin status' });
    }
  });

  // Dashboard statistics
  app.get('/admin/api/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getDatabase();
      
      const [
        totalUsers,
        recentSignups,
        topUsers,
        topIPs,
        blockedUsers,
        blockedIPs
      ] = await Promise.all([
        db.getUserCount(),
        db.getRecentSignups(7),
        db.getTopUsersByActivity(10, 7),
        db.getTopIPsByActivity(10, 7),
        db.db.all('SELECT COUNT(*) as count FROM users WHERE is_blocked = 1'),
        db.db.all('SELECT COUNT(*) as count FROM abuse_tracking WHERE blocked_until > CURRENT_TIMESTAMP')
      ]);

      // Get activity stats
      const activityStats = await new Promise((resolve, reject) => {
        db.db.all(
          `SELECT 
            DATE(created_at) as date,
            COUNT(*) as count
           FROM usage_logs
           WHERE created_at > datetime('now', '-7 days')
           GROUP BY DATE(created_at)
           ORDER BY date DESC`,
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      res.json({
        users: {
          total: totalUsers,
          recent: recentSignups.length,
          blocked: blockedUsers[0]?.count || 0,
        },
        activity: {
          topUsers: topUsers,
          topIPs: topIPs,
          dailyActivity: activityStats,
        },
        blocks: {
          users: blockedUsers[0]?.count || 0,
          ips: blockedIPs[0]?.count || 0,
        },
      });
    } catch (err) {
      console.error('Error fetching admin stats:', err);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });

  // Get all users with pagination
  app.get('/admin/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const search = req.query.search;

      const db = await getDatabase();
      let users, total;

      if (search) {
        // Search users by email or name
        users = await new Promise((resolve, reject) => {
          db.db.all(
            `SELECT id, email, name, subscription_tier, email_verified, is_admin, is_blocked, blocked_reason, blocked_at, created_at, last_login
             FROM users
             WHERE email LIKE ? OR name LIKE ?
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [`%${search}%`, `%${search}%`, limit, offset],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });
        total = await new Promise((resolve, reject) => {
          db.db.get(
            'SELECT COUNT(*) as count FROM users WHERE email LIKE ? OR name LIKE ?',
            [`%${search}%`, `%${search}%`],
            (err, row) => {
              if (err) reject(err);
              else resolve(row?.count || 0);
            }
          );
        });
      } else {
        users = await db.getAllUsers(limit, offset);
        total = await db.getUserCount();
      }

      res.json({ users, total, limit, offset });
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Get user details with activity
  app.get('/admin/api/users/:userId', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const db = await getDatabase();

      const [user, activity, customLimits] = await Promise.all([
        db.getUserById(userId),
        db.getUserActivity(userId, 100),
        db.getCustomUserLimits(userId),
      ]);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get usage stats
      const usageStats = await new Promise((resolve, reject) => {
        db.db.all(
          `SELECT 
            endpoint,
            COUNT(*) as count
           FROM usage_logs
           WHERE user_id = ? AND created_at > datetime('now', '-30 days')
           GROUP BY endpoint
           ORDER BY count DESC`,
          [userId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      res.json({
        user,
        activity: activity.slice(0, 50), // Last 50 activities
        usageStats,
        customLimits,
      });
    } catch (err) {
      console.error('Error fetching user details:', err);
      res.status(500).json({ error: 'Failed to fetch user details' });
    }
  });

  // Block/unblock user
  app.post('/admin/api/users/:userId/block', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { reason } = req.body;
      const db = await getDatabase();

      await db.blockUser(userId, reason || 'Blocked by admin');

      res.json({ success: true, message: 'User blocked successfully' });
    } catch (err) {
      console.error('Error blocking user:', err);
      res.status(500).json({ error: 'Failed to block user' });
    }
  });

  app.post('/admin/api/users/:userId/unblock', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const db = await getDatabase();

      await db.unblockUser(userId);

      res.json({ success: true, message: 'User unblocked successfully' });
    } catch (err) {
      console.error('Error unblocking user:', err);
      res.status(500).json({ error: 'Failed to unblock user' });
    }
  });

  // Set custom user limits
  app.post('/admin/api/users/:userId/limits', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { dailyLimit, hourlyLimit, notes } = req.body;

      if (!dailyLimit || !hourlyLimit) {
        return res.status(400).json({ error: 'Daily and hourly limits are required' });
      }

      const db = await getDatabase();
      await db.setCustomUserLimits(userId, parseInt(dailyLimit), parseInt(hourlyLimit), notes);

      res.json({ success: true, message: 'Custom limits set successfully' });
    } catch (err) {
      console.error('Error setting custom limits:', err);
      res.status(500).json({ error: 'Failed to set custom limits' });
    }
  });

  app.delete('/admin/api/users/:userId/limits', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const db = await getDatabase();

      await db.removeCustomUserLimits(userId);

      res.json({ success: true, message: 'Custom limits removed successfully' });
    } catch (err) {
      console.error('Error removing custom limits:', err);
      res.status(500).json({ error: 'Failed to remove custom limits' });
    }
  });

  // IP address management
  app.get('/admin/api/ips/:ipAddress', requireAuth, requireAdmin, async (req, res) => {
    try {
      const ipAddress = req.params.ipAddress;
      const db = await getDatabase();

      const [activity, abuseRecord] = await Promise.all([
        db.getIPActivity(ipAddress, 100),
        db.checkAbuseStatus(ipAddress, 'ip'),
      ]);

      res.json({
        ipAddress,
        activity: activity.slice(0, 50),
        abuseRecord,
        isBlocked: abuseRecord && abuseRecord.blocked_until && new Date(abuseRecord.blocked_until) > new Date(),
      });
    } catch (err) {
      console.error('Error fetching IP details:', err);
      res.status(500).json({ error: 'Failed to fetch IP details' });
    }
  });

  app.post('/admin/api/ips/:ipAddress/block', requireAuth, requireAdmin, async (req, res) => {
    try {
      const ipAddress = req.params.ipAddress;
      const { durationHours = 24 } = req.body;
      const db = await getDatabase();

      const blockUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);
      
      // First ensure abuse record exists
      await db.recordAbuse(ipAddress, 'ip', 'admin_blocked');
      await db.blockIdentifier(ipAddress, 'ip', blockUntil.toISOString());

      res.json({ success: true, message: `IP blocked until ${blockUntil.toISOString()}` });
    } catch (err) {
      console.error('Error blocking IP:', err);
      res.status(500).json({ error: 'Failed to block IP' });
    }
  });

  app.post('/admin/api/ips/:ipAddress/unblock', requireAuth, requireAdmin, async (req, res) => {
    try {
      const ipAddress = req.params.ipAddress;
      const db = await getDatabase();

      await db.blockIdentifier(ipAddress, 'ip', null);

      res.json({ success: true, message: 'IP unblocked successfully' });
    } catch (err) {
      console.error('Error unblocking IP:', err);
      res.status(500).json({ error: 'Failed to unblock IP' });
    }
  });

  // Set admin status
  app.post('/admin/api/users/:userId/admin', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { isAdmin } = req.body;
      const db = await getDatabase();

      await db.setAdminStatus(userId, isAdmin);

      res.json({ success: true, message: `User admin status updated to ${isAdmin}` });
    } catch (err) {
      console.error('Error setting admin status:', err);
      res.status(500).json({ error: 'Failed to set admin status' });
    }
  });

  // Get abuse tracking records
  app.get('/admin/api/abuse', requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const db = await getDatabase();

      const records = await new Promise((resolve, reject) => {
        db.db.all(
          `SELECT * FROM abuse_tracking
           ORDER BY last_occurrence DESC
           LIMIT ?`,
          [limit],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      res.json({ records });
    } catch (err) {
      console.error('Error fetching abuse records:', err);
      res.status(500).json({ error: 'Failed to fetch abuse records' });
    }
  });
}

module.exports = { initializeAdminService, requireAdmin };

