import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import {
  GROUP_FILTER_ALL,
  collectKnownGroups,
  filterDevicesByGroup,
  readGroupFilter,
  resolveGroupFilterValue,
  writeGroupFilter,
} from '../utils/deviceGroupFilter';

export function useDeviceGroupFilter(devices, storageKey) {
  const [groupFilter, setGroupFilter] = useState(() => readGroupFilter(storageKey));
  const [catalogGroups, setCatalogGroups] = useState([]);

  useEffect(() => {
    writeGroupFilter(storageKey, groupFilter);
  }, [groupFilter, storageKey]);

  useEffect(() => {
    const token = localStorage.getItem('iot_token');
    if (!token) return undefined;
    let cancelled = false;
    fetch(`${API_BASE_URL}/device-groups`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { groups: [] }))
      .then((data) => {
        if (!cancelled) setCatalogGroups(data.groups || []);
      })
      .catch(() => {
        if (!cancelled) setCatalogGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const knownGroups = useMemo(
    () => collectKnownGroups(devices, catalogGroups),
    [devices, catalogGroups]
  );
  const filteredDevices = useMemo(
    () => filterDevicesByGroup(devices, groupFilter),
    [devices, groupFilter]
  );
  const selectValue = resolveGroupFilterValue(groupFilter, knownGroups);

  return {
    groupFilter,
    setGroupFilter,
    knownGroups,
    filteredDevices,
    selectValue,
    GROUP_FILTER_ALL,
  };
}
