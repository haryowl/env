require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');

async function checkMaintenanceSchedulesStructure() {
  console.log('🔍 Checking maintenance_schedules table structure...\n');

  try {
    // Get table structure
    const columns = await getRows(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'maintenance_schedules' 
      ORDER BY ordinal_position
    `);

    console.log('📋 maintenance_schedules table structure:');
    columns.forEach(col => {
      console.log(`   • ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });

    // Check if technician-specific columns exist
    const technicianColumns = [
      'technician_notes',
      'photos', 
      'gps_location',
      'technician_signature',
      'admin_approved',
      'admin_approved_by',
      'admin_approved_at',
      'admin_approval_notes',
      'maintenance_started_at',
      'maintenance_completed_at'
    ];

    console.log('\n🔍 Checking technician-specific columns:');
    technicianColumns.forEach(colName => {
      const exists = columns.some(col => col.column_name === colName);
      console.log(`   • ${colName}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
    });

    // Check if there are any maintenance schedules
    const count = await getRow('SELECT COUNT(*) as count FROM maintenance_schedules');
    console.log(`\n📊 Total maintenance schedules: ${count.count}`);

    if (count.count > 0) {
      // Show sample data
      const sample = await getRow(`
        SELECT maintenance_id, assigned_person, status, planned_date, maintenance_type
        FROM maintenance_schedules 
        LIMIT 1
      `);
      console.log('\n📋 Sample maintenance schedule:');
      console.log(`   • ID: ${sample.maintenance_id}`);
      console.log(`   • Assigned Person: ${sample.assigned_person}`);
      console.log(`   • Status: ${sample.status}`);
      console.log(`   • Planned Date: ${sample.planned_date}`);
      console.log(`   • Type: ${sample.maintenance_type}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkMaintenanceSchedulesStructure();


