require('dotenv').config();
const { query, getRow, getRows } = require('../server/config/database');
const MaintenanceReminderService = require('../server/services/maintenanceReminderService');

async function testMaintenanceCompletion() {
  console.log('🧪 Testing maintenance completion notification...\n');

  try {
    // Check for any completed maintenance schedules
    const completedSchedules = await getRows(`
      SELECT 
        ms.*,
        ss.name as sensor_site_name,
        sd.brand_name,
        sd.sensor_type,
        s.site_name,
        ARRAY_AGG(u.email) FILTER (WHERE u.email IS NOT NULL) as site_user_emails
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      LEFT JOIN sensor_database sd ON ss.sensor_db_id = sd.sensor_db_id
      LEFT JOIN sites s ON ss.site_id = s.site_id
      LEFT JOIN sensor_site_users ssu ON ss.sensor_site_id = ssu.sensor_site_id
      LEFT JOIN users u ON ssu.user_id = u.user_id
      WHERE ms.completion_notification_sent = FALSE 
        AND ms.actual_date IS NOT NULL
        AND ms.status = 'completed'
      GROUP BY ms.maintenance_id, ss.name, sd.brand_name, sd.sensor_type, s.site_name
    `);

    console.log(`📋 Found ${completedSchedules.length} completed maintenance schedules needing notifications:`);
    
    if (completedSchedules.length === 0) {
      console.log('   No completed maintenance schedules found.');
      console.log('\n💡 To test completion notifications:');
      console.log('   1. Create a maintenance schedule');
      console.log('   2. Set status to "completed" and add an actual_date');
      console.log('   3. Run this test again');
      return;
    }

    for (const schedule of completedSchedules) {
      console.log(`\n📝 Schedule: ${schedule.sensor_site_name}`);
      console.log(`   - ID: ${schedule.maintenance_id}`);
      console.log(`   - Status: ${schedule.status}`);
      console.log(`   - Planned Date: ${schedule.planned_date}`);
      console.log(`   - Actual Date: ${schedule.actual_date}`);
      console.log(`   - Assigned Person: ${schedule.assigned_person}`);
      console.log(`   - Site Users: ${schedule.site_user_emails ? schedule.site_user_emails.join(', ') : 'None'}`);
      console.log(`   - Notification Sent: ${schedule.completion_notification_sent ? 'Yes' : 'No'}`);
    }

    // Test the completion notification service
    console.log('\n🔔 Testing completion notification service...');
    const maintenanceService = new MaintenanceReminderService();
    
    try {
      await maintenanceService.checkAndSendReminders();
      console.log('✅ Completion notification service ran successfully');
    } catch (error) {
      console.error('❌ Completion notification service failed:', error.message);
    }

    // Check if any notifications were sent
    const updatedSchedules = await getRows(`
      SELECT 
        ms.maintenance_id,
        ss.name as sensor_site_name,
        ms.completion_notification_sent,
        ms.completion_notification_sent_at
      FROM maintenance_schedules ms
      LEFT JOIN sensor_sites ss ON ms.sensor_site_id = ss.sensor_site_id
      WHERE ms.actual_date IS NOT NULL AND ms.status = 'completed'
    `);

    console.log('\n📊 Updated notification status:');
    for (const schedule of updatedSchedules) {
      console.log(`   - ${schedule.sensor_site_name}: ${schedule.completion_notification_sent ? '✅ Sent' : '❌ Not sent'} ${schedule.completion_notification_sent_at ? `(${schedule.completion_notification_sent_at})` : ''}`);
    }

    console.log('\n✅ Maintenance completion test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMaintenanceCompletion();


