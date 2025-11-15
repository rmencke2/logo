# Quick Deploy Instructions for Lightsail

## Step 1: Connect to Instance
- In Lightsail, click your instance → "Connect using SSH" button
- Or use terminal: `ssh -i your-key.pem ubuntu@18.199.191.173`

## Step 2: Deploy Your App

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Git
sudo apt-get install -y git

# Clone your repository
git clone https://github.com/rmencke2/logo.git
cd logo

# Install dependencies
npm install

# Create .env file
nano .env
```

## Step 3: Configure .env File

Add this to your .env file (replace with your actual values):

```env
PORT=4000
NODE_ENV=production
BASE_URL=https://www.influzer.ai
SESSION_SECRET=your-generated-secret-here
DB_PATH=./logo_generator.db
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
ALLOWED_ORIGINS=https://www.influzer.ai,https://influzer.ai
```

Generate session secret:
```bash
openssl rand -base64 32
```

## Step 4: Start Your App

```bash
# Start with PM2
pm2 start server.js --name logo-generator

# Make it start on boot
pm2 startup
# (Follow the command it outputs)
pm2 save

# Check status
pm2 status
pm2 logs logo-generator
```

## Step 5: Configure Lightsail to Route Traffic

The Bitnami default page is running on port 80. You need to either:

**Option A: Stop Bitnami and use your app directly**
```bash
# Stop Bitnami
sudo /opt/bitnami/ctlscript.sh stop

# Your app should now be accessible on port 4000
# But you need to configure Lightsail to route port 80/443 to port 4000
```

**Option B: Use Nginx as reverse proxy (Recommended)**

This is the recommended approach - Nginx handles HTTPS and proxies to your Node.js app.

```bash
# Install Nginx
sudo apt-get install -y nginx

# Create config
sudo nano /etc/nginx/sites-available/logo-generator
```

**Before SSL (HTTP only):**
```nginx
server {
    listen 80;
    server_name www.influzer.ai influzer.ai;
    
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

**After SSL (HTTPS with redirect):**
```nginx
# HTTP redirect to HTTPS
server {
    listen 80;
    server_name www.influzer.ai influzer.ai;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name www.influzer.ai influzer.ai;

    ssl_certificate /etc/letsencrypt/live/influzer.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/influzer.ai/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/logo-generator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Now your app should be accessible!

## Step 6: Set Up SSL Certificate (Let's Encrypt)

If you want to use Let's Encrypt SSL certificate directly on your instance (without a load balancer):

**Prerequisites:**
- Your domain (e.g., logo.influzer.ai) points to your Lightsail instance's public IP
- You have SSH access

**Step 1: Connect to your instance**
```bash
ssh ubuntu@<your-lightsail-ip>
```

**Step 2: Install Certbot (Let's Encrypt client)**
```bash
sudo apt update
sudo apt install certbot python3-certbot
```

**Step 3: Stop all processes using port 80**

First, find what's using port 80:
```bash
sudo lsof -i :80
# OR
sudo netstat -tulpn | grep :80
# OR
sudo ss -tulpn | grep :80
```

This will show you the process name and PID. Then stop it based on what you find:

**If it's Nginx:**
```bash
sudo systemctl stop nginx
```

**If it's Bitnami:**
```bash
sudo /opt/bitnami/ctlscript.sh stop
```

**If it's Apache:**
```bash
sudo systemctl stop apache2
```

**If it's your Node.js app (PM2):**
```bash
pm2 stop logo-generator
```

**If you need to force kill a process (use the PID from lsof/netstat):**
```bash
sudo kill -9 <PID>
```

**Verify port 80 is free:**
```bash
sudo lsof -i :80
# Should return nothing if port is free
```

**Step 4: Request the SSL certificate**
```bash
sudo certbot certonly --standalone -d influzer.ai -d www.influzer.ai
```

Certbot will:
- Verify domain ownership (via Let's Encrypt)
- Save your certificate files to `/etc/letsencrypt/live/influzer.ai/`

**Step 4b: Update Nginx configuration (if using Nginx)**

After getting the certificate, update your Nginx config to use HTTPS:

```bash
sudo nano /etc/nginx/sites-available/logo-generator
```

Replace the config with the HTTPS version (see Step 5, Option B above), then:

```bash
sudo nginx -t  # Test configuration
sudo systemctl restart nginx  # Restart Nginx
```

**Important:** Your Node.js app should stay on port 4000 (HTTP). Nginx handles HTTPS and proxies to it.

**Step 5: Choose your HTTPS setup method**

**Option A: Using Nginx (Recommended - Already configured in Step 4b)**

If you're using Nginx, you're done! Just make sure:
- Nginx is running: `sudo systemctl status nginx`
- Your Node.js app is running on port 4000: `pm2 status`
- Nginx config is updated with HTTPS (see Step 4b)

**Option B: Direct HTTPS in Node.js (Not recommended - requires root privileges)**

Only use this if you're NOT using Nginx. The code is already updated, but you need to:

1. Set `USE_DIRECT_HTTPS=true` in your `.env` file
2. Run Node.js with root privileges (not recommended) OR use setcap:
   ```bash
   sudo setcap 'cap_net_bind_service=+ep' $(which node)
   ```
3. Restart your app:
   ```bash
   pm2 restart logo-generator
   ```

**Recommended: Use Option A (Nginx)** - it's more secure and doesn't require root privileges.

**Step 6: Restart services**

```bash
# Restart Nginx (if using it)
sudo systemctl restart nginx

# Restart your Node.js app
pm2 restart logo-generator

# Check status
pm2 status
pm2 logs logo-generator
sudo systemctl status nginx
```

**Step 7: Auto-renew certificate**

Let's Encrypt certs expire every 90 days. Add this cron job to renew automatically:

```bash
sudo crontab -e
```

Add this line:
```
0 3 * * * certbot renew --quiet && pm2 restart logo-generator
```

This will check for renewal daily at 3 AM and restart your app if the certificate was renewed.

## Step 9: Check Database (View Users)

To check if users have been created in the database:

**On your server:**

```bash
cd ~/logo

# Check if the database file exists
ls -lh logo_generator.db

# Use SQLite command line to view users
sqlite3 logo_generator.db

# Then run SQL queries:
# View all users
SELECT id, email, name, provider, provider_id, created_at, last_login FROM users;

# View specific user by email
SELECT * FROM users WHERE email = 'user@example.com';

# View sessions
SELECT * FROM sessions;

# Count total users
SELECT COUNT(*) FROM users;

# Exit SQLite
.quit
```

**Or use a one-liner to view users:**
```bash
sqlite3 ~/logo/logo_generator.db "SELECT id, email, name, provider, created_at FROM users;"
```

**To view in a more readable format:**
```bash
sqlite3 -header -column ~/logo/logo_generator.db "SELECT id, email, name, provider, created_at, last_login FROM users;"
```

## Step 8: Set Up OAuth Providers & Google AdSense

### Google OAuth Setup

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create or Select a Project**
   - Click the project dropdown at the top
   - Click "New Project" or select an existing one
   - Give it a name (e.g., "Logo Generator")

3. **Enable Google+ API**
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API" (or "People API")
   - Click on it and click "Enable"

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "+ CREATE CREDENTIALS" → "OAuth client ID"
   - If prompted, configure the OAuth consent screen:
     - User Type: External (unless you have a Google Workspace)
     - App name: Logo Generator
     - User support email: Your email
     - Developer contact: Your email
     - Click "Save and Continue"
     - Scopes: Add `email` and `profile` (if not already added)
     - Click "Save and Continue"
     - Test users: Add your email (for testing)
     - Click "Save and Continue"
   
5. **Create OAuth Client ID**
   - Application type: Web application
   - Name: Logo Generator Web Client
   - Authorized JavaScript origins:
     - `https://influzer.ai`
     - `https://www.influzer.ai`
   - Authorized redirect URIs:
     - `https://influzer.ai/auth/google/callback`
     - `https://www.influzer.ai/auth/google/callback`
   - Click "Create"
   - Copy the Client ID and Client Secret

6. **Add to your `.env` file:**
   ```bash
   GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret-here
   ```

### Facebook OAuth Setup

1. **Go to Facebook Developers**
   - Visit: https://developers.facebook.com/
   - Sign in with your Facebook account

2. **Create a New App**
   - Click "My Apps" → "Create App"
   - Select "Consumer" as the app type
   - Fill in:
     - App name: Logo Generator
     - App contact email: Your email
   - Click "Create App"

3. **Add Facebook Login Product**
   - In your app dashboard, find "Add Product"
   - Click "Set Up" on "Facebook Login"
   - Choose "Web" as the platform

4. **Configure Facebook Login Settings**
   - Go to "Facebook Login" → "Settings"
   - Valid OAuth Redirect URIs (add both):
     - `https://influzer.ai/auth/facebook/callback`
     - `https://www.influzer.ai/auth/facebook/callback`
   - Click "Save Changes"

5. **Get Your App Credentials**
   - Go to "Settings" → "Basic"
   - Copy the App ID and App Secret
   - Note: You may need to click "Show" to reveal the App Secret

6. **Add to your `.env` file:**
   ```bash
   FACEBOOK_APP_ID=your-facebook-app-id
   FACEBOOK_APP_SECRET=your-facebook-app-secret
   ```

7. **Important: App Review (for Production)**
   - Facebook requires app review for public use
   - For testing: Add test users in "Roles" → "Test Users"
   - Or keep the app in "Development Mode" (limited to test users)

### Google AdSense Setup

1. **Sign Up for Google AdSense**
   - Visit: https://www.google.com/adsense/
   - Click "Get Started"
   - Sign in with your Google account
   - Enter your website URL: `https://influzer.ai`
   - Select your country/region
   - Click "Create account"

2. **Verify Your Website**
   - Google will ask you to verify ownership
   - You can add a verification code to your HTML (in `public/index.html`)
   - Or verify via DNS record
   - Follow Google's instructions

3. **Wait for Approval**
   - Google reviews applications (can take 1-14 days)
   - You'll receive an email when approved

4. **Get Your AdSense Publisher ID**
   - Once approved, go to AdSense dashboard
   - Your Publisher ID will be in the format: `ca-pub-XXXXXXXXXX`
   - It's shown at the top of your AdSense dashboard

5. **Create an Ad Unit (Optional)**
   - Go to "Ads" → "By ad unit"
   - Click "Create ad unit"
   - Choose ad type (e.g., "Display ads")
   - Name it (e.g., "Logo Generator Banner")
   - Choose size (e.g., "Responsive")
   - Copy the Ad Unit ID (format: `1234567890`)

6. **Update Your Code**
   
   First, add to your `.env` file:
   ```bash
   GOOGLE_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXX
   GOOGLE_ADSENSE_AD_SLOT=1234567890
   ```
   
   Then update `public/index.html` to use environment variables (or update the hardcoded values):
   
   Find this line (around line 1822):
   ```javascript
   const adsenseClientId = 'ca-pub-XXXXXXXXXXXXXXXX';
   ```
   
   Replace with:
   ```javascript
   const adsenseClientId = 'ca-pub-XXXXXXXXXX'; // Your actual Publisher ID
   ```
   
   And find this line (around line 1839):
   ```javascript
   adUnit.setAttribute('data-ad-slot', '1234567890');
   ```
   
   Replace with:
   ```javascript
   adUnit.setAttribute('data-ad-slot', '1234567890'); // Your actual Ad Unit ID
   ```

### After Setting Up All Providers

1. **Update your `.env` file with all credentials:**
   ```env
   # OAuth Providers
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   FACEBOOK_APP_ID=your-facebook-app-id
   FACEBOOK_APP_SECRET=your-facebook-app-secret
   
   # Google AdSense
   GOOGLE_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXX
   GOOGLE_ADSENSE_AD_SLOT=1234567890
   ```

2. **Restart your application:**
   ```bash
   pm2 restart logo-generator
   ```

3. **Test the OAuth providers:**
   - Visit your site: `https://influzer.ai`
   - Try clicking "Continue with Google" and "Continue with Facebook"
   - Make sure the redirects work correctly

### Troubleshooting OAuth

**Google OAuth - "redirect_uri_mismatch" Error:**

This is the most common error. The redirect URI must match EXACTLY in Google Cloud Console.

1. **Check what redirect URI your app is sending:**
   - The app uses `BASE_URL` from your `.env` file
   - If `BASE_URL=https://www.influzer.ai`, the redirect URI is: `https://www.influzer.ai/auth/google/callback`
   - If `BASE_URL=https://influzer.ai`, the redirect URI is: `https://influzer.ai/auth/google/callback`

2. **Verify in Google Cloud Console:**
   - Go to https://console.cloud.google.com/
   - APIs & Services → Credentials
   - Click on your OAuth 2.0 Client ID
   - Under "Authorized redirect URIs", you MUST have BOTH:
     - `https://influzer.ai/auth/google/callback`
     - `https://www.influzer.ai/auth/google/callback`
   - Make sure there are NO trailing slashes
   - Make sure it's `https://` not `http://`
   - Click "Save"

3. **Check your `.env` file:**
   ```bash
   # On your server
   cd ~/logo
   cat .env | grep BASE_URL
   ```
   
   Make sure `BASE_URL` matches the domain you're accessing:
   - If you visit `https://www.influzer.ai`, use: `BASE_URL=https://www.influzer.ai`
   - If you visit `https://influzer.ai`, use: `BASE_URL=https://influzer.ai`
   - Or set it to match your primary domain

4. **Restart your app after changes:**
   ```bash
   pm2 restart logo-generator
   ```

**Other Google OAuth issues:**
- Verify redirect URIs match exactly (including `https://` and trailing paths)
- Check that Google+ API is enabled
- Make sure your OAuth consent screen is configured
- Check browser console for errors

**Facebook OAuth not working?**
- Verify redirect URIs match exactly
- Make sure Facebook Login product is added
- Check if app is in Development Mode (only test users can log in)
- Verify App ID and App Secret are correct

**AdSense not showing ads?**
- Make sure your site is approved by AdSense
- Check that Publisher ID is correct
- Verify Ad Unit ID matches your AdSense dashboard
- Check browser console for AdSense errors
- Note: Ads may not show in development/localhost

