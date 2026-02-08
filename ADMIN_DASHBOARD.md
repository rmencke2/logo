# Admin Dashboard Documentation

## Overview

The Admin Dashboard is an internal tool for monitoring users, managing access, and controlling usage limits. It provides comprehensive user management, spam detection, and abuse prevention capabilities.

## Access

**URL:** `https://www.influzer.ai/admin`

**Requirements:**
- Must be logged in
- User must have `is_admin = 1` in the database

## Setting Up Your First Admin User

To set yourself as an admin, run:

```bash
node scripts/set-admin.js your-email@example.com
```

This will set the user with the specified email as an admin.

## Features

### 1. Dashboard Statistics
- **Total Users**: Total number of registered users
- **Recent Signups (7d)**: New users in the last 7 days
- **Blocked Users**: Number of currently blocked users
- **Blocked IPs**: Number of currently blocked IP addresses

### 2. User Management Tab

#### View All Users
- Search by email or name
- View user details: ID, email, name, subscription tier, status
- See admin status, blocked status, and email verification status

#### User Actions
- **View**: See detailed user information, activity logs, and custom limits
- **Block/Unblock**: Block users with optional reason
- **Set Custom Limits**: Override default usage limits for specific users
- **Make Admin**: Grant or revoke admin privileges

#### User Details Modal
When viewing a user, you can see:
- User information (email, name, tier, verification status)
- Custom limits (if set)
- Recent activity (last 50 actions)
- Usage statistics by endpoint

### 3. Abuse Tracking Tab

View all abuse tracking records:
- Identifier (user ID or IP address)
- Type (user or ip)
- Violation count
- Last occurrence
- Block status and expiration

### 4. Activity Tab

#### Top Users by Activity
- See most active users in the last 7 days
- Activity count per user
- Quick access to user details

#### Top IPs by Activity
- See most active IP addresses
- Activity count and unique user count per IP
- Quick access to IP details and blocking

## User Management Features

### Blocking Users

1. Click "Block" next to a user
2. Enter optional reason (stored for reference)
3. User is immediately blocked and cannot use the service
4. Blocked users see: "Account blocked by administrator"

### Unblocking Users

1. Click "Unblock" next to a blocked user
2. User is immediately unblocked

### Setting Custom User Limits

Override default tier-based limits for specific users:

1. Click "View" on a user
2. Click "Set Custom Limits"
3. Enter:
   - **Daily Limit**: Maximum requests per day
   - **Hourly Limit**: Maximum requests per hour
   - **Notes**: Optional notes about why limits are set
4. Click "Set Limits"

**To remove custom limits:**
- Click "Remove Custom Limits" in user details

### Making Users Admin

1. View user details
2. Click "Make Admin" or "Remove Admin"
3. Confirm the action

**Note:** Only admins can make other users admin.

## IP Address Management

### Viewing IP Activity

1. Go to "Activity" tab
2. Click "View" next to an IP address
3. See:
   - Recent activity from that IP
   - Block status
   - Number of unique users from that IP

### Blocking IP Addresses

1. View IP details
2. Click "Block IP"
3. Set duration (in hours, default: 24)
4. IP is blocked immediately

**Blocked IPs:**
- Cannot access any endpoints
- See: "Access temporarily blocked due to abuse"

### Unblocking IP Addresses

1. View blocked IP details
2. Click "Unblock IP"
3. IP is immediately unblocked

## Database Schema Changes

The admin system adds the following to the database:

### Users Table
- `is_admin BOOLEAN DEFAULT 0` - Admin flag
- `is_blocked BOOLEAN DEFAULT 0` - Blocked flag
- `blocked_reason TEXT` - Reason for blocking
- `blocked_at DATETIME` - When user was blocked

### Custom User Limits Table
- `user_id INTEGER UNIQUE` - User ID
- `daily_limit INTEGER` - Custom daily limit
- `hourly_limit INTEGER` - Custom hourly limit
- `notes TEXT` - Admin notes

## API Endpoints

All endpoints require authentication and admin privileges:

- `GET /admin` - Admin dashboard page
- `GET /admin/api/check` - Check if current user is admin
- `GET /admin/api/stats` - Dashboard statistics
- `GET /admin/api/users` - List users (with search)
- `GET /admin/api/users/:userId` - User details with activity
- `POST /admin/api/users/:userId/block` - Block user
- `POST /admin/api/users/:userId/unblock` - Unblock user
- `POST /admin/api/users/:userId/limits` - Set custom limits
- `DELETE /admin/api/users/:userId/limits` - Remove custom limits
- `POST /admin/api/users/:userId/admin` - Set admin status
- `GET /admin/api/ips/:ipAddress` - IP address details
- `POST /admin/api/ips/:ipAddress/block` - Block IP
- `POST /admin/api/ips/:ipAddress/unblock` - Unblock IP
- `GET /admin/api/abuse` - Abuse tracking records

## Security

- All admin routes are protected by `requireAuth` and `requireAdmin` middleware
- Admin status is checked on every request
- Non-admin users are redirected if they try to access admin pages
- Admin actions are logged in the database

## Future Enhancements

The system is designed to support future automation:

1. **Automated Spam Detection**: Rules-based or ML-based spam detection
2. **Auto-blocking**: Automatically block users/IPs based on patterns
3. **Alert System**: Notifications for suspicious activity
4. **Audit Log**: Track all admin actions
5. **Bulk Operations**: Block/unblock multiple users at once
6. **Export Data**: Export user lists, activity logs, etc.

## Troubleshooting

### "Access denied. Admin privileges required."
- Your user account doesn't have admin privileges
- Run: `node scripts/set-admin.js your-email@example.com`

### "Authentication required"
- You're not logged in
- Log in first, then access `/admin`

### Database migration
- The database schema is automatically updated on first run
- New columns are added with `CREATE TABLE IF NOT EXISTS`
- Existing data is preserved

## Notes

- Custom limits override tier-based limits
- Blocked users cannot use any service features
- Blocked IPs affect all users from that IP
- Admin status can be granted/revoked at any time
- All changes take effect immediately

