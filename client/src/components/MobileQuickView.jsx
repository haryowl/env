import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Stack,
  Tabs,
  Tab,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Button,
  Paper,
  ListItemText,
} from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TableChartIcon from '@mui/icons-material/TableChart';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import { Link } from 'react-router-dom';
import moment from 'moment-timezone';
import { useTheme, alpha } from '@mui/material/styles';
import { API_BASE_URL } from '../config/api';
import { getUserTimezone } from '../utils/timezoneUtils';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import QuickViewChart from './QuickViewChart';
import QuickViewAlertChart from './QuickViewAlertChart';
import QuickViewTable from './QuickViewTable';

const PERIODS = [
  { value: '1h', label: '1h' },
  { value: '2h', label: '2h' },
  { value: '3h', label: '3h' },
];

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return (
    <Box sx={{ pt: 2, width: '100%', minWidth: 0, overflow: 'hidden' }}>
      {children}
    </Box>
  );
}

/**
 * Mobile Quick View: full-width shell, humanized labels, same APIs as desktop.
 */
const MobileQuickView = () => {
  const theme = useTheme();
  const { formatDisplayName } = useFieldMetadata();
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('1h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartData, setChartData] = useState([]);
  const [alertData, setAlertData] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [alertConfigs, setAlertConfigs] = useState([]);
  const [tab, setTab] = useState(0);
  const [selectedParam, setSelectedParam] = useState('');

  const getStartDate = (period) => {
    switch (period) {
      case '1h':
        return moment().subtract(1, 'hour').utc().toISOString();
      case '2h':
        return moment().subtract(2, 'hours').utc().toISOString();
      case '3h':
        return moment().subtract(3, 'hours').utc().toISOString();
      default:
        return moment().subtract(1, 'hour').utc().toISOString();
    }
  };

  const getEndDate = () => moment().utc().toISOString();

  const loadDevices = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const visibleDevices = (data.devices || []).filter(
          (device) => device?.status !== 'deleted' && device?.is_deleted !== true
        );
        setDevices(visibleDevices);
        if (visibleDevices.length > 0) {
          const preferred = visibleDevices.find((d) => d.status === 'online') || visibleDevices[0];
          setSelectedDevice(preferred.device_id);
        } else {
          setSelectedDevice('');
        }
      }
    } catch (e) {
      console.error(e);
      setError('Failed to load devices');
    }
  };

  const loadDeviceMapper = async () => {
    if (!selectedDevice) return;
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/device-mapper-assignments/${selectedDevice}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.assignment?.mappings) {
          const params = data.assignment.mappings
            .map((m) => m.target_field)
            .filter(
              (param) =>
                param.toLowerCase() !== 'datetime' &&
                param.toLowerCase() !== 'timestamp' &&
                param.toLowerCase() !== 'device_id' &&
                param.toLowerCase() !== 'device_name'
            );
          setParameters(params);
        } else {
          setParameters([]);
        }
      } else {
        setParameters([]);
      }
    } catch {
      setParameters([]);
    }
  };

  const loadAlerts = async () => {
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alert-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.logs || []);
      }
    } catch {
      /* ignore */
    }
  };

  const loadAlertConfigs = async () => {
    if (!selectedDevice) {
      setAlertConfigs([]);
      return;
    }
    try {
      const token = localStorage.getItem('iot_token');
      const response = await fetch(`${API_BASE_URL}/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const list = data.alerts || [];
        setAlertConfigs(
          list.filter(
            (a) => a.device_id === selectedDevice && a.type === 'threshold' && (a.min != null || a.max != null)
          )
        );
      } else {
        setAlertConfigs([]);
      }
    } catch {
      setAlertConfigs([]);
    }
  };

  const loadData = useCallback(async () => {
    if (!selectedDevice || parameters.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('iot_token');
      const endDate = getEndDate();
      const startDate = getStartDate(selectedPeriod);
      const q = `deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=500`;

      const [chartResponse, alertResponse, tableResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/data-dash?${q}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(
          `${API_BASE_URL}/alert-logs?deviceId=${selectedDevice}&startDate=${startDate}&endDate=${endDate}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
        fetch(`${API_BASE_URL}/data-dash?${q}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (chartResponse.ok) {
        const j = await chartResponse.json();
        setChartData(j.data || []);
      }
      if (alertResponse.ok) {
        const j = await alertResponse.json();
        setAlertData(j.logs || []);
      }
      if (tableResponse.ok) {
        const j = await tableResponse.json();
        setTableData(j.data || []);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, selectedPeriod, parameters]);

  useEffect(() => {
    loadDevices();
    loadAlerts();
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      loadDeviceMapper();
      loadAlertConfigs();
    }
  }, [selectedDevice]);

  useEffect(() => {
    if (selectedDevice && parameters.length > 0) {
      loadData();
    }
  }, [selectedDevice, selectedPeriod, parameters, loadData]);

  useEffect(() => {
    if (parameters.length > 0 && !parameters.includes(selectedParam)) {
      setSelectedParam(parameters[0]);
    }
  }, [parameters, selectedParam]);

  const deviceName = devices.find((d) => d.device_id === selectedDevice)?.name;

  const getExportDataForTable = useCallback(async () => {
    if (!selectedDevice || parameters.length === 0) return [];
    const token = localStorage.getItem('iot_token');
    const endDate = getEndDate();
    const startDate = getStartDate(selectedPeriod);
    const res = await fetch(
      `${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=100000`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  }, [selectedDevice, selectedPeriod, parameters]);

  const grad =
    theme.palette.mode === 'dark'
      ? `linear-gradient(135deg, ${alpha(theme.palette.secondary?.main || theme.palette.primary.main, 0.9)} 0%, ${alpha('#134e4a', 0.95)} 100%)`
      : `linear-gradient(135deg, #0d9488 0%, #0e7490 100%)`;

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', pb: 3, px: { xs: 1.5, sm: 0 } }}>
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          overflow: 'hidden',
          mb: 2,
          background: grad,
          color: '#fff',
        }}
      >
        <Box sx={{ p: 2.25, pr: 1 }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: alpha('#fff', 0.2),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AnalyticsIcon sx={{ fontSize: 26 }} />
              </Box>
              <Box>
                <Typography variant="overline" sx={{ opacity: 0.9, letterSpacing: 1.2, fontWeight: 700 }}>
                  Explore data
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  Quick View
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.85, display: 'block', mt: 0.5 }}>
                  {getUserTimezone()}
                </Typography>
              </Box>
            </Stack>
            <IconButton
              onClick={() => loadData()}
              disabled={loading}
              aria-label="Refresh"
              sx={{ color: '#fff', bgcolor: alpha('#fff', 0.12), '&:hover': { bgcolor: alpha('#fff', 0.2) } }}
            >
              <RefreshIcon />
            </IconButton>
          </Stack>
          <Button
            component={Link}
            to="/quick-view"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
            sx={{
              mt: 2,
              color: '#fff',
              borderColor: alpha('#fff', 0.5),
              '&:hover': { borderColor: '#fff', bgcolor: alpha('#fff', 0.08) },
            }}
            variant="outlined"
          >
            Full desktop Quick View
          </Button>
        </Box>
      </Paper>

      <Typography variant="subtitle2" color="text.secondary" fontWeight={700} sx={{ mb: 0.75, letterSpacing: 0.5 }}>
        DEVICE
      </Typography>
      <FormControl fullWidth size="medium" sx={{ mb: 2 }}>
        <InputLabel id="m-qv-device">Select device</InputLabel>
        <Select
          labelId="m-qv-device"
          label="Select device"
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          sx={{ borderRadius: 2 }}
        >
          {devices.map((d) => (
            <MenuItem key={d.device_id} value={d.device_id}>
              {d.name} ({d.device_id})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Typography variant="subtitle2" color="text.secondary" fontWeight={700} sx={{ mb: 0.75, letterSpacing: 0.5 }}>
        TIME WINDOW
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="medium"
        value={selectedPeriod}
        onChange={(_, v) => v && setSelectedPeriod(v)}
        sx={{
          mb: 2,
          '& .MuiToggleButton-root': {
            py: 1.25,
            fontWeight: 700,
            borderRadius: '10px !important',
            textTransform: 'none',
            '&.Mui-selected': {
              bgcolor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              '&:hover': { bgcolor: theme.palette.primary.dark },
            },
          },
        }}
      >
        {PERIODS.map((p) => (
          <ToggleButton key={p.value} value={p.value}>
            Last {p.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', mb: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{
            minHeight: 52,
            bgcolor: alpha(theme.palette.action.hover, 0.06),
            '& .MuiTab-root': { minHeight: 52, py: 1, fontWeight: 700, textTransform: 'none' },
            '& .Mui-selected': { color: `${theme.palette.primary.main} !important` },
            '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' },
          }}
        >
          <Tab icon={<TimelineIcon fontSize="small" />} iconPosition="start" label="Charts" />
          <Tab icon={<WarningAmberIcon fontSize="small" />} iconPosition="start" label="Alerts" />
          <Tab icon={<TableChartIcon fontSize="small" />} iconPosition="start" label="Data" />
        </Tabs>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}

      {!loading && selectedDevice && (
        <>
          <TabPanel value={tab} index={0}>
            {parameters.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                No mapped parameters for this device.
              </Alert>
            ) : (
              <>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={700} sx={{ mb: 0.75, letterSpacing: 0.5 }}>
                  PARAMETER
                </Typography>
                <FormControl fullWidth size="medium" sx={{ mb: 2 }}>
                  <InputLabel>Metric</InputLabel>
                  <Select
                    label="Metric"
                    value={selectedParam}
                    onChange={(e) => setSelectedParam(e.target.value)}
                    sx={{ borderRadius: 2 }}
                  >
                    {parameters.map((p) => (
                      <MenuItem key={p} value={p} dense>
                        <ListItemText
                          primary={formatDisplayName(p, { withUnit: true })}
                          secondary={p}
                          primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem' }}
                          secondaryTypographyProps={{ variant: 'caption', sx: { fontFamily: 'monospace' } }}
                        />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <QuickViewChart
                  parameter={selectedParam}
                  data={chartData}
                  alerts={alerts}
                  deviceName={deviceName}
                />
              </>
            )}
          </TabPanel>
          <TabPanel value={tab} index={1}>
            <QuickViewAlertChart alertData={alertData} deviceName={deviceName} />
          </TabPanel>
          <TabPanel value={tab} index={2}>
            {parameters.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                No parameters to show.
              </Alert>
            ) : (
              <QuickViewTable
                data={tableData}
                parameters={parameters}
                deviceName={deviceName}
                alertConfigs={alertConfigs}
                getExportData={getExportDataForTable}
              />
            )}
          </TabPanel>
        </>
      )}

      {!selectedDevice && !loading && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Select a device to load data.
        </Alert>
      )}
    </Box>
  );
};

export default MobileQuickView;
