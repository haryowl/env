require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function addInAdditionPermissions() {
  try {
    console.log('🔧 Adding "In Addition" menu permissions...');
    
    // Get role IDs
    const roles = await pool.query(`
      SELECT role_id, role_name FROM roles ORDER BY role_name
    `);
    
    console.log('👥 Available roles:');
    roles.rows.forEach(row => {
      console.log(`• ${row.role_name} (ID: ${row.role_id})`);
    });
    
    // Define the new menu permissions
    const newMenus = [
      {
        menu_path: '/company-site',
        menu_name: 'Company and Site',
        description: 'Manage companies and sites'
      },
      {
        menu_path: '/sensor-management', 
        menu_name: 'Sensor Management',
        description: 'Manage sensor database and sensor sites'
      },
      {
        menu_path: '/maintenance',
        menu_name: 'Maintenance',
        description: 'Manage maintenance schedules and reminders'
      }
    ];
    
    let addedCount = 0;
    
    for (const menu of newMenus) {
      console.log(`\n📝 Adding permissions for: ${menu.menu_name} (${menu.menu_path})`);
      
      for (const role of roles.rows) {
        // Determine permissions based on role
        let permissions = {
          can_access: false,
          can_create: false,
          can_read: false,
          can_update: false,
          can_delete: false
        };
        
        // Admin and Super Admin get full access
        if (role.role_name === 'admin' || role.role_name === 'super_admin') {
          permissions = {
            can_access: true,
            can_create: true,
            can_read: true,
            can_update: true,
            can_delete: true
          };
        }
        // Operator gets read access only
        else if (role.role_name === 'operator') {
          permissions = {
            can_access: true,
            can_create: false,
            can_read: true,
            can_update: false,
            can_delete: false
          };
        }
        // Viewer gets read access only
        else if (role.role_name === 'viewer') {
          permissions = {
            can_access: true,
            can_create: false,
            can_read: true,
            can_update: false,
            can_delete: false
          };
        }
        
        // Check if permission already exists
        const existing = await pool.query(`
          SELECT permission_id FROM menu_permissions 
          WHERE role_id = $1 AND menu_path = $2
        `, [role.role_id, menu.menu_path]);
        
        if (existing.rows.length === 0) {
          // Insert new permission
          await pool.query(`
            INSERT INTO menu_permissions (
              role_id, menu_path, menu_name, 
              can_access, can_create, can_read, can_update, can_delete,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          `, [
            role.role_id, 
            menu.menu_path, 
            menu.menu_name,
            permissions.can_access,
            permissions.can_create,
            permissions.can_read,
            permissions.can_update,
            permissions.can_delete
          ]);
          
          console.log(`  ✅ Added ${role.role_name}: access=${permissions.can_access}, create=${permissions.can_create}, read=${permissions.can_read}, update=${permissions.can_update}, delete=${permissions.can_delete}`);
          addedCount++;
        } else {
          console.log(`  ⚠️  Permission already exists for ${role.role_name}`);
        }
      }
    }
    
    console.log(`\n🎉 Successfully added ${addedCount} new menu permissions!`);
    
    // Verify the permissions were added
    console.log('\n📋 Verifying added permissions:');
    const verification = await pool.query(`
      SELECT 
        r.role_name,
        mp.menu_path,
        mp.menu_name,
        mp.can_access,
        mp.can_create,
        mp.can_read,
        mp.can_update,
        mp.can_delete
      FROM menu_permissions mp
      JOIN roles r ON mp.role_id = r.role_id
      WHERE mp.menu_path IN ('/company-site', '/sensor-management', '/maintenance')
      ORDER BY mp.menu_path, r.role_name
    `);
    
    verification.rows.forEach(row => {
      console.log(`• ${row.role_name} → ${row.menu_path}: access=${row.can_access}, CRUD=${row.can_create}/${row.can_read}/${row.can_update}/${row.can_delete}`);
    });
    
  } catch (error) {
    console.error('❌ Error adding menu permissions:', error.message);
  } finally {
    await pool.end();
  }
}

addInAdditionPermissions();


