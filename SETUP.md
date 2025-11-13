# Logo Generator - Setup Guide

This guide will help you set up authentication, abuse protection, and ad integration for your logo generator application.

## ⚠️ SECURITY WARNING

**NEVER store real passwords, API keys, or secrets in this file (SETUP.md) or commit them to git!**

- This file (SETUP.md) is documentation only - it contains example/template values
- **All real credentials must go in `.env` file** (which is already in `.gitignore`)
- The `.env` file should never be committed to version control
- Replace all placeholder values (like `your-password`, `your-google-client-id`) with your actual credentials

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- A domain name (for production deployment)
- An email account for sending verification emails (Gmail or SMTP)
- OAuth credentials (optional, for Google/Facebook/Apple sign-in)
- Google AdSense account (optional, for ads)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file from the template:
```bash
# Copy the template file
cp .env.template .env

# Then edit .env with your actual credentials
# NEVER commit .env to git!
```

## Environment Variables

**Create a `.env` file in the root directory** (this file is git-ignored and should contain your REAL credentials):

**Template/Example values (replace with your actual credentials):**

```env
# Server Configuration
PORT=4000
NODE_ENV=production
BASE_URL=https://yourdomain.com

# Session Secret (CRITICAL: Use a strong random string in production!)
# Generate one with: openssl rand -base64 32
SESSION_SECRET=REPLACE-WITH-STRONG-RANDOM-STRING-GENERATE-WITH-OPENSSL

# Database
DB_PATH=./logo_generator.db

# Email Configuration
# Option 1: Gmail
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Option 2: SMTP
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=your-email@example.com
# SMTP_PASS=your-password

EMAIL_FROM=noreply@logogenerator.com

# OAuth Providers (Optional)
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# Apple OAuth (requires additional setup)
APPLE_CLIENT_ID=your-apple-client-id
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id

# CORS (comma-separated list of allowed origins)
# For production, use your actual domain:
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Google AdSense (Optional)
GOOGLE_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX
```

## Setting Up Your Domain (GoDaddy)

### Step 1: Point Domain to Your Server

1. **Get your server IP address** (if using a VPS/cloud server)
2. **In GoDaddy DNS settings:**
   - Add an **A Record**: `@` → Your server IP
   - Add an **A Record**: `www` → Your server IP (optional, for www subdomain)
   - Or use **CNAME** if using a hosting service that provides a domain

### Step 2: SSL Certificate (HTTPS Required)

You'll need HTTPS for OAuth and secure sessions. Options:

**Option A: Let's Encrypt (Free, Recommended)**
```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Get certificate (replace with your domain)
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```

**Option B: Cloudflare (Free SSL + CDN)**
1. Sign up at [Cloudflare](https://www.cloudflare.com/)
2. Add your domain
3. Update nameservers in GoDaddy to Cloudflare's nameservers
4. Enable SSL/TLS in Cloudflare dashboard

### Step 3: Update Environment Variables

Update your `.env` file with your real domain:
```env
BASE_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Step 4: Configure Reverse Proxy (if using Nginx)

If using Nginx as reverse proxy, create `/etc/nginx/sites-available/yourdomain.com`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then enable:
```bash
sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Setting Up OAuth Providers

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. **Set authorized redirect URI**: `https://yourdomain.com/auth/google/callback` (use your REAL domain)
6. Copy the Client ID and Client Secret to your `.env` file (NOT in this documentation!)

### Facebook OAuth

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add Facebook Login product
4. **Set Valid OAuth Redirect URIs**: `https://yourdomain.com/auth/facebook/callback` (use your REAL domain)
5. Copy the App ID and App Secret to your `.env` file (NOT in this documentation!)

### Apple Sign In

Apple Sign In requires additional setup with certificates and keys. Refer to [Apple's documentation](https://developer.apple.com/sign-in-with-apple/) for detailed instructions.

## Email Configuration

### Gmail Setup

1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
3. Use this app password in `EMAIL_PASS`

### SMTP Setup

For other email providers (SendGrid, Mailgun, etc.), use the SMTP configuration:
- Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- Set `SMTP_SECURE=true` for port 465, `false` for port 587

## Google AdSense Setup

1. Sign up for [Google AdSense](https://www.google.com/adsense/)
2. Get your publisher ID (format: `ca-pub-XXXXXXXXXX`)
3. Create an ad unit in your AdSense dashboard
4. Copy the ad slot ID
5. Update the ad slot ID in `public/index.html` (line ~1838) with your actual ad slot ID

## Running the Application

1. Start the server:
```bash
npm start
```

2. The application will:
   - Create the SQLite database automatically on first run
   - Initialize authentication
   - Start listening on the configured PORT

## Features Implemented

### 1. Authentication
- ✅ Email/Password signup with verification
- ✅ Google OAuth
- ✅ Facebook OAuth
- ✅ Apple OAuth (placeholder - requires additional setup)
- ✅ Password reset functionality
- ✅ Session management

### 2. Abuse Protection
- ✅ Rate limiting per user (tier-based)
- ✅ IP-based rate limiting for unauthenticated users
- ✅ Usage tracking and quotas
- ✅ Abuse detection and blocking
- ✅ Free tier: 10 daily, 3 hourly
- ✅ Premium tier: 100 daily, 20 hourly

### 3. Ad Integration
- ✅ Google AdSense integration
- ✅ Ads shown only for free tier users
- ✅ Automatic ad loading based on subscription tier

## Usage Limits

### Free Tier
- 10 logo generations per day
- 3 logo generations per hour
- Ads displayed

### Premium/Pro Tier
- 100 logo generations per day
- 20 logo generations per hour
- No ads

## Database

The application uses SQLite by default. The database file is created automatically at the path specified in `DB_PATH`.

To migrate to PostgreSQL or MySQL in production:
1. Update the database connection in `database.js`
2. Run the schema migrations (SQL provided in comments)

## Security Notes

1. **Change SESSION_SECRET** in production to a strong, random string
2. **Use HTTPS** in production
3. **Set secure cookies** (already configured for production)
4. **Rate limiting** is enabled by default
5. **SQL injection protection** via parameterized queries
6. **Password hashing** using bcrypt

## Troubleshooting

### Email not sending
- Check email credentials in `.env`
- For Gmail, ensure you're using an App Password, not your regular password
- Check spam folder for verification emails

### OAuth not working
- Verify redirect URIs match exactly
- Check OAuth credentials in `.env`
- Ensure OAuth providers are enabled in your app settings

### Database errors
- Ensure the database directory is writable
- Check `DB_PATH` in `.env`
- Delete `logo_generator.db` to reset (will lose all data)

## Production Deployment Checklist

1. ✅ **Set `NODE_ENV=production`** in `.env`
2. ✅ **Generate strong `SESSION_SECRET`**: `openssl rand -base64 32`
3. ✅ **Update `BASE_URL`** to your real domain (e.g., `https://yourdomain.com`)
4. ✅ **Configure CORS** with your actual domain
5. ✅ **Set up HTTPS** (Let's Encrypt or Cloudflare)
6. ✅ **Update OAuth redirect URIs** in Google/Facebook apps to use your real domain
7. ✅ **Use production email service** (SendGrid, Mailgun, AWS SES, etc.)
8. ✅ **Use production database** (PostgreSQL recommended for production)
9. ✅ **Configure reverse proxy** (Nginx recommended)
10. ✅ **Set up process manager** (PM2 recommended): `npm install -g pm2 && pm2 start server.js --name logo-generator`
11. ✅ **Enable firewall** (only allow ports 80, 443, and SSH)
12. ✅ **Set up monitoring** and logging
13. ✅ **Backup database regularly**

### Quick PM2 Setup

```bash
# Install PM2 globally
npm install -g pm2

# Start your app
pm2 start server.js --name logo-generator

# Make it start on boot
pm2 startup
pm2 save

# Monitor
pm2 monit
```

### Important Security Reminders

- ✅ `.env` file is in `.gitignore` - never commit it
- ✅ Never share your `.env` file or commit it to git
- ✅ Use strong, unique passwords for all services
- ✅ Enable 2FA on all accounts (Google, Facebook, hosting, etc.)
- ✅ Keep dependencies updated: `npm audit` and `npm update`
- ✅ Use HTTPS everywhere (no HTTP in production)
- ✅ Regularly rotate API keys and secrets

## Support

For issues or questions, check the code comments or create an issue in the repository.

