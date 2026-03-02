const { parse, parseISO, isValid } = require('date-fns');

function parseDeviceDatetime(value) {
  if (!value) return null;

  // Try ISO 8601
  let date = parseISO(value);
  if (isValid(date)) return date;

  // Try 'dd-MM-yyyy HH:mm:ss.SSS'
  date = parse(value, 'dd-MM-yyyy HH:mm:ss.SSS', new Date());
  if (isValid(date)) return date;

  // Try 'yyyy-MM-dd HH:mm:ss.SSS'
  date = parse(value, 'yyyy-MM-dd HH:mm:ss.SSS', new Date());
  if (isValid(date)) return date;

  // Try Unix timestamp (seconds or ms)
  if (!isNaN(Number(value))) {
    const num = Number(value);
    if (num > 1e12) return new Date(num); // ms
    if (num > 1e9) return new Date(num * 1000); // s
  }

  // Fallback: try Date constructor
  date = new Date(value);
  if (isValid(date)) return date;

  return null; // Could not parse
}

module.exports = parseDeviceDatetime; 