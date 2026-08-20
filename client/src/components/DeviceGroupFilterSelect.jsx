import React from 'react';
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { compactMenuItemSx, compactSelectSx } from '../utils/compactUi';
import { GROUP_FILTER_ALL, GROUP_FILTER_UNGROUPED } from '../utils/deviceGroupFilter';

export default function DeviceGroupFilterSelect({
  value,
  onChange,
  knownGroups = [],
  labelId = 'device-group-filter',
  fullWidth = false,
  sx = {},
}) {
  return (
    <FormControl size="small" fullWidth={fullWidth} sx={sx}>
      <InputLabel id={labelId}>Group</InputLabel>
      <Select
        labelId={labelId}
        label="Group"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={compactSelectSx}
      >
        <MenuItem value={GROUP_FILTER_ALL} sx={compactMenuItemSx}>All groups</MenuItem>
        <MenuItem value={GROUP_FILTER_UNGROUPED} sx={compactMenuItemSx}>Ungrouped</MenuItem>
        {knownGroups.map((group) => (
          <MenuItem key={group.id} value={group.id} sx={compactMenuItemSx}>
            {group.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
