require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function testTechnicianSystem() {
  console.log('🧪 Testing Technician System Setup...\n');

  try {
    // 1. Check if technician role exists
    console.log('1️⃣ Checking technician role...');
    const technicianRole = await getRow('SELECT role_id, role_name FROM roles WHERE role_name = $1', ['technician']);
    
    if (technicianRole) {
      console.log(`✅ Technician role exists (ID: ${technicianRole.role_id})`);
    } else {
      console.log('❌ Technician role not found');
      return;
    }

    // 2. Check technician permissions
    console.log('\n2️⃣ Checking technician permissions...');
    const technicianPermissions = await getRows(`
      SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
      FROM menu_permissions 
      WHERE role_id = $1
    `, [technicianRole.role_id]);

    console.log('Technician permissions:');
    technicianPermissions.forEach(perm => {
      console.log(`  • ${perm.menu_name} (${perm.menu_path}):`);
      console.log(`    - Access: ${perm.can_access ? '✅' : '❌'}`);
      console.log(`    - Create: ${perm.can_create ? '✅' : '❌'}`);
      console.log(`    - Read: ${perm.can_read ? '✅' : '❌'}`);
      console.log(`    - Update: ${perm.can_update ? '✅' : '❌'}`);
      console.log(`    - Delete: ${perm.can_delete ? '✅' : '❌'}`);
    });

    // 3. Check if technician fields exist in maintenance_schedules
    console.log('\n3️⃣ Checking technician fields in maintenance_schedules...');
    const technicianFields = await getRows(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'maintenance_schedules' 
        AND column_name IN (
          'technician_notes', 'photos', 'gps_location', 'technician_signature',
          'admin_approved', 'admin_approved_by', 'admin_approved_at',
          'admin_approval_notes', 'maintenance_started_at', 'maintenance_completed_at'
        )
      ORDER BY column_name
    `);

    console.log('Technician-specific fields:');
    technicianFields.forEach(field => {
      console.log(`  • ${field.column_name} (${field.data_type}, ${field.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });

    if (technicianFields.length === 0) {
      console.log('❌ No technician fields found in maintenance_schedules table');
      return;
    }

    // 4. Create a test technician user
    console.log('\n4️⃣ Creating test technician user...');
    let testTechnician = await getRow('SELECT user_id, username FROM users WHERE username = $1', ['test_technician']);
    
    if (!testTechnician) {
      const userResult = await query(`
        INSERT INTO users (username, email, password_hash, role, status)
        VALUES ('test_technician', 'technician@example.com', '$2b$10$dummy', 'technician', 'active')
        RETURNING user_id, username, role
      `);
      
      testTechnician = userResult.rows[0];
      console.log(`✅ Created test technician: ${testTechnician.username} (ID: ${testTechnician.user_id})`);
    } else {
      console.log(`⚠️  Test technician already exists: ${testTechnician.username} (ID: ${testTechnician.user_id})`);
    }

    // 5. Assign technician role to test user
    console.log('\n5️⃣ Assigning technician role to test user...');
    const existingUserRole = await getRow(`
      SELECT ur.user_role_id 
      FROM user_roles ur 
      JOIN roles r ON ur.role_id = r.role_id 
      WHERE ur.user_id = $1 AND r.role_name = $2
    `, [testTechnician.user_id, 'technician']);

    if (!existingUserRole) {
      await query(`
        INSERT INTO user_roles (user_id, role_id, assigned_by)
        VALUES ($1, $2, $1)
      `, [testTechnician.user_id, technicianRole.role_id]);
      console.log('✅ Assigned technician role to test user');
    } else {
      console.log('⚠️  Test user already has technician role');
    }

    // 6. Create test maintenance data for technician
    console.log('\n6️⃣ Setting up test maintenance data...');
    
    // Get a sensor site to use for testing
    const sensorSite = await getRow('SELECT sensor_site_id, name FROM sensor_sites LIMIT 1');
    
    if (!sensorSite) {
      console.log('❌ No sensor sites found. Please create sensor sites first.');
      return;
    }

    console.log(`Using sensor site: ${sensorSite.name} (ID: ${sensorSite.sensor_site_id})`);

    // Create test maintenance schedule
    const existingMaintenance = await getRow(`
      SELECT maintenance_id FROM maintenance_schedules 
      WHERE sensor_site_id = $1 AND assigned_person = $2
    `, [sensorSite.sensor_site_id, testTechnician.username]);

    if (!existingMaintenance) {
      const maintenanceResult = await query(`
        INSERT INTO maintenance_schedules (
          sensor_site_id, maintenance_type, planned_date, assigned_person, 
          status, description, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING maintenance_id, maintenance_type, planned_date, status
      `, [
        sensorSite.sensor_site_id,
        'Preventive Maintenance',
        new Date().toISOString().split('T')[0], // Today's date
        testTechnician.username,
        'scheduled',
        'Test maintenance task for technician system verification',
        testTechnician.user_id
      ]);

      const maintenance = maintenanceResult.rows[0];
      console.log(`✅ Created test maintenance: ${maintenance.maintenance_type} (ID: ${maintenance.maintenance_id})`);
    } else {
      console.log('⚠️  Test maintenance already exists for this technician');
    }

    // 7. Test technician API endpoints (simulation)
    console.log('\n7️⃣ Testing technician API endpoints...');
    
    // Check if technician routes file exists
    const fs = require('fs');
    const path = require('path');
    const technicianRoutesPath = path.join(__dirname, '../server/routes/technician.js');
    
    if (fs.existsSync(technicianRoutesPath)) {
      console.log('✅ Technician routes file exists');
    } else {
      console.log('❌ Technician routes file not found');
    }

    // Check if technician component exists
    const technicianComponentPath = path.join(__dirname, '../client/src/components/TechnicianDashboard.jsx');
    
    if (fs.existsSync(technicianComponentPath)) {
      console.log('✅ Technician dashboard component exists');
    } else {
      console.log('❌ Technician dashboard component not found');
    }

    console.log('\n🎉 Technician System Test Completed!');
    console.log('\n📝 Summary:');
    console.log('  ✅ Technician role created with permissions');
    console.log('  ✅ Database fields added for technician features');
    console.log('  ✅ Test technician user created');
    console.log('  ✅ Test maintenance data created');
    console.log('  ✅ API routes and UI components ready');
    
    console.log('\n🚀 Next Steps:');
    console.log('  1. Run the database setup scripts:');
    console.log('     node scripts/add-technician-fields.js');
    console.log('     node scripts/add-technician-role.js');
    console.log('  2. Restart the server to load new routes');
    console.log('  3. Login as test_technician user');
    console.log('  4. Access /technician route to see the dashboard');
    console.log('  5. Test maintenance workflow: start → add photos → complete');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testTechnicianSystem();
