require('dotenv').config();
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function populateSensorDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Populating sensor database with sample data...');
    
    // Sample sensor data
    const sensors = [
      // Temperature Sensors
      {
        brand_name: 'Honeywell',
        type_sensor: 'Temperature Sensor',
        sensor_parameter: 'Temperature',
        description: 'High-precision temperature sensor for industrial applications',
        specifications: 'Range: -40°C to 125°C, Accuracy: ±0.1°C, Response Time: 1s'
      },
      {
        brand_name: 'Siemens',
        type_sensor: 'Temperature Sensor',
        sensor_parameter: 'Temperature',
        description: 'Industrial temperature sensor with 4-20mA output',
        specifications: 'Range: -50°C to 150°C, Accuracy: ±0.2°C, Output: 4-20mA'
      },
      {
        brand_name: 'Bosch',
        type_sensor: 'Temperature Sensor',
        sensor_parameter: 'Temperature',
        description: 'Digital temperature sensor with I2C interface',
        specifications: 'Range: -55°C to 125°C, Accuracy: ±0.5°C, Interface: I2C'
      },
      
      // Humidity Sensors
      {
        brand_name: 'Sensirion',
        type_sensor: 'Humidity Sensor',
        sensor_parameter: 'Humidity',
        description: 'High-accuracy humidity and temperature sensor',
        specifications: 'Range: 0-100% RH, Accuracy: ±1.5% RH, Interface: I2C/SPI'
      },
      {
        brand_name: 'Honeywell',
        type_sensor: 'Humidity Sensor',
        sensor_parameter: 'Humidity',
        description: 'Industrial humidity sensor with analog output',
        specifications: 'Range: 0-100% RH, Accuracy: ±2% RH, Output: 0-10V'
      },
      
      // Pressure Sensors
      {
        brand_name: 'Bosch',
        type_sensor: 'Pressure Sensor',
        sensor_parameter: 'Pressure',
        description: 'Digital barometric pressure sensor',
        specifications: 'Range: 300-1100 hPa, Accuracy: ±1 hPa, Interface: I2C/SPI'
      },
      {
        brand_name: 'Sensirion',
        type_sensor: 'Pressure Sensor',
        sensor_parameter: 'Pressure',
        description: 'High-precision differential pressure sensor',
        specifications: 'Range: ±125 Pa, Accuracy: ±0.1 Pa, Interface: I2C'
      },
      
      // Soil Sensors
      {
        brand_name: 'Vegetronix',
        type_sensor: 'Soil Moisture Sensor',
        sensor_parameter: 'Soil Moisture',
        description: 'Volumetric water content sensor for agricultural applications',
        specifications: 'Range: 0-100% VWC, Accuracy: ±2% VWC, Output: 0-3V'
      },
      {
        brand_name: 'Decagon',
        type_sensor: 'Soil Temperature Sensor',
        sensor_parameter: 'Soil Temperature',
        description: 'Soil temperature sensor with high accuracy',
        specifications: 'Range: -40°C to 60°C, Accuracy: ±0.5°C, Response Time: 5s'
      },
      {
        brand_name: 'Sensoterra',
        type_sensor: 'Soil pH Sensor',
        sensor_parameter: 'Soil pH',
        description: 'Digital soil pH sensor with automatic calibration',
        specifications: 'Range: 0-14 pH, Accuracy: ±0.1 pH, Interface: RS485'
      },
      
      // Air Quality Sensors
      {
        brand_name: 'Sensirion',
        type_sensor: 'CO2 Sensor',
        sensor_parameter: 'CO2',
        description: 'NDIR CO2 sensor with temperature compensation',
        specifications: 'Range: 0-40000 ppm, Accuracy: ±50 ppm, Interface: I2C'
      },
      {
        brand_name: 'Bosch',
        type_sensor: 'Air Quality Sensor',
        sensor_parameter: 'Air Quality Index',
        description: 'Multi-gas sensor for air quality monitoring',
        specifications: 'Detects: CO2, VOC, NO2, CO, Interface: I2C'
      },
      
      // Light Sensors
      {
        brand_name: 'AMS',
        type_sensor: 'Light Sensor',
        sensor_parameter: 'Light Intensity',
        description: 'Digital ambient light sensor with wide dynamic range',
        specifications: 'Range: 0.01-83k lux, Accuracy: ±10%, Interface: I2C'
      },
      {
        brand_name: 'Adafruit',
        type_sensor: 'UV Sensor',
        sensor_parameter: 'UV Index',
        description: 'UV index sensor for outdoor monitoring',
        specifications: 'Range: 0-11 UV Index, Accuracy: ±1 UV Index, Interface: I2C'
      },
      
      // Wind Sensors
      {
        brand_name: 'Davis',
        type_sensor: 'Wind Speed Sensor',
        sensor_parameter: 'Wind Speed',
        description: 'Cup anemometer for wind speed measurement',
        specifications: 'Range: 0-200 mph, Accuracy: ±1 mph, Output: 0.5V per mph'
      },
      {
        brand_name: 'Davis',
        type_sensor: 'Wind Direction Sensor',
        sensor_parameter: 'Wind Direction',
        description: 'Wind vane for wind direction measurement',
        specifications: 'Range: 0-360°, Accuracy: ±3°, Output: 0-5V'
      },
      
      // Water Level Sensors
      {
        brand_name: 'Milltronics',
        type_sensor: 'Water Level Sensor',
        sensor_parameter: 'Water Level',
        description: 'Ultrasonic water level sensor for tanks and reservoirs',
        specifications: 'Range: 0.3-15m, Accuracy: ±3mm, Output: 4-20mA'
      },
      {
        brand_name: 'Honeywell',
        type_sensor: 'Water Quality Sensor',
        sensor_parameter: 'Water pH',
        description: 'Digital pH sensor for water quality monitoring',
        specifications: 'Range: 0-14 pH, Accuracy: ±0.1 pH, Interface: RS485'
      }
    ];

    // Insert sensors
    for (const sensor of sensors) {
      await client.query(`
        INSERT INTO sensor_database (brand_name, sensor_type, sensor_parameter, description, specifications)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `, [sensor.brand_name, sensor.type_sensor, sensor.sensor_parameter, sensor.description, JSON.stringify({ specs: sensor.specifications })]);
    }

    console.log(`✅ Successfully populated sensor database with ${sensors.length} sensor types`);
    
    // Show summary
    const result = await client.query('SELECT COUNT(*) as count FROM sensor_database');
    console.log(`📊 Total sensors in database: ${result.rows[0].count}`);
    
    // Show categories
    const categories = await client.query(`
      SELECT sensor_type, COUNT(*) as count 
      FROM sensor_database 
      GROUP BY sensor_type 
      ORDER BY count DESC
    `);
    
    console.log('\n📋 Sensor Categories:');
    categories.rows.forEach(cat => {
      console.log(`  • ${cat.sensor_type}: ${cat.count} sensors`);
    });

  } catch (error) {
    console.error('❌ Error populating sensor database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
populateSensorDatabase();
