# Admin Panel Fix Instructions

## Issue 1: Database Missing `is_admin` Column (Production)

The production database doesn't have the new admin columns. Run the migration script:

```bash
cd ~/logo
node scripts/migrate-admin-columns.js
```

This will:
- Add `is_admin` column to users table
- Add `is_blocked` column to users table
- Add `blocked_reason` column to users table
- Add `blocked_at` column to users table
- Create `custom_user_limits` table if it doesn't exist

After migration, set yourself as admin:
```bash
node scripts/set-admin.js mencke@gmail.com
```

## Issue 2: "Cannot GET /admin" on Localhost

The admin route should work. Try these steps:

1. **Make sure the server is running the latest code:**
   ```bash
   npm start
   ```

2. **Check if you're logged in:**
   - Visit `http://localhost:4000`
   - Make sure you're authenticated
   - Then try `http://localhost:4000/admin`

3. **Check server logs:**
   - Look for any errors when accessing `/admin`
   - The route should log authentication checks

4. **Verify the route is registered:**
   - The admin route is in `services/adminService.js`
   - It's initialized in `server.js` as `initializeAdminService(app)`
   - Make sure `adminService.js` is being loaded correctly

5. **If still not working, check:**
   - Is there a catch-all route intercepting `/admin`?
   - Are there any middleware errors?
   - Check browser console for errors

## Testing Locally

1. Run migration (if needed):
   ```bash
   node scripts/migrate-admin-columns.js
   ```

2. Set yourself as admin:
   ```bash
   node scripts/set-admin.js your-email@example.com
   ```

3. Start server:
   ```bash
   npm start
   ```

4. Visit `http://localhost:4000/admin`

## Production Deployment

1. SSH into server
2. Navigate to project: `cd ~/logo`
3. Pull latest changes: `git pull`
4. Run migration: `node scripts/migrate-admin-columns.js`
5. Set admin: `node scripts/set-admin.js mencke@gmail.com`
6. Restart PM2: `pm2 restart logo-generator`

