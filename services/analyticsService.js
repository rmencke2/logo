// ================================
//  Analytics Service
// ================================

const { getDatabase } = require('../database');
const nodemailer = require('nodemailer');

// Create email transporter (reuse config from emailService)
function createTransporter() {
  if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return null;
}

/**
 * Initialize analytics tables in database
 */
async function initializeAnalyticsTables(db) {
  return new Promise((resolve, reject) => {
    db.db.serialize(() => {
      // Service analytics table - tracks each service call
      db.db.run(`
        CREATE TABLE IF NOT EXISTS service_analytics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_name TEXT NOT NULL,
          user_id INTEGER,
          ip_address TEXT,
          success BOOLEAN DEFAULT 1,
          error_message TEXT,
          duration_ms INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      // Page views table - tracks website visitors
      db.db.run(`
        CREATE TABLE IF NOT EXISTS page_views (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          page TEXT NOT NULL,
          user_id INTEGER,
          ip_address TEXT,
          user_agent TEXT,
          referrer TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      // Indexes for performance
      db.db.run('CREATE INDEX IF NOT EXISTS idx_service_analytics_service ON service_analytics(service_name)');
      db.db.run('CREATE INDEX IF NOT EXISTS idx_service_analytics_created ON service_analytics(created_at)');
      db.db.run('CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at)');
      db.db.run('CREATE INDEX IF NOT EXISTS idx_page_views_ip ON page_views(ip_address)');

      resolve();
    });
  });
}

/**
 * Log a page view
 */
async function logPageView(page, userId, ipAddress, userAgent, referrer) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.run(
      'INSERT INTO page_views (page, user_id, ip_address, user_agent, referrer) VALUES (?, ?, ?, ?, ?)',
      [page, userId, ipAddress, userAgent, referrer],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Log a service call (success or failure)
 */
async function logServiceCall(serviceName, userId, ipAddress, success, errorMessage = null, durationMs = null) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.run(
      'INSERT INTO service_analytics (service_name, user_id, ip_address, success, error_message, duration_ms) VALUES (?, ?, ?, ?, ?, ?)',
      [serviceName, userId, ipAddress, success ? 1 : 0, errorMessage, durationMs],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Get analytics data for a time period
 */
async function getAnalytics(days = 1) {
  const db = await getDatabase();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const analytics = {};

  // 1. Unique visitors (by IP)
  analytics.uniqueVisitors = await new Promise((resolve, reject) => {
    db.db.get(
      'SELECT COUNT(DISTINCT ip_address) as count FROM page_views WHERE created_at > ?',
      [since],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      }
    );
  });

  // 2. Total page views
  analytics.totalPageViews = await new Promise((resolve, reject) => {
    db.db.get(
      'SELECT COUNT(*) as count FROM page_views WHERE created_at > ?',
      [since],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      }
    );
  });

  // 3. New sign-ups
  analytics.newSignups = await new Promise((resolve, reject) => {
    db.db.get(
      'SELECT COUNT(*) as count FROM users WHERE created_at > ?',
      [since],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      }
    );
  });

  // 4. Total users
  analytics.totalUsers = await db.getUserCount();

  // 5. Service usage breakdown
  analytics.serviceUsage = await new Promise((resolve, reject) => {
    db.db.all(
      `SELECT service_name,
              COUNT(*) as total_calls,
              SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
              SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
              AVG(duration_ms) as avg_duration_ms
       FROM service_analytics
       WHERE created_at > ?
       GROUP BY service_name
       ORDER BY total_calls DESC`,
      [since],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });

  // 6. Total successful services
  analytics.totalSuccessful = await new Promise((resolve, reject) => {
    db.db.get(
      'SELECT COUNT(*) as count FROM service_analytics WHERE success = 1 AND created_at > ?',
      [since],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      }
    );
  });

  // 7. Total failed services
  analytics.totalFailed = await new Promise((resolve, reject) => {
    db.db.get(
      'SELECT COUNT(*) as count FROM service_analytics WHERE success = 0 AND created_at > ?',
      [since],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      }
    );
  });

  // 8. Recent errors (for recommendations)
  analytics.recentErrors = await new Promise((resolve, reject) => {
    db.db.all(
      `SELECT service_name, error_message, COUNT(*) as count
       FROM service_analytics
       WHERE success = 0 AND created_at > ?
       GROUP BY service_name, error_message
       ORDER BY count DESC
       LIMIT 10`,
      [since],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });

  // 9. Top pages
  analytics.topPages = await new Promise((resolve, reject) => {
    db.db.all(
      `SELECT page, COUNT(*) as views
       FROM page_views
       WHERE created_at > ?
       GROUP BY page
       ORDER BY views DESC
       LIMIT 10`,
      [since],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });

  return analytics;
}

/**
 * Generate recommendations based on analytics
 */
function generateRecommendations(analytics) {
  const recommendations = [];

  // Check failure rate
  const totalCalls = analytics.totalSuccessful + analytics.totalFailed;
  if (totalCalls > 0) {
    const failureRate = (analytics.totalFailed / totalCalls) * 100;
    if (failureRate > 10) {
      recommendations.push(`High failure rate (${failureRate.toFixed(1)}%). Review error logs for common issues.`);
    }
  }

  // Check for specific service issues
  analytics.serviceUsage.forEach(service => {
    const serviceFailureRate = (service.failed / service.total_calls) * 100;
    if (serviceFailureRate > 20) {
      recommendations.push(`${service.service_name} has ${serviceFailureRate.toFixed(1)}% failure rate. Investigate issues.`);
    }
    if (service.avg_duration_ms > 10000) {
      recommendations.push(`${service.service_name} is slow (avg ${(service.avg_duration_ms/1000).toFixed(1)}s). Consider optimization.`);
    }
  });

  // Check for common errors
  analytics.recentErrors.forEach(error => {
    if (error.count >= 5) {
      recommendations.push(`Recurring error in ${error.service_name}: "${error.error_message}" (${error.count} times)`);
    }
  });

  // Check conversion
  if (analytics.uniqueVisitors > 0 && analytics.newSignups > 0) {
    const conversionRate = (analytics.newSignups / analytics.uniqueVisitors) * 100;
    if (conversionRate < 2) {
      recommendations.push(`Low conversion rate (${conversionRate.toFixed(2)}%). Consider improving signup flow.`);
    } else if (conversionRate > 5) {
      recommendations.push(`Good conversion rate (${conversionRate.toFixed(2)}%). Keep up the good work!`);
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('All systems running smoothly. No immediate action required.');
  }

  return recommendations;
}

/**
 * Send analytics email report
 */
async function sendAnalyticsEmail(recipientEmail, days = 1) {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('No email configuration found. Logging analytics to console instead.');
    const analytics = await getAnalytics(days);
    console.log('Analytics Report:', JSON.stringify(analytics, null, 2));
    return { success: false, reason: 'No email configured' };
  }

  const analytics = await getAnalytics(days);
  const recommendations = generateRecommendations(analytics);

  const periodLabel = days === 1 ? 'Daily' : `Last ${days} Days`;
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Build service usage table rows
  const serviceRows = analytics.serviceUsage.map(s => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${s.service_name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${s.total_calls}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; color: #10a37f;">${s.successful}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; color: #d32f2f;">${s.failed}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${s.avg_duration_ms ? (s.avg_duration_ms/1000).toFixed(2) + 's' : '-'}</td>
    </tr>
  `).join('');

  // Build recommendations list
  const recommendationsList = recommendations.map(r => `<li style="margin-bottom: 8px;">${r}</li>`).join('');

  let fromAddress = process.env.EMAIL_FROM || 'analytics@influzer.ai';
  if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER) {
    fromAddress = process.env.EMAIL_USER;
  }

  const mailOptions = {
    from: fromAddress,
    to: recipientEmail,
    subject: `Influzer.ai ${periodLabel} Analytics Report - ${dateStr}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
            .container { max-width: 700px; margin: 0 auto; padding: 20px; background: white; border-radius: 8px; }
            .header { background: linear-gradient(135deg, #10a37f, #0d8a6a); color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px; }
            .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
            .stat-box { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
            .stat-number { font-size: 28px; font-weight: bold; color: #10a37f; }
            .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #f8f9fa; padding: 10px; text-align: left; font-weight: 600; }
            .section { margin: 30px 0; }
            .section-title { font-size: 18px; font-weight: 600; border-bottom: 2px solid #10a37f; padding-bottom: 8px; margin-bottom: 15px; }
            .recommendations { background: #fff8e1; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; }
            .success { color: #10a37f; }
            .error { color: #d32f2f; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; border-top: 1px solid #eee; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Influzer.ai Analytics</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">${periodLabel} Report - ${dateStr}</p>
            </div>

            <div class="section">
              <div class="section-title">Overview</div>
              <div class="stat-grid">
                <div class="stat-box">
                  <div class="stat-number">${analytics.uniqueVisitors}</div>
                  <div class="stat-label">Unique Visitors</div>
                </div>
                <div class="stat-box">
                  <div class="stat-number">${analytics.newSignups}</div>
                  <div class="stat-label">New Sign-ups</div>
                </div>
                <div class="stat-box">
                  <div class="stat-number success">${analytics.totalSuccessful}</div>
                  <div class="stat-label">Successful Services</div>
                </div>
                <div class="stat-box">
                  <div class="stat-number error">${analytics.totalFailed}</div>
                  <div class="stat-label">Failed Services</div>
                </div>
              </div>
              <p style="text-align: center; color: #666;">Total Users: ${analytics.totalUsers} | Total Page Views: ${analytics.totalPageViews}</p>
            </div>

            <div class="section">
              <div class="section-title">Service Usage Breakdown</div>
              ${analytics.serviceUsage.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th style="text-align: center;">Total</th>
                    <th style="text-align: center;">Success</th>
                    <th style="text-align: center;">Failed</th>
                    <th style="text-align: center;">Avg Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${serviceRows}
                </tbody>
              </table>
              ` : '<p style="color: #666;">No service usage data available for this period.</p>'}
            </div>

            <div class="section">
              <div class="section-title">Recommendations</div>
              <div class="recommendations">
                <ul style="margin: 0; padding-left: 20px;">
                  ${recommendationsList}
                </ul>
              </div>
            </div>

            <div class="footer">
              <p>This is an automated report from Influzer.ai</p>
              <p>Generated at ${new Date().toISOString()}</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Influzer.ai ${periodLabel} Analytics Report - ${dateStr}

OVERVIEW
========
Unique Visitors: ${analytics.uniqueVisitors}
New Sign-ups: ${analytics.newSignups}
Total Users: ${analytics.totalUsers}
Total Page Views: ${analytics.totalPageViews}
Successful Services: ${analytics.totalSuccessful}
Failed Services: ${analytics.totalFailed}

SERVICE USAGE
=============
${analytics.serviceUsage.map(s => `${s.service_name}: ${s.total_calls} total (${s.successful} success, ${s.failed} failed)`).join('\n')}

RECOMMENDATIONS
===============
${recommendations.map(r => `- ${r}`).join('\n')}

---
This is an automated report from Influzer.ai
Generated at ${new Date().toISOString()}
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Analytics email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending analytics email:', error);
    throw error;
  }
}

/**
 * Middleware to track page views
 */
function trackPageViews(app) {
  app.use(async (req, res, next) => {
    // Only track GET requests to HTML pages
    if (req.method === 'GET' && !req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)$/)) {
      try {
        const userId = req.user?.id || req.session?.userId || null;
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const referrer = req.headers['referer'] || req.headers['referrer'];

        // Don't await - fire and forget to not slow down requests
        logPageView(req.path, userId, ipAddress, userAgent, referrer).catch(() => {});
      } catch (e) {
        // Silently ignore tracking errors
      }
    }
    next();
  });
}

/**
 * Create middleware to wrap service endpoints with analytics tracking
 */
function trackService(serviceName) {
  return async (req, res, next) => {
    const startTime = Date.now();
    const userId = req.user?.id || req.session?.userId || null;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;

    // Store original end function
    const originalEnd = res.end;
    const originalJson = res.json;

    // Override json to capture response
    res.json = function(data) {
      const duration = Date.now() - startTime;
      const success = res.statusCode >= 200 && res.statusCode < 400;
      const errorMessage = !success && data?.error ? data.error : null;

      // Log the service call (fire and forget)
      logServiceCall(serviceName, userId, ipAddress, success, errorMessage, duration).catch(() => {});

      return originalJson.call(this, data);
    };

    // Override end for non-JSON responses
    res.end = function(chunk, encoding) {
      const duration = Date.now() - startTime;
      const success = res.statusCode >= 200 && res.statusCode < 400;

      // Only log if json wasn't already called
      if (!res._analyticsLogged) {
        res._analyticsLogged = true;
        logServiceCall(serviceName, userId, ipAddress, success, null, duration).catch(() => {});
      }

      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

/**
 * Schedule daily analytics email
 */
let dailyEmailInterval = null;

function scheduleDailyEmail(recipientEmail, hour = 8) {
  // Clear any existing interval
  if (dailyEmailInterval) {
    clearInterval(dailyEmailInterval);
  }

  const checkAndSend = async () => {
    const now = new Date();
    if (now.getHours() === hour && now.getMinutes() === 0) {
      try {
        await sendAnalyticsEmail(recipientEmail, 1);
        console.log('Daily analytics email sent');
      } catch (error) {
        console.error('Failed to send daily analytics email:', error);
      }
    }
  };

  // Check every minute
  dailyEmailInterval = setInterval(checkAndSend, 60 * 1000);

  console.log(`Daily analytics email scheduled for ${hour}:00 to ${recipientEmail}`);
}

/**
 * Initialize analytics service
 */
async function initializeAnalyticsService(app) {
  const db = await getDatabase();

  // Create analytics tables
  await initializeAnalyticsTables(db);

  // Track page views
  trackPageViews(app);

  // API endpoint to manually trigger analytics email
  app.post('/api/analytics/send-report', async (req, res) => {
    try {
      const recipientEmail = process.env.ANALYTICS_EMAIL || process.env.EMAIL_USER;
      if (!recipientEmail) {
        return res.status(400).json({ error: 'No recipient email configured. Set ANALYTICS_EMAIL in .env' });
      }

      const days = parseInt(req.body?.days) || 1;
      await sendAnalyticsEmail(recipientEmail, days);
      res.json({ success: true, message: `Analytics report sent to ${recipientEmail}` });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // API endpoint to get analytics data (for admin dashboard)
  app.get('/api/analytics/data', async (req, res) => {
    try {
      const days = parseInt(req.query?.days) || 1;
      const analytics = await getAnalytics(days);
      const recommendations = generateRecommendations(analytics);
      res.json({ ...analytics, recommendations });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Schedule daily email if configured
  const analyticsEmail = process.env.ANALYTICS_EMAIL;
  const emailHour = parseInt(process.env.ANALYTICS_EMAIL_HOUR) || 8;

  if (analyticsEmail) {
    scheduleDailyEmail(analyticsEmail, emailHour);
  }

  console.log('Analytics service initialized');
}

module.exports = {
  initializeAnalyticsService,
  logPageView,
  logServiceCall,
  getAnalytics,
  sendAnalyticsEmail,
  trackService,
  scheduleDailyEmail,
};
