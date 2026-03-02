const moment = require('moment-timezone');
const { getRows } = require('../config/database');
const mathFormulaService = require('./mathFormulaService');

class DeviceMapper {
  constructor() {
    this.defaultMappings = {
      // Common sensor field mappings
      'temp': 'temperature',
      'temperature': 'temperature',
      'hum': 'humidity',
      'humidity': 'humidity',
      'press': 'pressure',
      'pressure': 'pressure',
      'volt': 'voltage',
      'voltage': 'voltage',
      'curr': 'current',
      'current': 'current',
      'pow': 'power',
      'power': 'power',
      
      // GPS field mappings
      'lat': 'latitude',
      'latitude': 'latitude',
      'lon': 'longitude',
      'longitude': 'longitude',
      'alt': 'altitude',
      'altitude': 'altitude',
      'spd': 'speed',
      'speed': 'speed',
      'hdg': 'heading',
      'heading': 'heading',
      'acc': 'accuracy',
      'accuracy': 'accuracy',
      'sat': 'satellites',
      'satellites': 'satellites',
      
      // Time field mappings
      'ts': 'timestamp',
      'time': 'timestamp',
      'timestamp': 'timestamp',
      'dt': 'timestamp',
      'date': 'timestamp'
    };
  }

  async processDeviceData(device, rawData) {
    try {
      console.log('DeviceMapper: Processing data for device', device.device_id);
      console.log('DeviceMapper: Raw data:', rawData);
      
      // Get device-specific field mappings
      const fieldMappings = await this.getFieldMappings(device.device_id);
      console.log('DeviceMapper: Field mappings:', fieldMappings);
      
      // Apply field mappings
      let mappedData = this.applyFieldMappings(rawData, fieldMappings);
      console.log('DeviceMapper: Mapped data:', mappedData);
      
      // --- UTC conversion for datetime field ---
      // Convert device's local datetime to UTC for storage
      // Device timezone is the SOURCE timezone (e.g., Asia/Jakarta = UTC+7)
      // We need to convert FROM device timezone TO UTC
      if (mappedData.datetime && device.timezone && device.timezone !== 'UTC') {
        try {
          // Parse the datetime string in the device's timezone
          const deviceLocalTime = moment.tz(mappedData.datetime, device.timezone);
          
          if (deviceLocalTime.isValid()) {
            // Convert to UTC for storage
            const utcTime = deviceLocalTime.utc();
            mappedData.datetime = utcTime.toISOString();
            console.log(`DeviceMapper: Converted ${mappedData.datetime} from ${device.timezone} to UTC: ${utcTime.toISOString()}`);
          } else {
            console.warn('DeviceMapper: Invalid datetime for UTC conversion:', mappedData.datetime, 'with timezone', device.timezone);
            // Fallback: treat as UTC if conversion fails
            mappedData.datetime = moment.utc(mappedData.datetime).toISOString();
          }
        } catch (error) {
          console.error('DeviceMapper: Error converting datetime to UTC:', error);
          // Fallback: treat as UTC if conversion fails
          mappedData.datetime = moment.utc(mappedData.datetime).toISOString();
        }
      } else if (mappedData.datetime) {
        // If no device timezone specified, assume UTC
        mappedData.datetime = moment.utc(mappedData.datetime).toISOString();
      }
      // --- End UTC conversion ---
      
      // Apply data type conversions
      mappedData = this.applyDataTypeConversions(mappedData, fieldMappings);
      
      // Apply validation rules
      mappedData = this.applyValidationRules(mappedData, fieldMappings);
      
      // Apply default values
      mappedData = this.applyDefaultValues(mappedData, fieldMappings);
      
      // Apply formulas
      mappedData = await this.applyFormulas(mappedData, fieldMappings);
      
      return mappedData;
      
    } catch (error) {
      console.error('Error processing device data:', error);
      return rawData; // Return original data if processing fails
    }
  }

  async getFieldMappings(deviceId) {
    try {
      // Get custom field mappings from database
      const mappings = await getRows(
        'SELECT source_field, target_field, data_type, conversion_rule, validation_rule, default_value, is_required, formula FROM field_mappings WHERE device_id = $1',
        [deviceId]
      );

      // Get mapper template assignments
      const templateAssignment = await getRows(
        'SELECT template_id FROM device_mapper_assignments WHERE device_id = $1',
        [deviceId]
      );

      // Combine with default mappings
      const allMappings = { ...this.defaultMappings };
      
      // Add field mappings
      mappings.forEach(mapping => {
        allMappings[mapping.source_field] = {
          targetField: mapping.target_field,
          dataType: mapping.data_type,
          conversionRule: mapping.conversion_rule,
          validationRule: mapping.validation_rule,
          defaultValue: mapping.default_value,
          isRequired: mapping.is_required,
          formula: mapping.formula
        };
      });

      // Add mapper template mappings
      if (templateAssignment.length > 0) {
        const templateId = templateAssignment[0].template_id;
        const template = await getRows(
          'SELECT mappings FROM mapper_templates WHERE template_id = $1',
          [templateId]
        );

        if (template.length > 0 && template[0].mappings) {
          template[0].mappings.forEach(mapping => {
            allMappings[mapping.source_field] = {
              targetField: mapping.target_field,
              dataType: mapping.data_type,
              conversionRule: mapping.conversion_rule || {},
              validationRule: mapping.validation_rule || {},
              defaultValue: mapping.default_value,
              isRequired: mapping.is_required || false,
              formula: mapping.formula || ''
            };
          });
        }
      }

      return allMappings;
      
    } catch (error) {
      console.error('Error getting field mappings:', error);
      return this.defaultMappings;
    }
  }

  applyFieldMappings(data, mappings) {
    const mappedData = {};
    
    for (const [sourceField, value] of Object.entries(data)) {
      const mapping = mappings[sourceField];
      
      if (mapping) {
        // If mapping is a string, it's a simple field rename
        if (typeof mapping === 'string') {
          mappedData[mapping] = value;
        } else {
          // If mapping is an object, it has additional configuration
          mappedData[mapping.targetField] = value;
        }
      } else {
        // Keep original field name if no mapping exists
        mappedData[sourceField] = value;
      }
    }
    
    return mappedData;
  }

  applyDataTypeConversions(data, mappings) {
    const convertedData = {};
    
    for (const [field, value] of Object.entries(data)) {
      const mapping = mappings[field];
      let convertedValue = value;
      
      if (mapping && mapping.dataType) {
        convertedValue = this.convertDataType(value, mapping.dataType, mapping.conversionRule);
      }
      
      convertedData[field] = convertedValue;
    }
    
    return convertedData;
  }

  convertDataType(value, dataType, conversionRule = {}) {
    try {
      switch (dataType) {
        case 'number':
          if (typeof value === 'string') {
            // Handle unit conversions
            if (conversionRule.unit) {
              return this.convertUnit(value, conversionRule.unit);
            }
            return parseFloat(value) || 0;
          }
          return Number(value) || 0;
          
        case 'boolean':
          if (typeof value === 'string') {
            return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
          }
          return Boolean(value);
          
        case 'timestamp':
          return this.parseTimestamp(value, conversionRule);
          
        case 'json':
          if (typeof value === 'string') {
            return JSON.parse(value);
          }
          return value;
          
        default:
          return String(value);
      }
    } catch (error) {
      console.error(`Error converting data type for value ${value}:`, error);
      return value;
    }
  }

  convertUnit(value, targetUnit) {
    // Basic unit conversion logic
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return 0;
    
    // Add more unit conversions as needed
    switch (targetUnit) {
      case 'celsius':
        // Convert from Fahrenheit to Celsius
        if (value.toString().includes('F')) {
          return (numValue - 32) * 5/9;
        }
        return numValue;
        
      case 'fahrenheit':
        // Convert from Celsius to Fahrenheit
        if (value.toString().includes('C')) {
          return (numValue * 9/5) + 32;
        }
        return numValue;
        
      case 'meters':
        // Convert from feet to meters
        if (value.toString().includes('ft')) {
          return numValue * 0.3048;
        }
        return numValue;
        
      default:
        return numValue;
    }
  }

  parseTimestamp(value, conversionRule = {}) {
    try {
      let timestamp;
      
      // Handle different timestamp formats
      if (typeof value === 'number') {
        // Unix timestamp
        timestamp = moment.unix(value);
      } else if (typeof value === 'string') {
        // Try different date formats
        const formats = [
          'YYYY-MM-DD HH:mm:ss',
          'YYYY-MM-DDTHH:mm:ss.SSSZ',
          'YYYY-MM-DDTHH:mm:ssZ',
          'MM/DD/YYYY HH:mm:ss',
          'DD/MM/YYYY HH:mm:ss',
          'X', // Unix timestamp as string
          moment.ISO_8601
        ];
        
        timestamp = moment(value, formats, true);
        
        if (!timestamp.isValid()) {
          // Try parsing as ISO string
          timestamp = moment(value);
        }
      } else {
        timestamp = moment(value);
      }
      
      if (!timestamp.isValid()) {
        return new Date();
      }
      
      // Apply timezone conversion if specified
      if (conversionRule.timezone) {
        timestamp = timestamp.tz(conversionRule.timezone);
      }
      
      return timestamp.toDate();
      
    } catch (error) {
      console.error('Error parsing timestamp:', error);
      return new Date();
    }
  }

  applyValidationRules(data, mappings) {
    const validatedData = {};
    
    for (const [field, value] of Object.entries(data)) {
      const mapping = mappings[field];
      let isValid = true;
      
      if (mapping && mapping.validationRule) {
        isValid = this.validateValue(value, mapping.validationRule);
      }
      
      if (isValid) {
        validatedData[field] = value;
      } else {
        console.warn(`Validation failed for field ${field} with value ${value}`);
        // Use default value if validation fails
        if (mapping && mapping.defaultValue !== undefined) {
          validatedData[field] = mapping.defaultValue;
        }
      }
    }
    
    return validatedData;
  }

  validateValue(value, validationRule) {
    try {
      // Range validation
      if (validationRule.min !== undefined && value < validationRule.min) {
        return false;
      }
      if (validationRule.max !== undefined && value > validationRule.max) {
        return false;
      }
      
      // Pattern validation (regex)
      if (validationRule.pattern && typeof value === 'string') {
        const regex = new RegExp(validationRule.pattern);
        if (!regex.test(value)) {
          return false;
        }
      }
      
      // Enum validation
      if (validationRule.enum && !validationRule.enum.includes(value)) {
        return false;
      }
      
      // Required validation
      if (validationRule.required && (value === null || value === undefined || value === '')) {
        return false;
      }
      
      return true;
      
    } catch (error) {
      console.error('Error validating value:', error);
      return false;
    }
  }

  applyTimezoneConversion(data, deviceTimezone) {
    const convertedData = { ...data };
    
    // Convert timestamp fields to device timezone
    if (data.timestamp && deviceTimezone && deviceTimezone !== 'UTC') {
      try {
        const timestamp = moment(data.timestamp);
        convertedData.timestamp = timestamp.tz(deviceTimezone).toDate();
        convertedData.timestamp_utc = timestamp.utc().toDate();
      } catch (error) {
        console.error('Error converting timezone:', error);
      }
    }
    
    return convertedData;
  }

  applyDefaultValues(data, mappings) {
    const dataWithDefaults = { ...data };
    
    for (const [field, mapping] of Object.entries(mappings)) {
      if (typeof mapping === 'object' && mapping.defaultValue !== undefined) {
        if (!(mapping.targetField in dataWithDefaults)) {
          dataWithDefaults[mapping.targetField] = mapping.defaultValue;
        }
      }
    }
    
    return dataWithDefaults;
  }

  async applyFormulas(data, mappings) {
    const processedData = { ...data };
    for (const [field, value] of Object.entries(data)) {
      const mapping = mappings[field];
      if (mapping && mapping.formula) {
        try {
          processedData[field] = await mathFormulaService.evaluateFormula(value, mapping.formula);
        } catch (error) {
          console.error(`Error applying formula for field ${field}:`, error);
          // Optionally, set a default value or throw an error
          if (mapping.defaultValue !== undefined) {
            processedData[field] = mapping.defaultValue;
          } else {
            processedData[field] = value; // Keep original value if no default
          }
        }
      }
    }
    return processedData;
  }

  // Helper method to create field mapping
  async createFieldMapping(deviceId, sourceField, targetField, options = {}) {
    try {
      await query(`
        INSERT INTO field_mappings (device_id, source_field, target_field, data_type, conversion_rule, validation_rule, default_value, is_required)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (device_id, source_field) 
        DO UPDATE SET 
          target_field = $3,
          data_type = $4,
          conversion_rule = $5,
          validation_rule = $6,
          default_value = $7,
          is_required = $8
      `, [
        deviceId,
        sourceField,
        targetField,
        options.dataType || 'string',
        JSON.stringify(options.conversionRule || {}),
        JSON.stringify(options.validationRule || {}),
        options.defaultValue,
        options.isRequired || false
      ]);
      
      console.log(`Created field mapping: ${sourceField} -> ${targetField} for device ${deviceId}`);
      
    } catch (error) {
      console.error('Error creating field mapping:', error);
      throw error;
    }
  }

  // Helper method to get all mappings for a device
  async getDeviceMappings(deviceId) {
    try {
      return await getRows(
        'SELECT * FROM field_mappings WHERE device_id = $1 ORDER BY mapping_id',
        [deviceId]
      );
    } catch (error) {
      console.error('Error getting device mappings:', error);
      return [];
    }
  }

  // Helper method to delete field mapping
  async deleteFieldMapping(deviceId, sourceField) {
    try {
      await query(
        'DELETE FROM field_mappings WHERE device_id = $1 AND source_field = $2',
        [deviceId, sourceField]
      );
      
      console.log(`Deleted field mapping: ${sourceField} for device ${deviceId}`);
      
    } catch (error) {
      console.error('Error deleting field mapping:', error);
      throw error;
    }
  }
}

// Create singleton instance
const deviceMapper = new DeviceMapper();

// Export the processDeviceData function for use in other modules
const processDeviceData = (device, data) => deviceMapper.processDeviceData(device, data);

module.exports = {
  deviceMapper,
  processDeviceData
}; 