require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function testDataFiltering() {
  console.log('🧪 Testing data filtering for non-admin users...\n');

  try {
    // Test with a non-admin user (assuming user_id = 3 for operator role)
    const testUserId = 3;
    
    console.log(`📋 Testing data filtering for user_id: ${testUserId}\n`);

    // Test 1: Companies
    console.log('1️⃣ Testing Companies access:');
    const companies = await getRows(`
      SELECT DISTINCT
        c.company_id,
        c.company_name,
        c.address,
        c.contact_person_name,
        c.contact_person_phone,
        c.created_at,
        c.updated_at,
        c.created_by
      FROM companies c
      LEFT JOIN sites s ON c.company_id = s.company_id
      LEFT JOIN user_sites us ON s.site_id = us.site_id
      WHERE (c.created_by = $1 OR c.created_by IS NULL OR us.user_id = $1)
      ORDER BY c.company_name
    `, [testUserId]);
    
    console.log(`   Found ${companies.length} companies:`);
    companies.forEach(company => {
      console.log(`   - ${company.company_name} (ID: ${company.company_id}, Created by: ${company.created_by})`);
    });

    // Test 2: Sites
    console.log('\n2️⃣ Testing Sites access:');
    const sites = await getRows(`
      SELECT DISTINCT
        s.site_id,
        s.site_name,
        s.company_id,
        s.description,
        s.location,
        s.created_at,
        s.updated_at,
        s.created_by,
        c.company_name
      FROM sites s
      LEFT JOIN companies c ON s.company_id = c.company_id
      LEFT JOIN user_sites us ON s.site_id = us.site_id
      WHERE (s.created_by = $1 OR s.created_by IS NULL OR us.user_id = $1)
      ORDER BY s.site_name
    `, [testUserId]);
    
    console.log(`   Found ${sites.length} sites:`);
    sites.forEach(site => {
      console.log(`   - ${site.site_name} (ID: ${site.site_id}, Company: ${site.company_name}, Created by: ${site.created_by})`);
    });

    // Test 3: Sensor Sites
    console.log('\n3️⃣ Testing Sensor Sites access:');
    const sensorSites = await getRows(`
      SELECT 
        ss.sensor_site_id,
        ss.name,
        ss.sensor_db_id,
        ss.site_id,
        ss.parameter,
        ss.device_id,
        ss.status,
        ss.created_by,
        sd.brand_name,
        sd.sensor_type,
        sd.sensor_parameter,
        s.site_name,
        d.name as device_name,
        ARRAY_AGG(u.username) FILTER (WHERE u.username IS NOT NULL) as usernames,
        ARRAY_AGG(u.user_id) FILTER (WHERE u.user_id IS NOT NULL) as user_ids
      FROM sensor_sites ss
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN sensor_site_users ssu ON ss.sensor_site_id = ssu.sensor_site_id
      LEFT JOIN users u ON ssu.user_id = u.user_id
      LEFT JOIN devices d ON ss.device_id = d.device_id
      WHERE (ss.created_by = $1 OR ss.created_by IS NULL OR ssu.user_id = $1)
      GROUP BY ss.sensor_site_id, ss.name, ss.sensor_db_id, ss.site_id, ss.parameter, 
               ss.device_id, ss.status, ss.created_by,
               sd.brand_name, sd.sensor_type, sd.sensor_parameter, s.site_name, d.name
      ORDER BY ss.name
    `, [testUserId]);
    
    console.log(`   Found ${sensorSites.length} sensor sites:`);
    sensorSites.forEach(sensorSite => {
      const users = Array.isArray(sensorSite.usernames) ? sensorSite.usernames.join(', ') : 'No users';
      console.log(`   - ${sensorSite.name} (ID: ${sensorSite.sensor_site_id}, Site: ${sensorSite.site_name}, Users: ${users}, Created by: ${sensorSite.created_by})`);
    });

    // Test 4: Check user assignments
    console.log('\n4️⃣ Checking user assignments:');
    
    // Check user_sites assignments
    const userSites = await getRows(`
      SELECT us.site_id, s.site_name, us.assigned_by
      FROM user_sites us
      JOIN sites s ON us.site_id = s.site_id
      WHERE us.user_id = $1
    `, [testUserId]);
    
    console.log(`   User-Site assignments (${userSites.length}):`);
    userSites.forEach(assignment => {
      console.log(`   - Site: ${assignment.site_name} (ID: ${assignment.site_id}, Assigned by: ${assignment.assigned_by})`);
    });

    // Check sensor_site_users assignments
    const sensorSiteUsers = await getRows(`
      SELECT ssu.sensor_site_id, ss.name as sensor_site_name, ssu.assigned_by
      FROM sensor_site_users ssu
      JOIN sensor_sites ss ON ssu.sensor_site_id = ss.sensor_site_id
      WHERE ssu.user_id = $1
    `, [testUserId]);
    
    console.log(`   Sensor Site-User assignments (${sensorSiteUsers.length}):`);
    sensorSiteUsers.forEach(assignment => {
      console.log(`   - Sensor Site: ${assignment.sensor_site_name} (ID: ${assignment.sensor_site_id}, Assigned by: ${assignment.assigned_by})`);
    });

    console.log('\n✅ Data filtering test completed!');
    console.log('\n📝 Summary:');
    console.log(`   - Companies accessible: ${companies.length}`);
    console.log(`   - Sites accessible: ${sites.length}`);
    console.log(`   - Sensor Sites accessible: ${sensorSites.length}`);
    console.log(`   - Direct Site assignments: ${userSites.length}`);
    console.log(`   - Direct Sensor Site assignments: ${sensorSiteUsers.length}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDataFiltering();


