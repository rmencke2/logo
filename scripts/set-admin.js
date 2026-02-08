// ================================
//  Script to Set User as Admin
// ================================
// Usage: node scripts/set-admin.js <email>
// Example: node scripts/set-admin.js rasmusmencke@yahoo.com

const { getDatabase } = require('../database');

async function setAdmin() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('❌ Usage: node scripts/set-admin.js <email>');
    process.exit(1);
  }

  try {
    const db = await getDatabase();
    const user = await db.getUserByEmail(email);
    
    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    await db.setAdminStatus(user.id, true);
    console.log(`✅ User ${email} (ID: ${user.id}) is now an admin`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

setAdmin();

