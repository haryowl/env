import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  TablePagination,
  useTheme,
  Stack
} from '@mui/material';
import {
  Download as DownloadIcon,
  Visibility as VisibilityIcon,
  Warning as WarningIcon,
  TableChart as TableChartIcon,
  FileDownload as FileDownloadIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { formatInUserTimezone } from '../utils/timezoneUtils';
import { useFieldMetadata } from '../hooks/useFieldMetadata';

const QuickViewTable = ({ data, parameters, deviceName, alertConfigs = [] }) => {
  const theme = useTheme();
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [page, setPage] = useState(0);
  const { formatDisplayName, getUnit } = useFieldMetadata();

  // Build thresholds from configured alerts only (parameter -> { min, max })
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
      if (value === null || value === undefined || value === '') {
        return '-';
      }
      const unit = getUnit(parameter);
      if (typeof value === 'number') {
        const formatted = Number.isFinite(value) ? value.toFixed(precision) : value;
        return includeUnit && unit ? `${formatted} ${unit}` : `${formatted}`;
      }
      const numeric = parseFloat(value);
      if (!isNaN(numeric)) {
        const formatted = Number.isFinite(numeric) ? numeric.toFixed(precision) : numeric;
        return includeUnit && unit ? `${formatted} ${unit}` : `${formatted}`;
      }
      return includeUnit && unit ? `${value} ${unit}` : value;
    },
    [getUnit]
  );

  // Process table data
  const tableData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    
    return data
      .filter(item => item.datetime)
      .map(item => {
        const formattedDateTime = formatInUserTimezone(item.datetime, 'YYYY-MM-DD HH:mm:ss');
        return {
          ...item,
          datetime: formattedDateTime, // This should come AFTER the spread to override the original
          timestamp: new Date(item.datetime).getTime(),
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
  }, [data]);

  // Comprehensive color palette for any parameters
  const colorPalette = [
    '#007BA7', // Purple
    '#0099CC', // Light Purple
    '#F59E0B', // Orange
    '#10B981', // Green
    '#EF4444', // Red
    '#3B82F6', // Blue
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange Red
    '#84CC16', // Lime
    '#8B5A2B', // Brown
    '#6366F1', // Indigo
    '#DC2626', // Dark Red
    '#059669', // Dark Green
    '#006B9A', // Violet
    '#0EA5E9', // Sky Blue
    '#D97706', // Amber
    '#BE185D', // Rose
    '#0891B2', // Cyan
    '#65A30D'  // Olive
  ];

  // Function to get color for parameter based on name hash
  const getParameterColor = (param) => {
    let hash = 0;
    for (let i = 0; i < param.length; i++) {
      const char = param.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const index = Math.abs(hash) % colorPalette.length;
    return colorPalette[index];
  };

  // Export table data to CSV
  const handleExportTableData = useCallback(() => {
    if (!tableData.length || !parameters.length) return;
    const escapeCsv = (v) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ['DateTime', ...parameters.map(p => formatDisplayName(p, { withUnit: true }))];
    const rows = tableData.map(row => [
      row.datetime,
      ...parameters.map(p => formatParameterValue(p, row[p], 3, true)),
    ]);
    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map(r => r.map(escapeCsv).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deviceName || 'data'}_table_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tableData, parameters, deviceName, formatDisplayName, formatParameterValue]);

  // Use only configured alerts for this device (no hardcoded thresholds)
  const getAlertThresholds = useCallback((parameter) => {
    return thresholdsByParameter[parameter] || {};
  }, [thresholdsByParameter]);

  const isOutOfRange = useCallback((parameter, value) => {
    const thresholds = thresholdsByParameter[parameter];
    if (!thresholds || (thresholds.min == null && thresholds.max == null)) return false;
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return false;
    return (thresholds.min != null && numValue < thresholds.min) ||
           (thresholds.max != null && numValue > thresholds.max);
  }, [thresholdsByParameter]);

  // Handle page change
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  // Handle rows per page change
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Get paginated data
  const paginatedData = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return tableData.slice(startIndex, startIndex + rowsPerPage);
  }, [tableData, page, rowsPerPage]);

  return (
    <Card sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      borderRadius: '4px',
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      border: '1px solid rgba(107, 70, 193, 0.1)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
      transition: 'all 0.3s ease-in-out',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: '0 12px 40px rgba(107, 70, 193, 0.15)',
        border: '1px solid rgba(107, 70, 193, 0.2)'
      }
    }}>
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 3 }}>
        {/* Modern Header */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 3,
          p: 2,
          borderRadius: '4px',
          background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
          color: 'white'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TableChartIcon sx={{ fontSize: 28 }} />
            <Box>
              <Typography variant="h6" component="h3" sx={{ 
                fontWeight: 700,
                color: 'white',
                textShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}>
                Data Table
              </Typography>
              <Typography variant="body2" sx={{ 
                color: 'rgba(255, 255, 255, 0.9)',
                fontWeight: 500
              }}>
                {deviceName} - Parameter Values
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ 
              minWidth: 140,
              '& .MuiInputLabel-root': {
                color: 'rgba(255, 255, 255, 0.9) !important',
                fontWeight: 600,
                '&.Mui-focused': { 
                  color: 'white !important' 
                }
              }
            }}>
              <InputLabel sx={{ 
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.9) !important',
                '&.Mui-focused': { color: 'white !important' }
              }}>
                View Amount
              </InputLabel>
              <Select
                value={rowsPerPage}
                onChange={handleChangeRowsPerPage}
                label="View Amount"
                MenuProps={{
                  PaperProps: {
                    sx: {
                      backgroundColor: '#ffffff !important',
                      color: '#1f2937 !important',
                      border: '2px solid rgba(107, 70, 193, 0.2)',
                      borderRadius: '4px',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
                      '& .MuiMenuItem-root': {
                        backgroundColor: '#ffffff !important',
                        color: '#1f2937 !important',
                        fontWeight: 500,
                        '&:hover': {
                          backgroundColor: 'rgba(107, 70, 193, 0.1) !important'
                        }
                      }
                    }
                  }
                }}
                sx={{
                  color: 'white',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    borderWidth: 2
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255, 255, 255, 0.5)'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'white',
                    borderWidth: 2
                  },
                  '& .MuiSelect-icon': {
                    color: 'white'
                  }
                }}
              >
                <MenuItem 
                  value={10}
                  sx={{
                    color: '#1f2937 !important',
                    fontWeight: 500,
                    '&:hover': {
                      backgroundColor: 'rgba(107, 70, 193, 0.1) !important'
                    }
                  }}
                >
                  10 rows
                </MenuItem>
                <MenuItem 
                  value={25}
                  sx={{
                    color: '#1f2937 !important',
                    fontWeight: 500,
                    '&:hover': {
                      backgroundColor: 'rgba(107, 70, 193, 0.1) !important'
                    }
                  }}
                >
                  25 rows
                </MenuItem>
                <MenuItem 
                  value={50}
                  sx={{
                    color: '#1f2937 !important',
                    fontWeight: 500,
                    '&:hover': {
                      backgroundColor: 'rgba(107, 70, 193, 0.1) !important'
                    }
                  }}
                >
                  50 rows
                </MenuItem>
                <MenuItem 
                  value={100}
                  sx={{
                    color: '#1f2937 !important',
                    fontWeight: 500,
                    '&:hover': {
                      backgroundColor: 'rgba(107, 70, 193, 0.1) !important'
                    }
                  }}
                >
                  100 rows
                </MenuItem>
              </Select>
            </FormControl>
            <Tooltip title="Export Table Data">
              <IconButton 
                size="small"
                onClick={handleExportTableData}
                disabled={!tableData.length}
                sx={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    transform: 'translateY(-1px)'
                  }
                }}
              >
                <FileDownloadIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* Modern Table */}
        <Box sx={{ 
          flexGrow: 1, 
          overflow: 'hidden',
          borderRadius: '4px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid rgba(107, 70, 193, 0.1)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
        }}>
          <TableContainer sx={{ height: '100%', maxHeight: 400, borderRadius: '4px' }}>
            <Table stickyHeader size="small" sx={{
              '& .MuiTableHead-root': {
                '& .MuiTableCell-root': {
                  backgroundColor: '#007BA7 !important',
                  color: '#FFFFFF !important',
                  fontWeight: '700 !important',
                  fontFamily: 'Inter, sans-serif !important',
                  textShadow: '0 1px 2px rgba(0,0,0,0.3) !important',
                  borderBottom: 'none !important'
                }
              }
            }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ 
                    fontWeight: 700, 
                    backgroundColor: '#007BA7',
                    color: '#FFFFFF !important',
                    fontSize: '0.9rem',
                    fontFamily: 'Inter, sans-serif',
                    borderBottom: 'none',
                    px: 3,
                    py: 2,
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                  }}>
                    DateTime
                  </TableCell>
                  {parameters.map((parameter) => (
                    <TableCell 
                      key={parameter} 
                      sx={{ 
                        fontWeight: 700, 
                        backgroundColor: '#007BA7',
                        color: '#FFFFFF !important',
                        textAlign: 'center',
                        fontSize: '0.9rem',
                        fontFamily: 'Inter, sans-serif',
                        borderBottom: 'none',
                        px: 2,
                        py: 2,
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)'
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
                      key={index}
                      sx={{ 
                        '&:hover': { 
                          backgroundColor: 'rgba(107, 70, 193, 0.05)',
                          transform: 'scale(1.01)',
                          transition: 'all 0.2s ease-in-out'
                        },
                        '&:nth-of-type(odd)': { 
                          backgroundColor: 'rgba(107, 70, 193, 0.02)' 
                        },
                        borderBottom: '1px solid rgba(107, 70, 193, 0.1)'
                      }}
                    >
                      <TableCell sx={{ 
                        fontWeight: 600, 
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '0.85rem',
                        color: theme.palette.text.primary,
                        px: 3,
                        py: 1.5
                      }}>
                        {row.datetime}
                      </TableCell>
                      {parameters.map((parameter) => {
                        const value = row[parameter];
                        const isOutOfRangeValue = isOutOfRange(parameter, value);
                        const paramColor = getParameterColor(parameter);
                        
                        return (
                          <TableCell 
                            key={parameter}
                            sx={{ 
                              textAlign: 'center',
                              backgroundColor: isOutOfRangeValue 
                                ? `linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)`
                                : 'transparent',
                              border: isOutOfRangeValue 
                                ? '1px solid rgba(239, 68, 68, 0.3)'
                                : '1px solid transparent',
                              borderRadius: '4px',
                              mx: 0.5,
                              px: 2,
                              py: 1.5,
                              transition: 'all 0.2s ease-in-out'
                            }}
                          >
                            <Box sx={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              gap: 1 
                            }}>
                              {isOutOfRangeValue && (
                                <WarningIcon sx={{ 
                                  fontSize: 16, 
                                  color: '#EF4444',
                                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))'
                                }} />
                              )}
                              <Typography 
                                variant="body2"
                                sx={{ 
                                  fontFamily: 'Inter, sans-serif',
                                  fontWeight: isOutOfRangeValue ? 700 : 500,
                                  color: isOutOfRangeValue ? '#EF4444' : paramColor,
                                  fontSize: '0.85rem'
                                }}
                              >
                                {formatParameterValue(parameter, value)}
                              </Typography>
                            </Box>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell 
                      colSpan={parameters.length + 1} 
                      align="center"
                      sx={{ 
                        py: 6,
                        color: theme.palette.text.secondary,
                        fontFamily: 'Inter, sans-serif'
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <TableChartIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          No data available
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.7 }}>
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

        {/* Modern Pagination */}
        <Box sx={{ 
          mt: 3,
          p: 2,
          borderRadius: '4px',
          background: 'linear-gradient(135deg, rgba(107, 70, 193, 0.05) 0%, rgba(107, 70, 193, 0.02) 100%)',
          border: '1px solid rgba(107, 70, 193, 0.1)'
        }}>
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
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: '#ffffff !important',
                  color: '#1f2937 !important',
                  border: '2px solid rgba(107, 70, 193, 0.2)',
                  borderRadius: '4px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
                  '& .MuiMenuItem-root': {
                    backgroundColor: '#ffffff !important',
                    color: '#1f2937 !important',
                    fontWeight: 500,
                    '&:hover': {
                      backgroundColor: 'rgba(107, 70, 193, 0.1) !important'
                    }
                  }
                }
              }
            }}
            sx={{
              '& .MuiTablePagination-toolbar': {
                fontFamily: 'Inter, sans-serif',
                fontSize: '0.9rem',
                color: theme.palette.text.primary
              },
              '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                fontWeight: 500
              },
              '& .MuiTablePagination-select': {
                borderRadius: '4px',
                border: '1px solid rgba(107, 70, 193, 0.2)',
                color: theme.palette.text.primary
              },
              '& .MuiTablePagination-selectMenu': {
                backgroundColor: '#ffffff !important',
                color: '#1f2937 !important',
                border: '2px solid rgba(107, 70, 193, 0.2)',
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                '& .MuiMenuItem-root': {
                  backgroundColor: '#ffffff !important',
                  color: '#1f2937 !important',
                  fontWeight: 500,
                  '&:hover': {
                    backgroundColor: 'rgba(107, 70, 193, 0.1) !important'
                  }
                }
              },
              '& .MuiIconButton-root': {
                borderRadius: '4px',
                '&:hover': {
                  backgroundColor: 'rgba(107, 70, 193, 0.1)'
                }
              }
            }}
          />
        </Box>

        {/* Modern Summary */}
        {tableData.length > 0 && (
          <Box sx={{ 
            mt: 3, 
            p: 2,
            borderRadius: '4px',
            background: 'linear-gradient(135deg, rgba(107, 70, 193, 0.05) 0%, rgba(107, 70, 193, 0.02) 100%)',
            border: '1px solid rgba(107, 70, 193, 0.1)'
          }}>
            <Typography variant="subtitle2" sx={{ 
              fontWeight: 600, 
              color: theme.palette.text.primary,
              mb: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              <SettingsIcon sx={{ fontSize: 20, color: '#007BA7' }} />
              Data Summary
            </Typography>
            <Box sx={{ 
              display: 'flex', 
              gap: 2, 
              flexWrap: 'wrap' 
            }}>
              <Chip 
                label={`${tableData.length} Total Records`}
                sx={{
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  color: '#3B82F6',
                  fontWeight: 600,
                  border: '1px solid rgba(59, 130, 246, 0.3)'
                }}
                size="small"
              />
              <Chip 
                label={`${paginatedData.length} Showing`}
                sx={{
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: '#10B981',
                  fontWeight: 600,
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}
                size="small"
              />
              {parameters.map((parameter) => {
                const outOfRangeCount = tableData.filter(row => 
                  isOutOfRange(parameter, row[parameter])
                ).length;
                
                return outOfRangeCount > 0 ? (
                  <Chip 
                    key={parameter}
                    label={`${outOfRangeCount} ${parameter} alerts`}
                    sx={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: '#EF4444',
                      fontWeight: 600,
                      border: '1px solid rgba(239, 68, 68, 0.3)'
                    }}
                    size="small"
                    icon={<WarningIcon sx={{ fontSize: 16 }} />}
                  />
                ) : null;
              })}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default QuickViewTable;