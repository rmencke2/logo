# Running Logo Generator Locally

You can run this application locally for development and testing. Here's how:

## Quick Start

1. **Install dependencies** (if not already done):
```bash
npm install
```

2. **Create a `.env` file** in the root directory:
```bash
# Minimal local development config
PORT=4000
NODE_ENV=development
BASE_URL=http://localhost:4000
SESSION_SECRET=local-dev-secret-change-in-production
DB_PATH=./logo_generator.db

# Optional - only needed if you want to test OAuth/Email features
# EMAIL_SERVICE=gmail
# EMAIL_USER=your-email@gmail.com
# EMAIL_PASS=your-app-password
# GOOGLE_CLIENT_ID=your-google-client-id
# GOOGLE_CLIENT_SECRET=your-google-client-secret
# FACEBOOK_APP_ID=your-facebook-app-id
# FACEBOOK_APP_SECRET=your-facebook-app-secret
```

3. **Start the server**:
```bash
npm start
```

4. **Open in browser**:
```
http://localhost:4000
```

## What Works Locally

✅ **Logo Generation** - Fully functional  
✅ **Favicon Generation** - Fully functional  
✅ **User Authentication** - Email/password signup/login works  
✅ **Database** - SQLite database created automatically  
✅ **Translations** - All 8 languages work  
✅ **Homepage** - All features visible  

## What Requires Additional Setup

⚠️ **OAuth (Google/Facebook)** - Requires OAuth credentials and proper redirect URIs  
⚠️ **Email Verification** - Requires email service configuration  
⚠️ **HTTPS** - Not needed locally (HTTP is fine for development)  

## Local Development Tips

- The app will create `logo_generator.db` automatically on first run
- Generated logos are saved in `generated_img/` directory
- You can test signup/login without email verification (it will show a message but won't block)
- OAuth buttons will show errors if not configured, but email/password auth works fine

## Troubleshooting

**Port already in use?**
```bash
# Change PORT in .env to something else (e.g., 3000, 5000)
PORT=3000
```

**Database errors?**
```bash
# Delete the database file and restart
rm logo_generator.db
npm start
```

**Dependencies not installing?**
```bash
# Make sure you have Node.js 14+ installed
node --version
npm --version

# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

