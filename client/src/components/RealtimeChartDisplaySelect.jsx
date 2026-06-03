import React from 'react';
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { REALTIME_CHART_DISPLAY_OPTIONS } from '../utils/realtimeChartAggregation';

/**
 * Chart Y-axis aggregation mode (client-side hourly buckets).
 */
export default function RealtimeChartDisplaySelect({
  value,
  onChange,
  size = 'small',
  minWidth = 150,
  label = 'Chart display',
  labelId = 'realtime-chart-display',
  sx,
}) {
  return (
    <FormControl size={size} sx={{ minWidth, ...sx }}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{ height: size === 'small' ? 34 : 40, fontWeight: 700, fontSize: '0.875rem' }}
      >
        {REALTIME_CHART_DISPLAY_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
