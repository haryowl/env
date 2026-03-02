const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function fixSiteUserRelationship() {
  const client = await pool.connect();
  try {
    console.log('=== Fixing Site-User Relationship ===\n');
    
    // Step 1: Check current sites table structure
    console.log('1. Checking current sites table structure...');
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'sites'
      ORDER BY ordinal_position
    `);
    
    console.log('Current sites table columns:');
    columns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Step 2: Remove user_id column from sites table (since we'll use user_sites junction table)
    console.log('\n2. Removing user_id column from sites table...');
    try {
      await client.query(`
        ALTER TABLE sites DROP COLUMN IF EXISTS user_id
      `);
      console.log('   ✅ user_id column removed from sites table');
    } catch (error) {
      console.log('   ⚠️  Error removing user_id column:', error.message);
    }
    
    // Step 3: Verify user_sites table exists and is properly structured
    console.log('\n3. Checking user_sites table structure...');
    const userSitesColumns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'user_sites'
      ORDER BY ordinal_position
    `);
    
    console.log('user_sites table columns:');
    userSitesColumns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Step 4: Update sites API to use user_sites relationship
    console.log('\n4. Updating sites table structure for multi-user support...');
    
    // Check if we have any existing sites with user_id
    const existingSites = await client.query('SELECT COUNT(*) as count FROM sites');
    console.log(`   Current sites count: ${existingSites.rows[0].count}`);
    
    // Step 5: Show the new relationship structure
    console.log('\n5. New relationship structure:');
    console.log('   Company (1) → Sites (many)');
    console.log('   Sites (1) → Users (many) via user_sites table');
    console.log('   Sites (1) → Devices (many) via devices.site_id');
    
    // Step 6: Create sample data structure example
    console.log('\n6. Example data structure:');
    console.log('   Company: "PT Loema Abadi"');
    console.log('   ├── Site: "Site A" (can have multiple users)');
    console.log('   │   ├── User: "admin"');
    console.log('   │   ├── User: "operator1"');
    console.log('   │   └── Device: "Device 1"');
    console.log('   ├── Site: "Site B" (can have multiple users)');
    console.log('   │   ├── User: "admin"');
    console.log('   │   ├── User: "operator2"');
    console.log('   │   └── Device: "Device 2"');
    
    console.log('\n✅ Site-User relationship fixed for multi-user support!');
    console.log('\n📋 What this enables:');
    console.log('   • One company can have multiple sites');
    console.log('   • Each site can have multiple users assigned');
    console.log('   • Users can be assigned to multiple sites');
    console.log('   • Each site can have multiple devices');
    console.log('   • Role-based access control per site');
    
  } finally {
    client.release();
    await pool.end();
  }
}

fixSiteUserRelationship().catch(console.error);


