import React, { useMemo, useState, useEffect } from 'react';
import { Box, Card, Typography, useTheme, useMediaQuery } from '@mui/material';
import TrendingDown from '@mui/icons-material/TrendingDown';
import TrendingUp from '@mui/icons-material/TrendingUp';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { API_BASE_URL } from '../config/api';

const TEAL_BORDER = '#0D9488';
const TOP_BG = 'rgba(20, 184, 166, 0.15)';
const BOTTOM_BG = 'rgba(13, 148, 136, 0.25)';
const ALERT_RED = '#DC2626';
const AVG_GREEN = '#059669';

/**
 * Compute avg % change per parameter: (todayAvg - yesterdayAvg) / yesterdayAvg * 100.
 * Returns { [param]: { avgPct } }. AlertPct comes from alertStats prop.
 */
function useAvgComparisonByParam(realtimeData = [], params = []) {
  return useMemo(() => {
    const out = {};
    params.forEach((param) => {
      out[param] = { avgPct: null };
    });
    if (!Array.isArray(realtimeData) || realtimeData.length === 0) return out;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    params.forEach((param) => {
      const todayValues = [];
      const yesterdayValues = [];
      realtimeData.forEach((row) => {
        const t = new Date(row.timestamp || row.datetime);
        const v = row[param];
        if (v === undefined || v === null || Number.isNaN(Number(v))) return;
        const num = Number(v);
        if (t >= todayStart) todayValues.push(num);
        else if (t >= yesterdayStart && t < todayStart) yesterdayValues.push(num);
      });
      let avgPct = null;
      if (yesterdayValues.length > 0 && todayValues.length > 0) {
        const avgToday = todayValues.reduce((a, b) => a + b, 0) / todayValues.length;
        const avgYesterday = yesterdayValues.reduce((a, b) => a + b, 0) / yesterdayValues.length;
        avgPct = avgYesterday !== 0 ? ((avgToday - avgYesterday) / avgYesterday) * 100 : 0;
      }
      out[param] = { avgPct };
    });
    return out;
  }, [realtimeData, params.join(',')]);
}

const NewParameterCards = ({
  data = {},
  parameterColors = {},
  realtimeParams = [],
  realtimeData = [],
  deviceId = null,
  formatDisplayName: formatDisplayNameProp,
  getUnit: getUnitProp,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { formatDisplayName: formatDisplayNameHook, getUnit: getUnitHook } = useFieldMetadata();
  const formatDisplayName = formatDisplayNameProp || formatDisplayNameHook;
  const getUnit = getUnitProp || getUnitHook;
  const [alertStats, setAlertStats] = useState({});

  const paramsToShow = realtimeParams.length > 0
    ? realtimeParams.filter((p) => p !== 'datetime' && p !== 'timestamp')
    : Object.keys(data).filter((p) => p !== 'datetime' && p !== 'timestamp');

  const avgComparison = useAvgComparisonByParam(realtimeData, paramsToShow);

  useEffect(() => {
    if (!deviceId || paramsToShow.length === 0) {
      setAlertStats({});
      return;
    }
    const token = localStorage.getItem('iot_token');
    if (!token) return;
    const params = paramsToShow.join(',');
    fetch(`${API_BASE_URL}/alert-logs/parameter-stats?deviceId=${encodeURIComponent(deviceId)}&parameters=${encodeURIComponent(params)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : { parameterStats: {} })
      .then((d) => setAlertStats(d.parameterStats || {}))
      .catch(() => setAlertStats({}));
  }, [deviceId, paramsToShow.join(',')]);
  const cardWidth = paramsToShow.length > 0 ? `${100 / Math.min(paramsToShow.length, 6)}%` : '100%';

  return (
    <Box sx={{ width: '100%', mb: 3 }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          flexWrap: 'wrap',
          gap: 2,
          width: '100%',
          alignItems: 'stretch',
        }}
      >
        {paramsToShow.map((param) => {
          const value = data[param] !== undefined && data[param] !== null ? Number(data[param]) : null;
          const displayValue = value !== null ? (Number.isFinite(value) ? value.toFixed(3) : String(data[param])) : '–';
          const label = formatDisplayName ? formatDisplayName(param, { withUnit: true }) : param;
          const avgData = avgComparison[param] || { avgPct: null };
          const alertData = alertStats[param] || { pctChange: null };
          const alertPct = alertData.pctChange;
          const avgPct = avgData.avgPct;

          return (
            <Card
              key={param}
              variant="outlined"
              sx={{
                width: isMobile ? '100%' : cardWidth,
                flex: isMobile ? 'none' : '1 1 0',
                minWidth: isMobile ? '100%' : 160,
                borderRadius: 2,
                border: `2px solid ${TEAL_BORDER}`,
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                '&:hover': { boxShadow: `0 4px 12px ${TEAL_BORDER}40` },
              }}
            >
              {/* Top section: alert % (left) and avg % (right) */}
              <Box
                sx={{
                  display: 'flex',
                  bgcolor: TOP_BG,
                  px: 1.5,
                  py: 1,
                  borderBottom: `1px solid ${TEAL_BORDER}40`,
                }}
              >
                <Box sx={{ flex: 1, textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    {alertPct != null && alertPct >= 0 ? (
                      <TrendingUp sx={{ fontSize: 18, color: ALERT_RED }} />
                    ) : (
                      <TrendingDown sx={{ fontSize: 18, color: ALERT_RED }} />
                    )}
                    <Typography variant="caption" sx={{ fontWeight: 700, color: ALERT_RED, fontSize: '0.85rem' }}>
                      {alertPct != null ? `${alertPct > 0 ? '+' : ''}${alertPct.toFixed(0)}%` : '–'}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: ALERT_RED, fontWeight: 600, fontSize: '0.7rem' }}>
                    alert
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    <TrendingUp sx={{ fontSize: 18, color: AVG_GREEN }} />
                    <Typography variant="caption" sx={{ fontWeight: 700, color: AVG_GREEN, fontSize: '0.85rem' }}>
                      {avgPct != null ? `${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(0)}%` : '–'}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: AVG_GREEN, fontWeight: 600, fontSize: '0.7rem' }}>
                    avg
                  </Typography>
                </Box>
              </Box>
              {/* Bottom section: main value + unit */}
              <Box
                sx={{
                  bgcolor: BOTTOM_BG,
                  py: 2,
                  px: 1.5,
                  textAlign: 'center',
                }}
              >
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    color: theme.palette.text.primary,
                    fontSize: isMobile ? '1.75rem' : '2rem',
                    lineHeight: 1.2,
                    mb: 0.5,
                  }}
                >
                  {displayValue}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: theme.palette.text.secondary,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  {label}
                </Typography>
              </Box>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
};

export default NewParameterCards;
