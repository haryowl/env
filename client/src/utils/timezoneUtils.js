import moment from 'moment-timezone';

// Comprehensive timezone list with UTC offsets
export const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC (UTC+0)' },
  
  // Asia
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta (UTC+7)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (UTC+7)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { value: 'Asia/Manila', label: 'Asia/Manila (UTC+8)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong Kong (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (UTC+9)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (UTC+5:30)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+4)' },
  
  // Europe
  { value: 'Europe/London', label: 'Europe/London (UTC+0/UTC+1)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (UTC+1/UTC+2)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (UTC+1/UTC+2)' },
  { value: 'Europe/Rome', label: 'Europe/Rome (UTC+1/UTC+2)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow (UTC+3)' },
  
  // Americas
  { value: 'America/New_York', label: 'America/New York (UTC-5/UTC-4)' },
  { value: 'America/Chicago', label: 'America/Chicago (UTC-6/UTC-5)' },
  { value: 'America/Denver', label: 'America/Denver (UTC-7/UTC-6)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (UTC-8/UTC-7)' },
  { value: 'America/Toronto', label: 'America/Toronto (UTC-5/UTC-4)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao Paulo (UTC-3/UTC-2)' },
  
  // Australia/Oceania
  { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC+10/UTC+11)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne (UTC+10/UTC+11)' },
  { value: 'Australia/Perth', label: 'Australia/Perth (UTC+8)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (UTC+12/UTC+13)' },
  
  // Africa
  { value: 'Africa/Cairo', label: 'Africa/Cairo (UTC+2)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (UTC+2)' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (UTC+1)' },
];

// Get user's preferred timezone
export const getUserTimezone = () => {
  return localStorage.getItem('iot_timezone') || moment.tz.guess() || 'UTC';
};

// Format datetime in user's timezone
export const formatInUserTimezone = (datetime, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!datetime) return '-';
  
  try {
    // If datetime is already a string, parse it as UTC first
    const utcMoment = moment.utc(datetime);
    if (!utcMoment.isValid()) {
      return '-';
    }
    
    const userTz = getUserTimezone();
    return utcMoment.tz(userTz).format(format);
  } catch (error) {
    console.error('Error formatting datetime:', error);
    return '-';
  }
};

// Convert device datetime to UTC
export const convertDeviceTimeToUTC = (deviceTime, deviceTimezone) => {
  if (!deviceTime || !deviceTimezone) {
    return moment.utc(deviceTime).toISOString();
  }
  
  try {
    const deviceLocalTime = moment.tz(deviceTime, deviceTimezone);
    if (deviceLocalTime.isValid()) {
      return deviceLocalTime.utc().toISOString();
    } else {
      // Fallback: treat as UTC
      return moment.utc(deviceTime).toISOString();
    }
  } catch (error) {
    console.error('Error converting device time to UTC:', error);
    return moment.utc(deviceTime).toISOString();
  }
};

// Convert UTC to user's timezone
export const convertUTCToUserTimezone = (utcTime) => {
  if (!utcTime) return null;
  
  try {
    const utcMoment = moment.utc(utcTime);
    if (!utcMoment.isValid()) {
      return null;
    }
    
    const userTz = getUserTimezone();
    return utcMoment.tz(userTz);
  } catch (error) {
    console.error('Error converting UTC to user timezone:', error);
    return null;
  }
};

// Get timezone offset string (e.g., "UTC+7", "UTC-5")
export const getTimezoneOffset = (timezone) => {
  try {
    const offset = moment.tz(timezone).format('Z');
    const offsetHours = parseInt(offset.replace(':', ''));
    const sign = offsetHours >= 0 ? '+' : '';
    return `UTC${sign}${offsetHours}`;
  } catch (error) {
    return 'UTC+0';
  }
};

// Get timezone label with offset
export const getTimezoneLabel = (timezone) => {
  const option = TIMEZONE_OPTIONS.find(opt => opt.value === timezone);
  if (option) {
    return option.label;
  }
  
  // For custom timezones, generate label with offset
  const offset = getTimezoneOffset(timezone);
  const name = timezone.split('/').pop().replace('_', ' ');
  return `${name} (${offset})`;
}; 