require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function testComprehensiveDataFiltering() {
  console.log('🧪 Comprehensive Data Filtering Test\n');

  try {
    // First, let's see what data exists in the system
    console.log('📊 SYSTEM OVERVIEW:');
    
    const allCompanies = await getRows('SELECT company_id, company_name, created_by FROM companies ORDER BY company_name');
    console.log(`   Total Companies: ${allCompanies.length}`);
    allCompanies.forEach(c => console.log(`   - ${c.company_name} (ID: ${c.company_id}, Created by: ${c.created_by})`));

    const allSites = await getRows('SELECT site_id, site_name, company_id, created_by FROM sites ORDER BY site_name');
    console.log(`\n   Total Sites: ${allSites.length}`);
    allSites.forEach(s => console.log(`   - ${s.site_name} (ID: ${s.site_id}, Company: ${s.company_id}, Created by: ${s.created_by})`));

    const allSensorSites = await getRows('SELECT sensor_site_id, name, site_id, created_by FROM sensor_sites ORDER BY name');
    console.log(`\n   Total Sensor Sites: ${allSensorSites.length}`);
    allSensorSites.forEach(ss => console.log(`   - ${ss.name} (ID: ${ss.sensor_site_id}, Site: ${ss.site_id}, Created by: ${ss.created_by})`));

    // Check user assignments
    const allUserSites = await getRows('SELECT user_id, site_id FROM user_sites ORDER BY user_id, site_id');
    console.log(`\n   Total User-Site Assignments: ${allUserSites.length}`);
    allUserSites.forEach(us => console.log(`   - User ${us.user_id} → Site ${us.site_id}`));

    const allSensorSiteUsers = await getRows('SELECT user_id, sensor_site_id FROM sensor_site_users ORDER BY user_id, sensor_site_id');
    console.log(`\n   Total Sensor Site-User Assignments: ${allSensorSiteUsers.length}`);
    allSensorSiteUsers.forEach(ssu => console.log(`   - User ${ssu.user_id} → Sensor Site ${ssu.sensor_site_id}`));

    // Get list of users
    const allUsers = await getRows('SELECT user_id, username, role FROM users ORDER BY user_id');
    console.log(`\n   Total Users: ${allUsers.length}`);
    allUsers.forEach(u => console.log(`   - ${u.username} (ID: ${u.user_id}, Role: ${u.role})`));

    console.log('\n' + '='.repeat(60));
    console.log('🔍 TESTING DATA ACCESS FOR DIFFERENT USERS:\n');

    // Test each user's access
    for (const user of allUsers) {
      console.log(`👤 Testing User: ${user.username} (ID: ${user.user_id}, Role: ${user.role})`);
      
      // Test Companies access
      const companies = await getRows(`
        SELECT DISTINCT
          c.company_id,
          c.company_name,
          c.created_by
        FROM companies c
        LEFT JOIN sites s ON c.company_id = s.company_id
        LEFT JOIN user_sites us ON s.site_id = us.site_id
        WHERE (c.created_by = $1 OR c.created_by IS NULL OR us.user_id = $1)
        ORDER BY c.company_name
      `, [user.user_id]);
      
      console.log(`   📈 Companies accessible: ${companies.length}`);
      companies.forEach(c => console.log(`      - ${c.company_name} (Created by: ${c.created_by})`));

      // Test Sites access
      const sites = await getRows(`
        SELECT DISTINCT
          s.site_id,
          s.site_name,
          s.company_id,
          s.created_by
        FROM sites s
        LEFT JOIN user_sites us ON s.site_id = us.site_id
        WHERE (s.created_by = $1 OR s.created_by IS NULL OR us.user_id = $1)
        ORDER BY s.site_name
      `, [user.user_id]);
      
      console.log(`   🏢 Sites accessible: ${sites.length}`);
      sites.forEach(s => console.log(`      - ${s.site_name} (Company: ${s.company_id}, Created by: ${s.created_by})`));

      // Test Sensor Sites access
      const sensorSites = await getRows(`
        SELECT DISTINCT
          ss.sensor_site_id,
          ss.name,
          ss.site_id,
          ss.created_by
        FROM sensor_sites ss
        LEFT JOIN sensor_site_users ssu ON ss.sensor_site_id = ssu.sensor_site_id
        WHERE (ss.created_by = $1 OR ss.created_by IS NULL OR ssu.user_id = $1)
        ORDER BY ss.name
      `, [user.user_id]);
      
      console.log(`   🔧 Sensor Sites accessible: ${sensorSites.length}`);
      sensorSites.forEach(ss => console.log(`      - ${ss.name} (Site: ${ss.site_id}, Created by: ${ss.created_by})`));

      console.log('');
    }

    console.log('='.repeat(60));
    console.log('💡 RECOMMENDATIONS:\n');

    if (allUserSites.length === 0) {
      console.log('⚠️  No user-site assignments found!');
      console.log('   To test the filtering, you need to:');
      console.log('   1. Create a company and site');
      console.log('   2. Assign a non-admin user to that site');
      console.log('   3. The user should then see the company and site');
    }

    if (allSensorSiteUsers.length === 0) {
      console.log('⚠️  No sensor site-user assignments found!');
      console.log('   To test sensor site filtering, you need to:');
      console.log('   1. Create a sensor site');
      console.log('   2. Assign a non-admin user to that sensor site');
      console.log('   3. The user should then see the sensor site');
    }

    console.log('\n✅ Comprehensive test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testComprehensiveDataFiltering();


