# AWS Setup Guide for Logo Generator

Complete guide for deploying your logo generator on AWS.

## Quick Decision Guide

**Choose AWS Lightsail if:**
- ✅ You want the easiest setup
- ✅ You want predictable pricing ($5-10/month)
- ✅ You don't need advanced AWS features
- ✅ You want SSL certificate management included

**Choose AWS EC2 if:**
- ✅ You want full control
- ✅ You need to integrate with other AWS services (RDS, S3, etc.)
- ✅ You're comfortable with server management
- ✅ You want to optimize costs with reserved instances

**Choose AWS Elastic Beanstalk if:**
- ✅ You want easy deployment from Git
- ✅ You want automatic scaling
- ✅ You want AWS to handle infrastructure

## Option 1: AWS Lightsail (Recommended - Easiest)

### Step 1: Create Instance

1. Go to [AWS Lightsail Console](https://lightsail.aws.amazon.com/)
2. Click **"Create instance"**
3. Configure:
   - **Platform**: Linux/Unix
   - **Blueprint**: 
     - Option A: **Node.js** (if available - includes Node.js pre-installed)
     - Option B: **Ubuntu** (manual setup, more control)
   - **Instance plan**: 
     - **$5/month**: 1 GB RAM, 1 vCPU, 40 GB SSD (good for start)
     - **$10/month**: 2 GB RAM, 1 vCPU, 60 GB SSD (recommended)
4. Name your instance (e.g., `logo-generator`)
5. Click **"Create instance"**

### Step 2: Create Static IP

1. In Lightsail, go to **Networking** tab
2. Click **"Create static IP"**
3. Name it (e.g., `logo-generator-ip`)
4. Attach it to your instance
5. **Copy the IP address** - you'll need this for DNS

### Step 3: Connect to Instance

**Option A: Browser-based SSH (Easiest)**
- In Lightsail, click on your instance
- Click **"Connect using SSH"** button
- Browser terminal opens

**Option B: SSH from Terminal**
```bash
# Download your key from Lightsail (Account → SSH keys)
# Or use the default key
ssh -i ~/Downloads/your-key.pem ubuntu@your-static-ip
```

### Step 4: Install Dependencies

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js (if not pre-installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v18.x or higher
npm --version

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Git (if not installed)
sudo apt-get install -y git
```

### Step 5: Deploy Your Application

```bash
# Clone your repository
git clone https://github.com/yourusername/logo-generator.git
cd logo-generator

# Or if you need to upload files manually:
# Use Lightsail file browser or SCP

# Install dependencies
npm install

# Create .env file
nano .env
```

**Add to .env:**
```env
PORT=4000
NODE_ENV=production
BASE_URL=https://yourdomain.com
SESSION_SECRET=your-generated-secret-here
DB_PATH=./logo_generator.db
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

**Generate session secret:**
```bash
openssl rand -base64 32
```

### Step 6: Start Application

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

### Step 7: Configure Firewall

In Lightsail:
1. Go to your instance → **Networking** tab
2. Click **"Add rule"**
3. Add:
   - **Application**: HTTP (port 80)
   - **Application**: HTTPS (port 443)
4. Save

### Step 8: Set Up SSL Certificate

1. In Lightsail, go to **Networking** → **SSL/TLS certificates**
2. Click **"Create certificate"**
3. Enter your domain:
   - `yourdomain.com`
   - `www.yourdomain.com`
4. Click **"Create"**
5. Validate the certificate (follow instructions)
6. Once validated, attach it to your instance

### Step 9: Configure Domain DNS (GoDaddy)

1. Log into GoDaddy
2. Go to **My Products** → Your Domain → **DNS**
3. Add/Edit A records:
   - **Type**: A
   - **Name**: @ (or blank)
   - **Value**: Your Lightsail static IP
   - **TTL**: 600
4. Add another A record for www:
   - **Type**: A
   - **Name**: www
   - **Value**: Your Lightsail static IP
   - **TTL**: 600

### Step 10: Update OAuth Redirect URIs

Update in Google/Facebook developer consoles:
- `https://yourdomain.com/auth/google/callback`
- `https://yourdomain.com/auth/facebook/callback`

## Option 2: AWS EC2 (Full Control)

### Step 1: Launch EC2 Instance

1. Go to [EC2 Console](https://console.aws.amazon.com/ec2/)
2. Click **"Launch instance"**
3. Configure:
   - **Name**: logo-generator
   - **AMI**: Ubuntu Server 22.04 LTS (free tier eligible)
   - **Instance type**: 
     - **t3.micro** (free tier) - 1 vCPU, 1 GB RAM
     - **t3.small** (recommended) - 2 vCPU, 2 GB RAM
   - **Key pair**: Create new or use existing
   - **Network settings**: 
     - Allow SSH (port 22) from your IP
     - Allow HTTP (port 80) from anywhere (0.0.0.0/0)
     - Allow HTTPS (port 443) from anywhere (0.0.0.0/0)
4. Launch instance

### Step 2: Allocate Elastic IP

1. EC2 → **Network & Security** → **Elastic IPs**
2. Click **"Allocate Elastic IP address"**
3. Click **"Allocate"**
4. Select the IP → **Actions** → **Associate Elastic IP address**
5. Choose your instance
6. **Copy the Elastic IP** for DNS

### Step 3: Connect and Set Up

```bash
# Connect to instance
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@your-elastic-ip

# Follow same setup as Lightsail (Steps 4-6 above)
```

### Step 4: Set Up Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt-get install -y nginx

# Create site configuration
sudo nano /etc/nginx/sites-available/logo-generator
```

**Add this configuration:**
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

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/logo-generator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 5: Set Up SSL with Let's Encrypt

```bash
# Install certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is set up automatically
```

## Option 3: AWS Elastic Beanstalk

### Step 1: Install EB CLI

```bash
pip install awsebcli --upgrade
```

### Step 2: Initialize

```bash
cd logo-generator
eb init
# Choose:
# - Region
# - Application name: logo-generator
# - Platform: Node.js
# - Platform version: Latest
# - SSH: Yes (for debugging)
```

### Step 3: Create Environment

```bash
eb create logo-generator-prod
# This will:
# - Create EC2 instance
# - Set up load balancer
# - Configure security groups
# - Deploy your app
```

### Step 4: Configure Environment Variables

```bash
eb setenv \
  BASE_URL=https://yourdomain.com \
  NODE_ENV=production \
  SESSION_SECRET=your-secret \
  DB_PATH=./logo_generator.db \
  EMAIL_SERVICE=gmail \
  EMAIL_USER=your-email@gmail.com \
  EMAIL_PASS=your-app-password \
  GOOGLE_CLIENT_ID=your-google-client-id \
  GOOGLE_CLIENT_SECRET=your-google-client-secret \
  FACEBOOK_APP_ID=your-facebook-app-id \
  FACEBOOK_APP_SECRET=your-facebook-app-secret \
  ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Step 5: Deploy

```bash
eb deploy
```

### Step 6: Set Up Custom Domain

```bash
# Get your environment URL
eb status

# In EB Console:
# - Configuration → Load balancer → Add listener (HTTPS)
# - Configuration → Custom domains → Add domain
```

## Cost Comparison

| Service | Monthly Cost | Best For |
|---------|-------------|----------|
| **Lightsail** | $5-10 | Easiest setup, predictable |
| **EC2 t3.micro** | ~$7-10 | Full control, free tier eligible |
| **EC2 t3.small** | ~$15-20 | Better performance |
| **Elastic Beanstalk** | ~$7-20 | Easy deployment, auto-scaling |

## Monitoring and Maintenance

### Check Application Status

**Lightsail:**
- Use browser-based terminal
- Or SSH and run: `pm2 status`

**EC2:**
```bash
ssh -i key.pem ubuntu@your-ip
pm2 status
pm2 logs logo-generator
```

**Elastic Beanstalk:**
```bash
eb status
eb logs
```

### Update Application

```bash
# Pull latest changes
git pull

# Install new dependencies
npm install

# Restart
pm2 restart logo-generator

# Or with EB:
eb deploy
```

### Backup Database

```bash
# Create backup script
nano backup-db.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp logo_generator.db backups/logo_generator_$DATE.db
# Keep only last 7 days
find backups/ -name "*.db" -mtime +7 -delete
```

```bash
chmod +x backup-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/ubuntu/logo-generator/backup-db.sh
```

## Troubleshooting

### Application not accessible?
- Check security groups (ports 80, 443 open)
- Check PM2 status: `pm2 status`
- Check logs: `pm2 logs logo-generator`
- Check Nginx (if using): `sudo systemctl status nginx`

### SSL certificate issues?
- Verify DNS is pointing correctly
- Check certificate status in Lightsail or `sudo certbot certificates`
- Ensure ports 80 and 443 are open

### High costs?
- Use t3.micro (free tier) if eligible
- Consider Lightsail for fixed pricing
- Set up CloudWatch alarms for cost monitoring

## Next Steps

1. ✅ Choose your AWS option (Lightsail recommended)
2. ✅ Set up instance and deploy
3. ✅ Configure domain DNS
4. ✅ Set up SSL
5. ✅ Update OAuth redirect URIs
6. ✅ Test your application

Need help with a specific step? Let me know!

