export const GROUP_FILTER_ALL = 'all';
export const GROUP_FILTER_UNGROUPED = 'ungrouped';

export function collectKnownGroups(devices = [], catalogGroups = []) {
  const map = new Map();
  catalogGroups.forEach((g) => {
    if (g?.group_id && g?.name) {
      map.set(String(g.group_id), {
        id: String(g.group_id),
        name: g.name,
        description: g.description || '',
      });
    }
  });
  devices.forEach((d) => {
    if (d.group_id && d.group_name && !map.has(String(d.group_id))) {
      map.set(String(d.group_id), {
        id: String(d.group_id),
        name: d.group_name,
        description: d.group_description || '',
      });
    }
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function filterDevicesByGroup(devices = [], groupFilter = GROUP_FILTER_ALL) {
  if (groupFilter === GROUP_FILTER_ALL) return devices;
  if (groupFilter === GROUP_FILTER_UNGROUPED) return devices.filter((d) => !d.group_id);
  return devices.filter((d) => String(d.group_id) === String(groupFilter));
}

export function resolveGroupFilterValue(groupFilter, knownGroups = []) {
  if (
    groupFilter === GROUP_FILTER_ALL
    || groupFilter === GROUP_FILTER_UNGROUPED
    || knownGroups.some((g) => g.id === String(groupFilter))
  ) {
    return groupFilter;
  }
  return GROUP_FILTER_ALL;
}

export function pickDeviceInFilter(filteredDevices = [], selectedId, { preferOnline = false } = {}) {
  if (selectedId && filteredDevices.some((d) => d.device_id === selectedId)) return selectedId;
  if (!filteredDevices.length) return '';
  if (preferOnline) {
    const online = filteredDevices.find((d) => d.status === 'online');
    if (online) return online.device_id;
  }
  return filteredDevices[0].device_id;
}

export function readGroupFilter(storageKey, fallback = GROUP_FILTER_ALL) {
  try {
    return localStorage.getItem(storageKey) || fallback;
  } catch {
    return fallback;
  }
}

export function writeGroupFilter(storageKey, value) {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // Ignore storage restrictions.
  }
}
