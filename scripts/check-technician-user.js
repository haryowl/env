require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function checkTechnicianUser() {
  console.log('🔍 Checking technician user setup...\n');

  try {
    // Check if tech111 user exists and their role
    console.log('1️⃣ Checking tech111 user...');
    const user = await getRow('SELECT user_id, username, email, role, status FROM users WHERE username = $1', ['tech111']);
    
    if (!user) {
      console.log('❌ User tech111 not found');
      return;
    }
    
    console.log(`✅ User found: ${user.username} (ID: ${user.user_id})`);
    console.log(`   - Role: ${user.role}`);
    console.log(`   - Status: ${user.status}`);
    console.log(`   - Email: ${user.email}`);

    // Check if user has technician role assigned
    console.log('\n2️⃣ Checking role assignments...');
    const roleAssignments = await getRows(`
      SELECT r.role_name, r.role_id, ur.assigned_by
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
    `, [user.user_id]);

    if (roleAssignments.length === 0) {
      console.log('❌ No roles assigned to tech111 user');
      console.log('\n🔧 Fix: Assign technician role to tech111 user');
      
      // Get technician role ID
      const technicianRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['technician']);
      
      if (technicianRole) {
        console.log(`\n📝 To fix this, run the following SQL or use the UI:`);
        console.log(`INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (${user.user_id}, ${technicianRole.role_id}, 1);`);
      } else {
        console.log('❌ Technician role not found in system');
      }
    } else {
      console.log('✅ Role assignments:');
      roleAssignments.forEach(role => {
        console.log(`   - ${role.role_name} (ID: ${role.role_id})`);
      });
    }

    // Check menu permissions for technician role
    console.log('\n3️⃣ Checking technician menu permissions...');
    const technicianRole = await getRow('SELECT role_id FROM roles WHERE role_name = $1', ['technician']);
    
    if (technicianRole) {
      const permissions = await getRows(`
        SELECT menu_path, menu_name, can_access, can_create, can_read, can_update, can_delete
        FROM menu_permissions 
        WHERE role_id = $1
      `, [technicianRole.role_id]);

      console.log('Technician role permissions:');
      permissions.forEach(perm => {
        console.log(`   • ${perm.menu_name} (${perm.menu_path}):`);
        console.log(`     - Access: ${perm.can_access ? '✅' : '❌'}`);
        console.log(`     - Read: ${perm.can_read ? '✅' : '❌'}`);
        console.log(`     - Update: ${perm.can_update ? '✅' : '❌'}`);
      });
    }

    // Check if user is assigned to any sensor sites
    console.log('\n4️⃣ Checking sensor site assignments...');
    const sensorSiteAssignments = await getRows(`
      SELECT ss.name as sensor_site_name, ss.sensor_site_id, ssu.assigned_by
      FROM sensor_site_users ssu
      JOIN sensor_sites ss ON ssu.sensor_site_id = ss.sensor_site_id
      WHERE ssu.user_id = $1
    `, [user.user_id]);

    if (sensorSiteAssignments.length === 0) {
      console.log('❌ User not assigned to any sensor sites');
      console.log('\n🔧 Fix: Assign tech111 to sensor sites in Sensor Management');
    } else {
      console.log('✅ Sensor site assignments:');
      sensorSiteAssignments.forEach(assignment => {
        console.log(`   - ${assignment.sensor_site_name} (ID: ${assignment.sensor_site_id})`);
      });
    }

    console.log('\n🎯 Summary:');
    console.log(`   - User exists: ${user ? '✅' : '❌'}`);
    console.log(`   - Has technician role: ${roleAssignments.some(r => r.role_name === 'technician') ? '✅' : '❌'}`);
    console.log(`   - Assigned to sensor sites: ${sensorSiteAssignments.length > 0 ? '✅' : '❌'}`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkTechnicianUser();


