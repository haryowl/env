const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const checkEmailTables = async () => {
  try {
    console.log('🔍 Checking email-related tables...\n');

    // Check all tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📊 All tables in database:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // Check for email-related tables
    const emailTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%email%' OR table_name LIKE '%notification%' OR table_name LIKE '%config%')
      ORDER BY table_name
    `);
    
    console.log('\n📧 Email-related tables:');
    if (emailTables.rows.length === 0) {
      console.log('  ❌ No email-related tables found!');
    } else {
      emailTables.rows.forEach(row => {
        console.log(`  ✅ ${row.table_name}`);
      });
    }

    // Check export recipients
    console.log('\n📧 Export recipients for NewTest (ID: 15):');
    try {
      const recipients = await pool.query(`
        SELECT 
          eer.email,
          eer.name,
          eer.is_active
        FROM export_email_recipients eer
        WHERE eer.export_id = 15
      `);
      
      if (recipients.rows.length === 0) {
        console.log('  ❌ No recipients found!');
      } else {
        console.log(`  ✅ Found ${recipients.rows.length} recipients:`);
        recipients.rows.forEach((recipient, index) => {
          console.log(`    ${index + 1}. ${recipient.email} (${recipient.name}) - Active: ${recipient.is_active}`);
        });
      }
    } catch (error) {
      console.log(`  ❌ Error checking recipients: ${error.message}`);
    }

    console.log('\n🎉 Table check completed!');

  } catch (error) {
    console.error('❌ Error checking tables:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the check
checkEmailTables()
  .then(() => {
    console.log('\n✅ Table check completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Table check failed:', error);
    process.exit(1);
  });


