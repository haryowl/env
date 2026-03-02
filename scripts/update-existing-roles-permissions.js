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

async function updateRolePermissions() {
  const client = await pool.connect();
  
  try {
    console.log('Updating existing role permissions with new In Addition menus...');

    // Get all existing roles
    const roles = await client.query('SELECT role_id, role_name, menu_permissions FROM roles');
    console.log(`Found ${roles.rows.length} existing roles`);

    for (const role of roles.rows) {
      let menuPermissions = role.menu_permissions || {};
      
      // Add new In Addition menu permissions
      menuPermissions['/company-site'] = { access: true, read: true, create: true, update: true, delete: true };
      menuPermissions['/sensor-management'] = { access: true, read: true, create: true, update: true, delete: true };
      menuPermissions['/maintenance'] = { access: true, read: true, create: true, update: true, delete: true };

      // Update the role
      await client.query(`
        UPDATE roles 
        SET menu_permissions = $1 
        WHERE role_id = $2
      `, [JSON.stringify(menuPermissions), role.role_id]);

      console.log(`✅ Updated role: ${role.role_name}`);
    }

    console.log('\n🎉 All existing role permissions updated successfully!');
    
  } catch (error) {
    console.error('❌ Error updating role permissions:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

updateRolePermissions().catch(console.error);


