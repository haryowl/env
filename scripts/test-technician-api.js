require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function testTechnicianAPI() {
  console.log('🧪 Testing technician API logic...\n');

  try {
    // Get technician user
    const technicianUser = await getRow('SELECT user_id, username, role FROM users WHERE username = $1', ['tech111']);
    
    if (!technicianUser) {
      console.log('❌ Technician user tech111 not found');
      return;
    }

    console.log(`✅ Found technician user: ${technicianUser.username} (ID: ${technicianUser.user_id})`);

    // Test the technician schedule query
    console.log('\n🔍 Testing technician schedule query...');
    
    const schedules = await getRows(`
      SELECT 
        ms.maintenance_id,
        ms.maintenance_type,
        ms.planned_date,
        ms.actual_date,
        ms.assigned_person,
        ms.status,
        ms.description,
        ms.maintenance_notes,
        ms.technician_notes,
        ms.photos,
        ms.gps_location,
        ms.technician_signature,
        ms.admin_approved,
        ms.admin_approved_by,
        ms.admin_approved_at,
        ms.admin_approval_notes,
        ms.maintenance_started_at,
        ms.maintenance_completed_at,
        ms.created_at,
        ms.updated_at,
        ss.name as sensor_site_name,
        ss.parameter,
        sd.brand_name,
        sd.sensor_type,
        s.site_name,
        d.name as device_name
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN devices d ON ss.device_id = d.device_id
      WHERE ms.assigned_person = $1
      ORDER BY ms.planned_date DESC
    `, [technicianUser.username]);

    console.log(`\n📋 Found ${schedules.length} maintenance schedules for technician ${technicianUser.username}:`);
    
    if (schedules.length === 0) {
      console.log('   ℹ️ No maintenance schedules found for this technician');
      console.log('   This is normal if no schedules have been assigned yet');
    } else {
      schedules.forEach((schedule, index) => {
        console.log(`   ${index + 1}. ${schedule.sensor_site_name} - ${schedule.maintenance_type} (${schedule.status})`);
      });
    }

    // Test today's schedules query
    console.log('\n🔍 Testing today\'s schedules query...');
    
    const todaySchedules = await getRows(`
      SELECT 
        ms.maintenance_id,
        ms.maintenance_type,
        ms.planned_date,
        ms.actual_date,
        ms.assigned_person,
        ms.status,
        ms.description,
        ms.maintenance_notes,
        ms.technician_notes,
        ms.photos,
        ms.gps_location,
        ms.technician_signature,
        ms.admin_approved,
        ms.admin_approved_by,
        ms.admin_approved_at,
        ms.admin_approval_notes,
        ms.maintenance_started_at,
        ms.maintenance_completed_at,
        ms.created_at,
        ms.updated_at,
        ss.name as sensor_site_name,
        ss.parameter,
        sd.brand_name,
        sd.sensor_type,
        s.site_name,
        d.name as device_name
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN devices d ON ss.device_id = d.device_id
      WHERE ms.assigned_person = $1 AND ms.planned_date = CURRENT_DATE
      ORDER BY ms.planned_date DESC
    `, [technicianUser.username]);

    console.log(`\n📅 Found ${todaySchedules.length} today's schedules for technician ${technicianUser.username}:`);
    
    if (todaySchedules.length === 0) {
      console.log('   ℹ️ No schedules for today');
    } else {
      todaySchedules.forEach((schedule, index) => {
        console.log(`   ${index + 1}. ${schedule.sensor_site_name} - ${schedule.maintenance_type} (${schedule.status})`);
      });
    }

    console.log('\n✅ Technician API queries are working correctly!');
    console.log('The 500 error might be caused by:');
    console.log('1. Server not restarted after middleware changes');
    console.log('2. Database connection issues');
    console.log('3. Missing environment variables');

  } catch (error) {
    console.error('❌ Error testing technician API:', error);
    console.error('This explains the 500 Internal Server Error!');
  }
}

testTechnicianAPI();


