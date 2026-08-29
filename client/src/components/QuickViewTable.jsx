import React, { useState, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  TablePagination,
  useTheme,
  Stack,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import TableChartIcon from '@mui/icons-material/TableChart';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { useFieldMetadata } from '../hooks/useFieldMetadata';

function useTableThemeTokens() {
  const theme = useTheme();
  return useMemo(() => {
    const isDark = theme.palette.mode === 'dark';
    return {
      theme,
      isDark,
      surface: theme.palette.background.default,
      card: theme.palette.background.paper,
      text: theme.palette.text.primary,
      muted: theme.palette.text.secondary,
      border: theme.palette.divider,
      primary: theme.palette.primary.main,
      primaryContrast: theme.palette.primary.contrastText || '#fff',
      accent: theme.palette.secondary.main,
      success: theme.palette.success.main,
      warning: theme.palette.warning.main,
      error: theme.palette.error.main,
      info: theme.palette.info.main,
      shadow: isDark
        ? '0 8px 28px rgba(0,0,0,0.35)'
        : '0 8px 28px rgba(15,23,42,0.06)',
      headerBg: theme.palette.primary.main,
      stripe: alpha(theme.palette.primary.main, isDark ? 0.12 : 0.04),
      hover: alpha(theme.palette.primary.main, isDark ? 0.18 : 0.06),
    };
  }, [theme]);
}

function SummaryChip({ label, color, icon, t }) {
  return (
    <Chip
      size="small"
      icon={icon}
      label={label}
      sx={{
        height: 26,
        fontWeight: 700,
        fontSize: '0.72rem',
        bgcolor: alpha(color, 0.1),
        color,
        border: `1px solid ${alpha(color, 0.35)}`,
        '& .MuiChip-icon': { color },
      }}
    />
  );
}

function getSemanticValueColor(parameter, t) {
  const key = String(parameter || '').toLowerCase();
  if (/rain|hujan|precip/.test(key)) return t.info;
  if (/batt|volt|vdc|tegangan/.test(key)) return t.success;
  if (/temp|suhu/.test(key)) return t.text;
  if (/flow|debit/.test(key)) return t.info;
  if (/ph\b|p_h/.test(key)) return t.accent;
  return t.text;
}

const QuickViewTable = ({ data, parameters, deviceName, alertConfigs = [], getExportData }) => {
  const t = useTableThemeTokens();
  const { theme } = t;
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [page, setPage] = useState(0);
  const { formatDisplayName, getUnit } = useFieldMetadata();

  const thresholdsByParameter = useMemo(() => {
    const map = {};
    for (const a of alertConfigs) {
      if (a.type !== 'threshold') continue;
      const key = a.parameter;
      if (!key) continue;
      if (!map[key]) map[key] = { min: null, max: null };
      if (a.min != null) map[key].min = map[key].min == null ? a.min : Math.min(map[key].min, a.min);
      if (a.max != null) map[key].max = map[key].max == null ? a.max : Math.max(map[key].max, a.max);
    }
    return map;
  }, [alertConfigs]);

  const formatParameterValue = useCallback(
    (parameter, value, precision = 3, includeUnit = true) => {
      if (value === null || value === undefined || value === '') return '—';
      const unit = getUnit(parameter);
      if (typeof value === 'number') {
        const formatted = Number.isFinite(value) ? value.toFixed(precision) : value;
        return includeUnit && unit ? `${formatted} ${unit}` : `${formatted}`;
      }
      const numeric = parseFloat(value);
      if (!Number.isNaN(numeric)) {
        const formatted = Number.isFinite(numeric) ? numeric.toFixed(precision) : numeric;
        return includeUnit && unit ? `${formatted} ${unit}` : `${formatted}`;
      }
      return includeUnit && unit ? `${value} ${unit}` : value;
    },
    [getUnit]
  );

  const tableData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return data
      .filter((item) => item.datetime ?? item.timestamp)
      .map((item) => {
        const rawTime = item.datetime ?? item.timestamp;
        return {
          ...item,
          datetime: formatInUserTimezone(rawTime, 'YYYY-MM-DD HH:mm:ss'),
          timestamp: new Date(rawTime).getTime(),
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [data]);

  const isOutOfRange = useCallback((parameter, value) => {
    const thresholds = thresholdsByParameter[parameter];
    if (!thresholds || (thresholds.min == null && thresholds.max == null)) return false;
    const numValue = parseFloat(value);
    if (Number.isNaN(numValue)) return false;
    return (thresholds.min != null && numValue < thresholds.min)
      || (thresholds.max != null && numValue > thresholds.max);
  }, [thresholdsByParameter]);

  const handleExportTableData = useCallback(async () => {
    const dataToExport = typeof getExportData === 'function' ? await getExportData() : null;
    const exportRows = Array.isArray(dataToExport) && dataToExport.length ? dataToExport : tableData;
    if (!exportRows.length || !parameters.length) return;
    const escapeCsv = (v) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ['DateTime', ...parameters.map((p) => formatDisplayName(p, { withUnit: true }))];
    const rows = exportRows.map((row) => [
      row.datetime,
      ...parameters.map((p) => formatParameterValue(p, row[p], 3, true)),
    ]);
    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deviceName || 'data'}_table_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tableData, parameters, deviceName, formatDisplayName, formatParameterValue, getExportData]);

  const handleChangePage = (_event, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const paginatedData = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return tableData.slice(startIndex, startIndex + rowsPerPage);
  }, [tableData, page, rowsPerPage]);

  const alertStats = useMemo(() => {
    const perParam = parameters.map((parameter) => {
      const count = tableData.filter((row) => isOutOfRange(parameter, row[parameter])).length;
      return { parameter, count, label: formatDisplayName(parameter, { withUnit: false }) };
    }).filter((x) => x.count > 0);

    const totalBreaches = perParam.reduce((sum, x) => sum + x.count, 0);
    const parts = perParam.slice(0, 3).map((x) => {
      const thr = thresholdsByParameter[x.parameter] || {};
      const bits = [];
      if (thr.min != null) bits.push(`below ${thr.min}`);
      if (thr.max != null) bits.push(`above ${thr.max}`);
      return `${x.label}${bits.length ? ` ${bits.join(' / ')}` : ''}`;
    });

    return { perParam, totalBreaches, summary: parts.join(' · ') };
  }, [tableData, parameters, isOutOfRange, formatDisplayName, thresholdsByParameter]);

  const lastSync = useMemo(() => {
    if (!tableData.length) return null;
    return tableData[0].datetime;
  }, [tableData]);

  const selectSx = {
    minWidth: 120,
    bgcolor: t.card,
    borderRadius: 1.25,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: t.border },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(t.primary, 0.45) },
    '& .MuiSelect-select': {
      py: 0.85,
      px: 1.25,
      fontSize: '0.78rem',
      fontWeight: 700,
      color: t.text,
    },
    '& .MuiSvgIcon-root': { color: t.muted },
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2.5,
        bgcolor: t.surface,
        border: `1px solid ${t.border}`,
        boxShadow: t.shadow,
        overflow: 'hidden',
      }}
    >
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: { xs: 2, md: 2.5 } }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1.5,
            mb: 1.5,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1.5,
                display: 'grid',
                placeItems: 'center',
                bgcolor: alpha(t.primary, 0.12),
                color: t.primary,
                flexShrink: 0,
              }}
            >
              <TableChartIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: t.text, letterSpacing: '-0.01em' }}>
                  Data Table
                </Typography>
                <Chip
                  size="small"
                  label={`${tableData.length} · parameter values`}
                  sx={{
                    height: 22,
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    bgcolor: alpha(t.muted, 0.12),
                    color: t.muted,
                  }}
                />
              </Box>
              {deviceName && (
                <Typography sx={{ fontSize: '0.75rem', color: t.muted, mt: 0.2 }}>
                  {deviceName}
                </Typography>
              )}
            </Box>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: t.muted, display: { xs: 'none', sm: 'block' } }}>
              View Amount
            </Typography>
            <FormControl size="small">
              <Select
                value={rowsPerPage}
                onChange={handleChangeRowsPerPage}
                displayEmpty
                sx={selectSx}
                renderValue={(v) => `${v} rows`}
              >
                {[10, 25, 50, 100].map((n) => (
                  <MenuItem key={n} value={n}>{n} rows</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Export table data (CSV)">
              <span>
                <IconButton
                  size="small"
                  onClick={handleExportTableData}
                  disabled={!tableData.length}
                  sx={{
                    borderRadius: 1.25,
                    border: `1px solid ${t.border}`,
                    bgcolor: t.card,
                    color: t.primary,
                    width: 36,
                    height: 36,
                    '&:hover': { bgcolor: alpha(t.primary, 0.08) },
                  }}
                >
                  <FileDownloadIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>

        {/* Summary chips */}
        {tableData.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.85, mb: 1.5 }}>
            <SummaryChip t={t} label={`${tableData.length} Total Records`} color={t.info} />
            <SummaryChip t={t} label={`${paginatedData.length} Showing`} color={t.success} />
            {alertStats.perParam.map((item) => (
              <SummaryChip
                key={item.parameter}
                t={t}
                label={`${item.count} ${item.parameter} alerts`}
                color={t.error}
                icon={<WarningAmberIcon sx={{ fontSize: '16px !important' }} />}
              />
            ))}
          </Box>
        )}

        {/* Live alert banner */}
        {alertStats.totalBreaches > 0 && (
          <Box
            sx={{
              mb: 1.75,
              px: 1.5,
              py: 1.15,
              borderRadius: 1.5,
              bgcolor: alpha(t.error, 0.08),
              border: `1px solid ${alpha(t.error, 0.28)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
              <WarningAmberIcon sx={{ fontSize: 20, color: t.error, mt: '1px', flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.8rem', color: t.text, lineHeight: 1.45 }}>
                <Box component="span" sx={{ fontWeight: 800, color: t.error }}>
                  {alertStats.totalBreaches} threshold breach{alertStats.totalBreaches === 1 ? '' : 'es'}
                </Box>
                {alertStats.summary ? ` — ${alertStats.summary}` : ''}
                {` across ${tableData.length} record${tableData.length === 1 ? '' : 's'}.`}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: t.error,
                  animation: 'pulse 1.6s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.35 },
                  },
                }}
              />
              <Typography
                sx={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  color: t.error,
                }}
              >
                LIVE ALERT
              </Typography>
            </Box>
          </Box>
        )}

        {/* Table */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'hidden',
            borderRadius: 2,
            bgcolor: t.card,
            border: `1px solid ${t.border}`,
            boxShadow: t.isDark ? 'none' : '0 1px 2px rgba(15,23,42,0.04)',
          }}
        >
          <TableContainer sx={{ maxHeight: 440 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      backgroundColor: `${t.headerBg} !important`,
                      color: `${t.primaryContrast} !important`,
                      fontSize: '0.7rem',
                      borderBottom: 'none',
                      px: 2,
                      py: 1.35,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    DateTime
                  </TableCell>
                  {parameters.map((parameter) => (
                    <TableCell
                      key={parameter}
                      align="center"
                      sx={{
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        backgroundColor: `${t.headerBg} !important`,
                        color: `${t.primaryContrast} !important`,
                        fontSize: '0.68rem',
                        borderBottom: 'none',
                        px: 1.5,
                        py: 1.35,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDisplayName(parameter, { withUnit: true })}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedData.length > 0 ? (
                  paginatedData.map((row, index) => (
                    <TableRow
                      key={`${row.timestamp}-${index}`}
                      sx={{
                        bgcolor: index % 2 === 1 ? t.stripe : t.card,
                        '&:hover': { bgcolor: t.hover },
                        '& td': { borderBottom: `1px solid ${alpha(t.border, 0.8)}` },
                      }}
                    >
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '0.78rem',
                          fontVariantNumeric: 'tabular-nums',
                          color: t.text,
                          px: 2,
                          py: 1.15,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.datetime}
                      </TableCell>
                      {parameters.map((parameter) => {
                        const value = row[parameter];
                        const alert = isOutOfRange(parameter, value);
                        const valueColor = alert ? t.error : getSemanticValueColor(parameter, t);
                        const display = formatParameterValue(parameter, value);

                        return (
                          <TableCell key={parameter} align="center" sx={{ px: 1, py: 1 }}>
                            {alert ? (
                              <Box
                                sx={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 0.55,
                                  px: 1,
                                  py: 0.4,
                                  borderRadius: 999,
                                  bgcolor: alpha(t.error, 0.1),
                                  border: `1px solid ${alpha(t.error, 0.4)}`,
                                  color: t.error,
                                }}
                              >
                                <WarningAmberIcon sx={{ fontSize: 14 }} />
                                <Typography
                                  component="span"
                                  sx={{
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                    fontWeight: 800,
                                    fontSize: '0.76rem',
                                    fontVariantNumeric: 'tabular-nums',
                                    color: 'inherit',
                                    lineHeight: 1.2,
                                  }}
                                >
                                  {display}
                                </Typography>
                              </Box>
                            ) : (
                              <Typography
                                sx={{
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                  fontWeight: 600,
                                  fontSize: '0.78rem',
                                  fontVariantNumeric: 'tabular-nums',
                                  color: valueColor,
                                }}
                              >
                                {display}
                              </Typography>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={Math.max(1, parameters.length + 1)}
                      align="center"
                      sx={{ py: 6, color: t.muted }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <TableChartIcon sx={{ fontSize: 44, opacity: 0.3, color: t.primary }} />
                        <Typography sx={{ fontWeight: 700, color: t.text }}>No data available</Typography>
                        <Typography sx={{ fontSize: '0.8rem' }}>
                          Select a time period to view data
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Pagination */}
        <Box
          sx={{
            mt: 1.75,
            borderRadius: 2,
            bgcolor: t.card,
            border: `1px solid ${t.border}`,
            overflow: 'hidden',
          }}
        >
          <TablePagination
            component="div"
            count={tableData.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} of ${count !== -1 ? count : `more than ${to}`}`
            }
            labelRowsPerPage="Rows per page:"
            sx={{
              color: t.text,
              '& .MuiTablePagination-toolbar': { px: 1.5, minHeight: 52 },
              '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                fontWeight: 600,
                color: t.muted,
                fontSize: '0.78rem',
              },
              '& .MuiTablePagination-select': {
                borderRadius: 1,
                border: `1px solid ${t.border}`,
                color: t.text,
              },
              '& .MuiIconButton-root': {
                color: t.text,
                '&:hover': { bgcolor: alpha(t.primary, 0.1) },
                '&.Mui-disabled': { color: alpha(t.muted, 0.4) },
              },
            }}
          />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 1,
              px: 1.75,
              py: 0.85,
              borderTop: `1px solid ${t.border}`,
              flexWrap: 'wrap',
            }}
          >
            <Typography sx={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: t.muted, fontWeight: 700 }}>
              TABULAR-NUMS · THEME AWARE · MONO VALUES
            </Typography>
            <Typography sx={{ fontSize: '0.62rem', letterSpacing: '0.06em', color: t.muted, fontWeight: 700 }}>
              {lastSync ? `LAST SYNC ${lastSync}` : 'NO SYNC YET'}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default QuickViewTable;
