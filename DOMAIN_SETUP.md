# Domain Setup Guide for GoDaddy

This guide will help you connect your GoDaddy domain to your logo generator application.

## Quick Overview

1. Point your domain to your server (DNS configuration)
2. Set up SSL/HTTPS (required for OAuth and security)
3. Configure your application with the domain
4. Update OAuth redirect URIs

## Step 1: Choose Your Hosting Option

Since you're already using AWS, here are the best AWS options:

### 🏆 Recommended: AWS Lightsail (Easiest AWS Option)
- **Best for**: Simple setup, predictable pricing
- **Cost**: ~$5-10/month (includes data transfer)
- **Pros**: 
  - Simplest AWS option
  - Includes static IP, DNS, SSL certificate
  - One-click WordPress/Node.js setup
  - Fixed monthly pricing (no surprises)
- **Cons**: Less flexible than EC2

### Option A: AWS EC2 (Full Control)
- **Best for**: Maximum control, custom configurations
- **Cost**: ~$5-15/month (t2.micro/t3.micro eligible for free tier)
- **Pros**: 
  - Full control over server
  - Can integrate with other AWS services easily
  - Scalable
- **Cons**: More setup required (security groups, etc.)

### Option B: AWS Elastic Beanstalk (Balanced)
- **Best for**: Easy deployment with AWS integration
- **Cost**: Pay for underlying EC2 (similar to EC2)
- **Pros**: 
  - Handles deployment, scaling, monitoring
  - Still uses EC2 under the hood
  - Easy to deploy from Git
- **Cons**: Slightly more complex than Lightsail

### Option C: AWS App Runner (Serverless-like)
- **Best for**: Containerized apps, automatic scaling
- **Cost**: Pay per use
- **Pros**: 
  - Very easy deployment
  - Auto-scaling
  - Built-in load balancing
- **Cons**: Less control, may be more expensive at scale

### Recommendation for Your Use Case:
**Start with AWS Lightsail** - it's the easiest AWS option and perfect for a Node.js app like this. You can always migrate to EC2 later if you need more control.

---

### Other Non-AWS Options (if you want to explore):
- **Railway**: Very simple, $5/month
- **Render**: Free tier available
- **Heroku**: Easy but more expensive

## Step 2: AWS-Specific Setup

### If Using AWS Lightsail (Recommended):

1. **Create a Lightsail Instance:**
   - Go to AWS Lightsail console
   - Click "Create instance"
   - Choose:
     - **Platform**: Linux/Unix
     - **Blueprint**: Node.js (or Ubuntu if you prefer manual setup)
     - **Instance plan**: $5/month (1GB RAM) or $10/month (2GB RAM)
   - Give it a name and click "Create instance"

2. **Get Static IP:**
   - In Lightsail, go to Networking → Create static IP
   - Attach it to your instance
   - **Copy this IP address** - you'll need it for DNS

3. **Connect to your instance:**
   ```bash
   # Lightsail provides a browser-based SSH, or use:
   ssh -i your-key.pem ubuntu@your-instance-ip
   ```

4. **Deploy your application:**
   ```bash
   # Update system
   sudo apt-get update && sudo apt-get upgrade -y
   
   # Install Node.js (if not pre-installed)
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PM2
   sudo npm install -g pm2
   
   # Clone your repo (or upload files)
   git clone your-repo-url
   cd logo-generator
   
   # Install dependencies
   npm install
   
   # Create .env file
   nano .env
   # (Add all your environment variables)
   
   # Start with PM2
   pm2 start server.js --name logo-generator
   pm2 startup
   pm2 save
   ```

5. **Set up SSL with Lightsail:**
   - In Lightsail, go to Networking → SSL/TLS certificates
   - Click "Create certificate"
   - Enter your domain (e.g., `yourdomain.com` and `www.yourdomain.com`)
   - Validate the certificate
   - Attach it to your instance

### If Using AWS EC2:

1. **Launch EC2 Instance:**
   - Go to EC2 Console → Launch Instance
   - Choose: **Ubuntu Server 22.04 LTS**
   - Instance type: **t3.micro** (free tier eligible) or **t3.small**
   - Configure security group:
     - Allow SSH (port 22) from your IP
     - Allow HTTP (port 80) from anywhere
     - Allow HTTPS (port 443) from anywhere
   - Launch and download key pair

2. **Get Elastic IP:**
   - EC2 → Network & Security → Elastic IPs
   - Allocate Elastic IP
   - Associate with your instance
   - **Copy this IP** for DNS

3. **Connect and set up:**
   ```bash
   # Connect to instance
   ssh -i your-key.pem ubuntu@your-elastic-ip
   
   # Follow same setup steps as Lightsail above
   ```

4. **Set up SSL with Let's Encrypt:**
   ```bash
   # Install certbot
   sudo apt-get update
   sudo apt-get install certbot
   
   # Get certificate
   sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
   ```

### If Using AWS Elastic Beanstalk:

1. **Install EB CLI:**
   ```bash
   pip install awsebcli --upgrade
   ```

2. **Initialize EB:**
   ```bash
   cd logo-generator
   eb init
   # Choose your region, platform (Node.js), etc.
   ```

3. **Create environment:**
   ```bash
   eb create logo-generator-prod
   ```

4. **Set environment variables:**
   ```bash
   eb setenv BASE_URL=https://yourdomain.com SESSION_SECRET=your-secret
   # (Add all your .env variables)
   ```

5. **Deploy:**
   ```bash
   eb deploy
   ```

## Step 3: Point Domain to Your Server

### If Using AWS Lightsail or EC2:

1. **Get your server's IP address**
   ```bash
   # On your server, run:
   curl ifconfig.me
   ```

2. **In GoDaddy DNS Management:**
   - Log into GoDaddy
   - Go to "My Products" → Your Domain → "DNS"
   - Find the "A" records section
   - Add/Edit:
     - **Type**: A
     - **Name**: @ (or leave blank for root domain)
     - **Value**: Your server IP address
     - **TTL**: 600 (10 minutes) or 3600 (1 hour)
   - For www subdomain, add another A record:
     - **Type**: A
     - **Name**: www
     - **Value**: Your server IP address
     - **TTL**: 600

3. **Wait for DNS propagation** (can take 5 minutes to 48 hours, usually 15-30 minutes)

### If Using a Platform (Heroku, Railway, etc.):

Most platforms provide you with a domain or subdomain. You can:

1. **Use their domain directly** (e.g., `yourapp.herokuapp.com`)
2. **Or point your GoDaddy domain** using CNAME:
   - In GoDaddy DNS, add:
     - **Type**: CNAME
     - **Name**: @ or www
     - **Value**: `yourapp.herokuapp.com` (or whatever your platform provides)

## Step 3: Set Up SSL/HTTPS

HTTPS is **required** for OAuth and secure sessions.

### Option A: Let's Encrypt (Free, for VPS)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Get certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is set up automatically
```

### Option B: Cloudflare (Free SSL + CDN)

1. Sign up at [cloudflare.com](https://www.cloudflare.com/)
2. Add your site
3. Cloudflare will scan your DNS records
4. Update your nameservers in GoDaddy to Cloudflare's nameservers
5. In Cloudflare dashboard:
   - SSL/TLS → Overview → Set to "Full" or "Full (strict)"
   - SSL/TLS → Edge Certificates → Enable "Always Use HTTPS"

### Option C: Platform SSL (Heroku, Railway, etc.)

Most platforms provide free SSL automatically:
- **Heroku**: SSL is included, just enable it in dashboard
- **Railway**: Automatic HTTPS
- **Render**: Automatic HTTPS
- **Vercel**: Automatic HTTPS

## Step 4: Configure Your Application

### Update `.env` file:

```env
# Use your real domain
BASE_URL=https://yourdomain.com
NODE_ENV=production

# Generate a strong session secret
SESSION_SECRET=your-generated-secret-here

# Update CORS with your domain
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Generate Session Secret:

```bash
openssl rand -base64 32
```

Copy the output to `SESSION_SECRET` in your `.env` file.

## Step 5: Update OAuth Redirect URIs

### Google OAuth:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to your OAuth 2.0 Client
3. Add authorized redirect URI: `https://yourdomain.com/auth/google/callback`
4. Save changes

### Facebook OAuth:

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Select your app
3. Settings → Basic → Add Platform → Website
4. Site URL: `https://yourdomain.com`
5. Products → Facebook Login → Settings
6. Valid OAuth Redirect URIs: `https://yourdomain.com/auth/facebook/callback`
7. Save changes

## Step 6: Deploy Your Application

### If Using VPS:

```bash
# On your server
git clone your-repo
cd logo-generator
npm install

# Create .env file with your credentials
nano .env

# Install PM2 for process management
npm install -g pm2

# Start your app
pm2 start server.js --name logo-generator

# Make it start on boot
pm2 startup
pm2 save
```

### If Using Platform (Heroku example):

```bash
# Install Heroku CLI
# Then:
heroku create your-app-name
git push heroku main

# Set environment variables
heroku config:set BASE_URL=https://yourdomain.com
heroku config:set SESSION_SECRET=your-secret
# ... etc for all .env variables
```

## Step 7: Configure Reverse Proxy (VPS only)

If using a VPS with Nginx:

```nginx
# /etc/nginx/sites-available/yourdomain.com
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

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Testing Your Setup

1. **Check DNS propagation:**
   ```bash
   nslookup yourdomain.com
   # or
   dig yourdomain.com
   ```

2. **Test HTTPS:**
   - Visit `https://yourdomain.com`
   - Check for SSL certificate (lock icon in browser)

3. **Test OAuth:**
   - Try logging in with Google/Facebook
   - Should redirect back to your domain

4. **Check application logs:**
   ```bash
   # If using PM2
   pm2 logs logo-generator
   ```

## Troubleshooting

### Domain not resolving?
- Wait longer for DNS propagation (up to 48 hours)
- Check DNS records in GoDaddy match your server IP
- Use `dig` or `nslookup` to verify

### SSL certificate issues?
- Ensure port 80 is open for Let's Encrypt verification
- Check firewall settings
- Verify domain is pointing to correct server

### OAuth not working?
- Verify redirect URIs match exactly (including https://)
- Check CORS settings in `.env`
- Ensure `BASE_URL` is set correctly

### Application not accessible?
- Check firewall (ports 80, 443 should be open)
- Verify application is running: `pm2 list` or check platform dashboard
- Check application logs for errors

## Need Help?

- Check application logs for specific error messages
- Verify all environment variables are set correctly
- Ensure your server/hosting platform is running
- Check that DNS has fully propagated

