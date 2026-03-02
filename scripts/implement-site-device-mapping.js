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

async function implementSiteDeviceMapping() {
  const client = await pool.connect();
  try {
    console.log('=== Implementing Site-Device Mapping Strategy ===\n');
    
    // Step 1: Add site_id column to devices table
    console.log('1. Adding site_id column to devices table...');
    try {
      await client.query(`
        ALTER TABLE devices 
        ADD COLUMN site_id INTEGER REFERENCES sites(site_id) ON DELETE SET NULL
      `);
      console.log('   ✅ site_id column added to devices table');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ⚠️  site_id column already exists');
      } else {
        console.log('   ❌ Error adding site_id column:', error.message);
      }
    }
    
    // Step 2: Create user_sites junction table
    console.log('\n2. Creating user_sites junction table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_sites (
          user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          site_id INTEGER NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
          assigned_at TIMESTAMP DEFAULT NOW(),
          assigned_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
          permission_level VARCHAR(20) DEFAULT 'viewer' CHECK (permission_level IN ('viewer', 'operator', 'admin')),
          PRIMARY KEY (user_id, site_id)
        )
      `);
      console.log('   ✅ user_sites table created');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ⚠️  user_sites table already exists');
      } else {
        console.log('   ❌ Error creating user_sites table:', error.message);
      }
    }
    
    // Step 3: Create indexes for performance
    console.log('\n3. Creating indexes...');
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_devices_site_id ON devices(site_id)
      `);
      console.log('   ✅ Index on devices.site_id created');
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_sites_user_id ON user_sites(user_id)
      `);
      console.log('   ✅ Index on user_sites.user_id created');
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_sites_site_id ON user_sites(site_id)
      `);
      console.log('   ✅ Index on user_sites.site_id created');
    } catch (error) {
      console.log('   ⚠️  Index creation warnings (may already exist):', error.message);
    }
    
    // Step 4: Show current data structure
    console.log('\n4. Current data structure:');
    
    const companies = await client.query('SELECT COUNT(*) as count FROM companies');
    const sites = await client.query('SELECT COUNT(*) as count FROM sites');
    const devices = await client.query('SELECT COUNT(*) as count FROM devices');
    const users = await client.query('SELECT COUNT(*) as count FROM users');
    const userSites = await client.query('SELECT COUNT(*) as count FROM user_sites');
    
    console.log(`   Companies: ${companies.rows[0].count}`);
    console.log(`   Sites: ${sites.rows[0].count}`);
    console.log(`   Devices: ${devices.rows[0].count}`);
    console.log(`   Users: ${users.rows[0].count}`);
    console.log(`   User-Site assignments: ${userSites.rows[0].count}`);
    
    // Step 5: Show sample relationships
    console.log('\n5. Sample relationships:');
    
    const sampleSites = await client.query(`
      SELECT s.site_id, s.site_name, c.company_name, COUNT(d.device_id) as device_count
      FROM sites s
      LEFT JOIN companies c ON s.company_id = c.company_id
      LEFT JOIN devices d ON s.site_id = d.site_id
      GROUP BY s.site_id, s.site_name, c.company_name
      LIMIT 3
    `);
    
    console.log('   Site-Company-Device relationships:');
    sampleSites.rows.forEach(site => {
      console.log(`     ${site.site_name} (${site.company_name}) - ${site.device_count} devices`);
    });
    
    console.log('\n✅ Site-Device mapping implementation completed!');
    console.log('\n📋 Next steps:');
    console.log('   1. Update API endpoints to filter data based on user_sites');
    console.log('   2. Update frontend to use new data structure');
    console.log('   3. Assign users to sites via user_sites table');
    console.log('   4. Assign devices to sites via devices.site_id column');
    
  } finally {
    client.release();
    await pool.end();
  }
}

implementSiteDeviceMapping().catch(console.error);


