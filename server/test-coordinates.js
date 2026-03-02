const { getRows, query } = require('./config/database');

async function testCoordinates() {
  try {
    console.log('Testing coordinates endpoint...');
    
    // First check the structure of device_data table
    console.log('Checking device_data table structure...');
    try {
      const tableInfo = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'device_data' 
        ORDER BY ordinal_position
      `);
      console.log('✅ device_data table columns:', tableInfo.rows.map(row => `${row.column_name} (${row.data_type})`));
    } catch (error) {
      console.log('❌ Error checking device_data table:', error.message);
    }

    // First ensure device_coordinates table exists
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS device_coordinates (
          id SERIAL PRIMARY KEY,
          device_id VARCHAR(50) NOT NULL,
          latitude NUMERIC,
          longitude NUMERIC,
          source VARCHAR(20) NOT NULL DEFAULT 'manual',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(device_id, source)
        )
      `);
      console.log('✅ device_coordinates table created/verified');
    } catch (error) {
      console.log('❌ Error creating device_coordinates table:', error.message);
    }

    // Test the full coordinates query
    console.log('Testing full coordinates query...');
    const devices = await getRows(`
      SELECT 
        d.device_id,
        d.name,
        d.status,
        d.created_at,
        d.updated_at,
        -- Try to get manual coordinates first
        (SELECT latitude FROM device_coordinates WHERE device_id = d.device_id AND source = 'manual' ORDER BY updated_at DESC LIMIT 1) as manual_latitude,
        (SELECT longitude FROM device_coordinates WHERE device_id = d.device_id AND source = 'manual' ORDER BY updated_at DESC LIMIT 1) as manual_longitude,
        -- Try to get device data coordinates (using correct column names)
        (SELECT field_value::numeric FROM device_data WHERE device_id = d.device_id AND field_name = 'latitude' ORDER BY timestamp DESC LIMIT 1) as device_latitude,
        (SELECT field_value::numeric FROM device_data WHERE device_id = d.device_id AND field_name = 'longitude' ORDER BY timestamp DESC LIMIT 1) as device_longitude,
        (SELECT field_value::numeric FROM device_data WHERE device_id = d.device_id AND field_name = 'lat' ORDER BY timestamp DESC LIMIT 1) as device_lat,
        (SELECT field_value::numeric FROM device_data WHERE device_id = d.device_id AND field_name = 'lng' ORDER BY timestamp DESC LIMIT 1) as device_lng,
        (SELECT field_value::numeric FROM device_data WHERE device_id = d.device_id AND field_name = 'lon' ORDER BY timestamp DESC LIMIT 1) as device_lon
      FROM devices d
      WHERE d.status != 'deleted'
      ORDER BY d.name ASC
    `);

    console.log('✅ Full coordinates query executed successfully');
    console.log('Found devices:', devices.length);
    
    // Process the results
    const processedDevices = devices.map(device => {
      const latitude = device.manual_latitude || device.device_latitude || device.device_lat;
      const longitude = device.manual_longitude || device.device_longitude || device.device_lng || device.device_lon;
      
      return {
        device_id: device.device_id,
        name: device.name,
        status: device.status,
        latitude: latitude,
        longitude: longitude
      };
    }).filter(device => device.latitude && device.longitude);

    console.log('✅ Processing completed');
    console.log('Devices with coordinates:', processedDevices.length);
    console.log('Sample devices with coordinates:', processedDevices.slice(0, 3));

  } catch (error) {
    console.error('❌ Error in test:', error);
    console.error('Stack trace:', error.stack);
  }
}

testCoordinates();