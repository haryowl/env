require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function addTechnicianFields() {
  console.log('🔧 Adding technician-specific fields to maintenance_schedules table...\n');

  try {
    // Check current table structure
    console.log('📋 Current maintenance_schedules table structure:');
    const currentColumns = await getRows(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'maintenance_schedules' 
      ORDER BY ordinal_position
    `);
    
    console.log('Current columns:');
    currentColumns.forEach(col => {
      console.log(`  • ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });

    // Add technician-specific columns
    const technicianColumns = [
      {
        name: 'technician_notes',
        type: 'TEXT',
        comment: 'Technician notes and observations during maintenance'
      },
      {
        name: 'photos',
        type: 'JSONB',
        comment: 'JSON array of photo URLs and metadata'
      },
      {
        name: 'gps_location',
        type: 'JSONB',
        comment: 'GPS coordinates and location data'
      },
      {
        name: 'technician_signature',
        type: 'TEXT',
        comment: 'Base64 encoded signature image'
      },
      {
        name: 'admin_approved',
        type: 'BOOLEAN',
        default: 'FALSE',
        comment: 'Whether maintenance completion is approved by admin'
      },
      {
        name: 'admin_approved_by',
        type: 'INTEGER',
        comment: 'User ID of admin who approved the maintenance'
      },
      {
        name: 'admin_approved_at',
        type: 'TIMESTAMP',
        comment: 'Timestamp when maintenance was approved by admin'
      },
      {
        name: 'admin_approval_notes',
        type: 'TEXT',
        comment: 'Admin notes or comments on the maintenance completion'
      },
      {
        name: 'maintenance_started_at',
        type: 'TIMESTAMP',
        comment: 'When technician started the maintenance work'
      },
      {
        name: 'maintenance_completed_at',
        type: 'TIMESTAMP',
        comment: 'When technician marked maintenance as completed'
      }
    ];

    console.log('\n🔧 Adding technician-specific columns...');
    
    for (const column of technicianColumns) {
      try {
        let alterQuery = `ALTER TABLE maintenance_schedules ADD COLUMN ${column.name} ${column.type}`;
        
        if (column.default) {
          alterQuery += ` DEFAULT ${column.default}`;
        }
        
        await query(alterQuery);
        console.log(`✅ Added column: ${column.name}`);
        
        // Add comment
        await query(`
          COMMENT ON COLUMN maintenance_schedules.${column.name} IS '${column.comment}'
        `);
        
      } catch (error) {
        if (error.code === '42701') { // Column already exists
          console.log(`⚠️  Column ${column.name} already exists, skipping...`);
        } else {
          throw error;
        }
      }
    }

    // Add foreign key constraint for admin_approved_by
    try {
      await query(`
        ALTER TABLE maintenance_schedules 
        ADD CONSTRAINT fk_maintenance_admin_approved_by 
        FOREIGN KEY (admin_approved_by) REFERENCES users(user_id)
      `);
      console.log('✅ Added foreign key constraint for admin_approved_by');
    } catch (error) {
      if (error.code === '42710') { // Constraint already exists
        console.log('⚠️  Foreign key constraint already exists, skipping...');
      } else {
        throw error;
      }
    }

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_maintenance_admin_approved ON maintenance_schedules(admin_approved)',
      'CREATE INDEX IF NOT EXISTS idx_maintenance_technician_status ON maintenance_schedules(status, maintenance_started_at)',
      'CREATE INDEX IF NOT EXISTS idx_maintenance_pending_approval ON maintenance_schedules(admin_approved, status) WHERE status = \'completed\''
    ];

    console.log('\n📊 Creating performance indexes...');
    for (const indexQuery of indexes) {
      await query(indexQuery);
    }
    console.log('✅ Created performance indexes');

    // Update existing records with default values
    console.log('\n🔄 Updating existing records...');
    const updateResult = await query(`
      UPDATE maintenance_schedules 
      SET admin_approved = FALSE 
      WHERE admin_approved IS NULL
    `);
    console.log(`✅ Updated ${updateResult.rowCount} existing records`);

    // Verify the new structure
    console.log('\n📋 Updated maintenance_schedules table structure:');
    const updatedColumns = await getRows(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'maintenance_schedules' 
      ORDER BY ordinal_position
    `);
    
    console.log('All columns:');
    updatedColumns.forEach(col => {
      console.log(`  • ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });

    console.log('\n🎉 Technician fields setup completed successfully!');
    console.log('\n📝 New fields added:');
    technicianColumns.forEach(col => {
      console.log(`  • ${col.name} - ${col.comment}`);
    });

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

addTechnicianFields();
