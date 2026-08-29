import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import {
  getCartesianGridProps,
  getAxisTickStyle,
  getParameterColor,
} from '../utils/chartStyles';
import { matchesAlertParameter } from '../utils/quickViewAlertBreaches';

const QUICK_VIEW_LINE_MARGIN = { top: 14, right: 16, left: 4, bottom: 36 };
const Y_AXIS_HEADROOM_RATIO = 0.02;

const QuickViewChart = ({ parameter, data, alertLogs = [], alertConfigs = [], deviceName, addChartRef }) => {
  const theme = useTheme();
  const chartRef = useRef(null);
  const { formatDisplayName, getUnit } = useFieldMetadata();
  const parameterUnit = getUnit(parameter);
  const parameterDisplayName = formatDisplayName(parameter, { withUnit: true });
  const accent = getParameterColor(parameter);
  const isDark = theme.palette.mode === 'dark';
  const errorColor = theme.palette.error.main;
  const gradientId = `qv-area-${String(parameter).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const formatValue = useCallback(
    (value, precision = 3, includeUnit = true) => {
      if (value === null || value === undefined || value === '') return '—';
      if (typeof value === 'number') {
        const formatted = Number.isFinite(value) ? value.toFixed(precision) : value;
        return includeUnit && parameterUnit ? `${formatted} ${parameterUnit}` : `${formatted}`;
      }
      const numeric = parseFloat(String(value));
      if (!Number.isNaN(numeric)) {
        const formatted = Number.isFinite(numeric) ? numeric.toFixed(precision) : numeric;
        return includeUnit && parameterUnit ? `${formatted} ${parameterUnit}` : `${formatted}`;
      }
      return includeUnit && parameterUnit ? `${value} ${parameterUnit}` : value;
    },
    [parameterUnit]
  );

  const formatYAxisTick = useCallback((value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(3) : '';
  }, []);

  useEffect(() => {
    if (addChartRef) addChartRef(parameter, chartRef);
  }, [parameter, addChartRef]);

  const parameterAlertLogs = useMemo(() => {
    if (!Array.isArray(alertLogs)) return [];
    return alertLogs.filter((log) => matchesAlertParameter(log.parameter, parameter));
  }, [alertLogs, parameter]);

  const thresholds = useMemo(() => {
    const configs = (alertConfigs || []).filter(
      (a) => a.type === 'threshold' && matchesAlertParameter(a.parameter, parameter)
    );
    let minT = null;
    let maxT = null;
    for (const a of configs) {
      if (a.min != null) {
        const n = Number(a.min);
        if (Number.isFinite(n)) minT = minT == null ? n : Math.min(minT, n);
      }
      if (a.max != null) {
        const n = Number(a.max);
        if (Number.isFinite(n)) maxT = maxT == null ? n : Math.max(maxT, n);
      }
    }
    return { min: minT, max: maxT };
  }, [alertConfigs, parameter]);

  const chartData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return data
      .filter((item) => item[parameter] !== undefined && item[parameter] !== null)
      .map((item) => {
        const timeRaw = item.datetime ?? item.timestamp;
        if (timeRaw == null || timeRaw === '') return null;
        const ts = new Date(timeRaw).getTime();
        if (!Number.isFinite(ts)) return null;
        const rawVal = item[parameter];
        const n = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
        if (!Number.isFinite(n)) return null;
        return {
          datetime: formatInUserTimezone(timeRaw, 'MM/DD HH:mm'),
          timestamp: ts,
          value: n,
          original: item,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data, parameter]);

  const stats = useMemo(() => {
    if (!chartData.length) return {};
    const values = chartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const latest = chartData[chartData.length - 1]?.value;
    return { min, max, avg, latest };
  }, [chartData]);

  const yAxisDomain = useMemo(() => {
    if (!Number.isFinite(stats.min) || !Number.isFinite(stats.max)) return [0, 100];
    let minV = stats.min;
    let maxV = stats.max;
    const tMin = thresholds.min != null ? Number(thresholds.min) : NaN;
    const tMax = thresholds.max != null ? Number(thresholds.max) : NaN;
    if (Number.isFinite(tMin)) minV = Math.min(minV, tMin);
    if (Number.isFinite(tMax)) maxV = Math.max(maxV, tMax);
    const span = maxV - minV;
    const headroom = span > 0 && Number.isFinite(span)
      ? span * Y_AXIS_HEADROOM_RATIO
      : Math.max(Math.abs(maxV), Math.abs(minV), 1e-12) * Y_AXIS_HEADROOM_RATIO;
    let minDomain = minV - headroom;
    let maxDomain = maxV + headroom;
    if (!Number.isFinite(minDomain) || !Number.isFinite(maxDomain) || minDomain >= maxDomain) {
      const pad = Math.max(Math.abs(minV), Math.abs(maxV), 1e-9) * Y_AXIS_HEADROOM_RATIO;
      minDomain = minV - pad;
      maxDomain = maxV + pad;
    }
    return [minDomain, maxDomain];
  }, [stats.min, stats.max, thresholds.min, thresholds.max]);

  const isLatestOutOfRange = useMemo(() => {
    if (!Number.isFinite(stats.latest)) return false;
    return (thresholds.min != null && stats.latest < thresholds.min)
      || (thresholds.max != null && stats.latest > thresholds.max);
  }, [stats.latest, thresholds]);

  const statusDot = isLatestOutOfRange ? errorColor : accent;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    const out = (thresholds.min != null && point.value < thresholds.min)
      || (thresholds.max != null && point.value > thresholds.max);
    return (
      <Box
        sx={{
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: out ? errorColor : 'divider',
          borderRadius: 1.5,
          p: 1.5,
          boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 16px rgba(15,23,42,0.12)',
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', mb: 0.75, color: 'text.primary' }}>
          {label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: out ? errorColor : accent }} />
          <Typography sx={{ fontSize: '0.78rem', fontWeight: out ? 800 : 600, color: out ? errorColor : 'text.primary' }}>
            {formatValue(point.value, 3)}
          </Typography>
          {out && <WarningAmberIcon sx={{ fontSize: 14, color: errorColor }} />}
        </Box>
      </Box>
    );
  };

  const statCells = [
    { key: 'latest', label: 'LATEST', value: stats.latest, accent: true },
    { key: 'avg', label: 'AVERAGE', value: stats.avg, accent: false },
    { key: 'min', label: 'MIN', value: stats.min, accent: false },
    { key: 'max', label: 'MAX', value: stats.max, accent: false },
  ];

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 380,
        width: '100%',
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(15,23,42,0.06)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Left accent bar */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          bgcolor: statusDot,
        }}
      />

      <CardContent
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          p: 2,
          pl: 2.25,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Card header */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 1.5,
            gap: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: '0.95rem',
                color: 'text.primary',
                lineHeight: 1.25,
                letterSpacing: '-0.01em',
              }}
            >
              {parameterDisplayName}
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.72rem', mt: 0.25 }}>
              {deviceName || 'Sensor series'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            {isLatestOutOfRange && (
              <Chip
                size="small"
                label="ALERT"
                icon={<WarningAmberIcon sx={{ fontSize: '14px !important' }} />}
                sx={{
                  height: 22,
                  fontWeight: 800,
                  fontSize: '0.62rem',
                  bgcolor: alpha(errorColor, 0.12),
                  color: errorColor,
                  border: `1px solid ${alpha(errorColor, 0.35)}`,
                  '& .MuiChip-icon': { color: errorColor },
                }}
              />
            )}
            {parameterAlertLogs.length > 0 && !isLatestOutOfRange && (
              <Chip
                size="small"
                label={`${parameterAlertLogs.length} log${parameterAlertLogs.length === 1 ? '' : 's'}`}
                sx={{
                  height: 22,
                  fontWeight: 700,
                  fontSize: '0.62rem',
                  bgcolor: alpha(theme.palette.warning.main, 0.12),
                  color: theme.palette.warning.main,
                }}
              />
            )}
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: statusDot,
                boxShadow: `0 0 0 3px ${alpha(statusDot, 0.2)}`,
              }}
            />
          </Box>
        </Box>

        {/* Stats row */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 0.75,
            mb: 1.5,
            pb: 1.25,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          {statCells.map((cell) => {
            const highlight = cell.accent;
            const color = highlight
              ? (isLatestOutOfRange ? errorColor : accent)
              : theme.palette.text.primary;
            return (
              <Box key={cell.key} sx={{ minWidth: 0, px: 0.25 }}>
                <Typography
                  sx={{
                    fontSize: '0.58rem',
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    color: 'text.secondary',
                    mb: 0.45,
                  }}
                >
                  {cell.label}
                </Typography>
                <Typography
                  noWrap
                  title={formatValue(cell.value)}
                  sx={{
                    fontWeight: 800,
                    fontSize: { xs: '0.78rem', sm: '0.88rem' },
                    fontVariantNumeric: 'tabular-nums',
                    color,
                    lineHeight: 1.15,
                  }}
                >
                  {formatValue(cell.value)}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Chart */}
        <Box
          ref={chartRef}
          sx={{
            flex: '1 1 0',
            width: '100%',
            minWidth: 0,
            minHeight: { xs: 220, sm: 240 },
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {chartData.length > 0 ? (
            <Box sx={{ flex: 1, minHeight: 200, width: '100%', minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={QUICK_VIEW_LINE_MARGIN}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...getCartesianGridProps(theme)} vertical={false} />
                  <XAxis
                    dataKey="datetime"
                    stroke={theme.palette.divider}
                    tick={getAxisTickStyle(theme)}
                    tickMargin={6}
                    minTickGap={28}
                    interval="preserveStartEnd"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={theme.palette.divider}
                    tick={getAxisTickStyle(theme)}
                    domain={yAxisDomain}
                    tickFormatter={formatYAxisTick}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <RechartsTooltip content={<CustomTooltip />} />
                  {thresholds.min != null && (
                    <ReferenceLine
                      y={thresholds.min}
                      stroke={errorColor}
                      strokeDasharray="4 4"
                      strokeWidth={1.75}
                      label={{
                        value: `Min: ${formatValue(thresholds.min)}`,
                        position: 'insideBottomLeft',
                        fill: errorColor,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                  )}
                  {thresholds.max != null && (
                    <ReferenceLine
                      y={thresholds.max}
                      stroke={errorColor}
                      strokeDasharray="4 4"
                      strokeWidth={1.75}
                      label={{
                        value: `Max: ${formatValue(thresholds.max)}`,
                        position: 'insideTopLeft',
                        fill: errorColor,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={parameterDisplayName}
                    stroke={accent}
                    strokeWidth={2.5}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    activeDot={{
                      r: 5,
                      stroke: accent,
                      strokeWidth: 2,
                      fill: theme.palette.background.paper,
                    }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary',
              }}
            >
              <TrendingUpIcon sx={{ fontSize: 40, mb: 1, opacity: 0.3, color: accent }} />
              <Typography sx={{ fontWeight: 700, color: 'text.primary' }}>No data available</Typography>
              <Typography sx={{ fontSize: '0.78rem', opacity: 0.75 }}>
                Select a time period to view data
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default QuickViewChart;
