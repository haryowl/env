const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'AsuManeh',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function updateQuickViewPermissions() {
  try {
    console.log('Updating Quick View permissions...');
    
    // First, let's check the structure of the roles table
    const tableInfo = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'roles'
    `);
    console.log('Roles table columns:', tableInfo.rows);
    
    // Get all roles
    const rolesResult = await pool.query('SELECT * FROM roles');
    const roles = rolesResult.rows;
    console.log('Found roles:', roles);
    
    for (const role of roles) {
      console.log(`Updating permissions for role: ${role.name || role.role_name}`);
      
      let menuPermissions = role.menu_permissions || {};
      
      // Add Quick View permissions
      menuPermissions['/quick-view'] = {
        access: true,
        create: true,
        read: true,
        update: true,
        delete: true
      };
      
      // Update the role - try different possible column names
      const roleId = role.id || role.role_id || role.user_id;
      if (!roleId) {
        console.log('Skipping role without ID:', role);
        continue;
      }
      
      await pool.query(
        'UPDATE roles SET menu_permissions = $1 WHERE role_id = $2',
        [menuPermissions, roleId]
      );
      
      console.log(`Updated permissions for role: ${role.name || role.role_name}`);
    }
    
    console.log('Quick View permissions updated successfully!');
  } catch (error) {
    console.error('Error updating Quick View permissions:', error);
  } finally {
    await pool.end();
  }
}

updateQuickViewPermissions();