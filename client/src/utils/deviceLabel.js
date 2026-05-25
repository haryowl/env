/** Display label for device filters and selects (name only; falls back to device_id). */
export function getDeviceDisplayName(device) {
  if (!device) return '';
  const name = typeof device.name === 'string' ? device.name.trim() : '';
  if (name) return name;
  return device.device_id || '';
}
