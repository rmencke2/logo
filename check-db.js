#!/usr/bin/env node
// Script to check database contents
// Usage: node check-db.js

const { getDatabase } = require('./database');

async function checkDatabase() {
  try {
    const db = await getDatabase();
    
    console.log('\n📊 Database Contents:\n');
    
    // Get all users
    const users = await new Promise((resolve, reject) => {
      db.db.all('SELECT id, email, name, provider, provider_id, created_at, last_login FROM users ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('👥 Users:');
    if (users.length === 0) {
      console.log('  No users found.');
    } else {
      console.log(`  Total users: ${users.length}\n`);
      users.forEach(user => {
        console.log(`  ID: ${user.id}`);
        console.log(`    Email: ${user.email || '(no email)'}`);
        console.log(`    Name: ${user.name || '(no name)'}`);
        console.log(`    Provider: ${user.provider || 'local'}`);
        console.log(`    Provider ID: ${user.provider_id || 'N/A'}`);
        console.log(`    Created: ${user.created_at}`);
        console.log(`    Last Login: ${user.last_login || 'Never'}`);
        console.log('');
      });
    }
    
    // Get all sessions
    const sessions = await new Promise((resolve, reject) => {
      db.db.all('SELECT id, user_id, expires_at FROM sessions ORDER BY expires_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('🔐 Sessions:');
    if (sessions.length === 0) {
      console.log('  No active sessions.');
    } else {
      console.log(`  Total sessions: ${sessions.length}\n`);
      const now = new Date().toISOString();
      sessions.forEach(session => {
        const isExpired = session.expires_at < now;
        console.log(`  Session ID: ${session.id.substring(0, 20)}...`);
        console.log(`    User ID: ${session.user_id}`);
        console.log(`    Expires: ${session.expires_at}`);
        console.log(`    Status: ${isExpired ? '❌ Expired' : '✅ Active'}`);
        console.log('');
      });
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error checking database:', err);
    process.exit(1);
  }
}

checkDatabase();

