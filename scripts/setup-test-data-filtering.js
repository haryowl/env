require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function setupTestData() {
  console.log('🔧 Setting up test data for data filtering...\n');

  try {
    // Get a non-admin user (operator or viewer)
    const nonAdminUser = await getRow(`
      SELECT user_id, username, role 
      FROM users 
      WHERE role IN ('operator', 'viewer') 
      ORDER BY user_id 
      LIMIT 1
    `);

    if (!nonAdminUser) {
      console.log('❌ No non-admin user found! Creating one...');
      
      // Create a test operator user
      const result = await query(`
        INSERT INTO users (username, email, password, role, is_active)
        VALUES ('test_operator', 'test@example.com', '$2b$10$dummy', 'operator', true)
        RETURNING user_id, username, role
      `);
      
      console.log(`✅ Created test user: ${result.rows[0].username} (ID: ${result.rows[0].user_id})`);
      nonAdminUser.user_id = result.rows[0].user_id;
      nonAdminUser.username = result.rows[0].username;
      nonAdminUser.role = result.rows[0].role;
    } else {
      console.log(`👤 Using existing non-admin user: ${nonAdminUser.username} (ID: ${nonAdminUser.user_id}, Role: ${nonAdminUser.role})`);
    }

    // Step 1: Create a test company
    console.log('\n1️⃣ Creating test company...');
    const companyResult = await query(`
      INSERT INTO companies (company_name, address, contact_person_name, contact_person_phone, created_by)
      VALUES ('Test Company Ltd', '123 Test Street', 'John Doe', '+1234567890', $1)
      RETURNING company_id, company_name
    `, [nonAdminUser.user_id]);
    
    const companyId = companyResult.rows[0].company_id;
    console.log(`✅ Created company: ${companyResult.rows[0].company_name} (ID: ${companyId})`);

    // Step 2: Create a test site
    console.log('\n2️⃣ Creating test site...');
    const siteResult = await query(`
      INSERT INTO sites (site_name, company_id, description, location, created_by)
      VALUES ('Test Site Alpha', $1, 'Test site for data filtering', 'Test Location', $2)
      RETURNING site_id, site_name
    `, [companyId, nonAdminUser.user_id]);
    
    const siteId = siteResult.rows[0].site_id;
    console.log(`✅ Created site: ${siteResult.rows[0].site_name} (ID: ${siteId})`);

    // Step 3: Assign the user to the site
    console.log('\n3️⃣ Assigning user to site...');
    await query(`
      INSERT INTO user_sites (user_id, site_id, assigned_by)
      VALUES ($1, $2, $3)
    `, [nonAdminUser.user_id, siteId, nonAdminUser.user_id]);
    
    console.log(`✅ Assigned user ${nonAdminUser.username} to site ${siteId}`);

    // Step 4: Get a device to use for sensor site
    const device = await getRow('SELECT device_id, name FROM devices LIMIT 1');
    if (!device) {
      console.log('❌ No devices found! Please create a device first.');
      return;
    }

    // Step 5: Create a test sensor database entry
    console.log('\n4️⃣ Creating test sensor database entry...');
    const sensorDbResult = await query(`
      INSERT INTO sensor_database (brand_name, sensor_type, sensor_parameter)
      VALUES ('Test Brand', 'Test Sensor Type', 'Test Parameter')
      RETURNING sensor_db_id, brand_name
    `);
    
    const sensorDbId = sensorDbResult.rows[0].sensor_db_id;
    console.log(`✅ Created sensor database entry: ${sensorDbResult.rows[0].brand_name} (ID: ${sensorDbId})`);

    // Step 6: Create a test sensor site
    console.log('\n5️⃣ Creating test sensor site...');
    const sensorSiteResult = await query(`
      INSERT INTO sensor_sites (name, sensor_db_id, site_id, device_id, parameter, status, created_by)
      VALUES ('Test Sensor Site', $1, $2, $3, 'temperature', 'active', $4)
      RETURNING sensor_site_id, name
    `, [sensorDbId, siteId, device.device_id, nonAdminUser.user_id]);
    
    const sensorSiteId = sensorSiteResult.rows[0].sensor_site_id;
    console.log(`✅ Created sensor site: ${sensorSiteResult.rows[0].name} (ID: ${sensorSiteId})`);

    // Step 7: Assign the user to the sensor site
    console.log('\n6️⃣ Assigning user to sensor site...');
    await query(`
      INSERT INTO sensor_site_users (sensor_site_id, user_id, assigned_by)
      VALUES ($1, $2, $3)
    `, [sensorSiteId, nonAdminUser.user_id, nonAdminUser.user_id]);
    
    console.log(`✅ Assigned user ${nonAdminUser.username} to sensor site ${sensorSiteId}`);

    console.log('\n🎉 Test data setup completed!');
    console.log('\n📋 Summary:');
    console.log(`   - Test User: ${nonAdminUser.username} (ID: ${nonAdminUser.user_id})`);
    console.log(`   - Test Company: Test Company Ltd (ID: ${companyId})`);
    console.log(`   - Test Site: Test Site Alpha (ID: ${siteId})`);
    console.log(`   - Test Sensor Site: Test Sensor Site (ID: ${sensorSiteId})`);
    console.log(`   - User-Site Assignment: ✅`);
    console.log(`   - User-Sensor Site Assignment: ✅`);

    console.log('\n🧪 Now you can test the data filtering by running:');
    console.log(`   node scripts/test-data-filtering.js`);
    console.log('   (Make sure to update the test script to use user_id = ' + nonAdminUser.user_id + ')');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

setupTestData();


