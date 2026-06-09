import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Paper,
  ListItemText,
} from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TableChartIcon from '@mui/icons-material/TableChart';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Link } from 'react-router-dom';
import moment from 'moment-timezone';
import { useTheme, alpha } from '@mui/material/styles';
import { API_BASE_URL } from '../config/api';
import { getUserTimezone } from '../utils/timezoneUtils';
import { getDeviceDisplayName } from '../utils/deviceLabel';
import { useFieldMetadata } from '../hooks/useFieldMetadata';
import { filterDataViewParams } from '../utils/fieldCategory';
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
    <Box sx={{ pt: 1.5, width: '100%', minWidth: 0, overflow: 'hidden' }}>
      {children}
    </Box>
  );
}

/**
 * Mobile Quick View: minimal chrome, full-width chart shell, stable metric selection.
 */
const MobileQuickView = () => {
  const theme = useTheme();
  const { formatDisplayName, metadata: fieldMetadata } = useFieldMetadata();
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('1h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartData, setChartData] = useState([]);
  const [alertData, setAlertData] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [alertConfigs, setAlertConfigs] = useState([]);
  const [tab, setTab] = useState(0);
  const [selectedParam, setSelectedParam] = useState('');

  const activeParam = useMemo(() => {
    if (!parameters.length) return '';
    return parameters.includes(selectedParam) ? selectedParam : parameters[0];
  }, [parameters, selectedParam]);

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
          const params = filterDataViewParams(
            data.assignment.mappings
              .map((m) => m.target_field)
              .filter(
                (param) =>
                  param.toLowerCase() !== 'datetime' &&
                  param.toLowerCase() !== 'timestamp' &&
                  param.toLowerCase() !== 'device_id' &&
                  param.toLowerCase() !== 'device_name'
              ),
            fieldMetadata
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
      const q = `deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=500&excludeCategories=Status`;

      const [dataDashResponse, alertResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/data-dash?${q}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(
          `${API_BASE_URL}/alert-logs?deviceId=${selectedDevice}&startDate=${startDate}&endDate=${endDate}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ]);

      if (dataDashResponse.ok) {
        const j = await dataDashResponse.json();
        const rows = j.data || [];
        setChartData(rows);
        setTableData(rows);
      }
      if (alertResponse.ok) {
        const j = await alertResponse.json();
        setAlertData(j.logs || []);
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
      `${API_BASE_URL}/data-dash?deviceIds=${selectedDevice}&parameters=${parameters.join(',')}&startDate=${startDate}&endDate=${endDate}&limit=100000&export=true&excludeCategories=Status`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  }, [selectedDevice, selectedPeriod, parameters]);

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', pb: 3, px: { xs: 1.5, sm: 0 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800} noWrap>
            Quick View
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {getUserTimezone()}
          </Typography>
        </Box>
        <IconButton onClick={() => loadData()} disabled={loading} aria-label="Refresh" size="small">
          <RefreshIcon />
        </IconButton>
      </Stack>
      <Typography
        component={Link}
        to="/quick-view"
        variant="caption"
        color="primary"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5, fontWeight: 600 }}
      >
        <OpenInNewIcon sx={{ fontSize: 14 }} /> Desktop Quick View
      </Typography>

      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 0.5, letterSpacing: 0.6 }}>
        DEVICE
      </Typography>
      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
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
              {getDeviceDisplayName(d)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 0.5, letterSpacing: 0.6 }}>
        TIME WINDOW
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={selectedPeriod}
        onChange={(_, v) => v && setSelectedPeriod(v)}
        sx={{
          mb: 1.5,
          '& .MuiToggleButton-root': {
            py: 1,
            fontWeight: 800,
            textTransform: 'none',
            fontSize: '0.85rem',
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

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{
            minHeight: 48,
            bgcolor: alpha(theme.palette.action.hover, 0.06),
            '& .MuiTab-root': {
              minHeight: 48,
              py: 0.75,
              fontWeight: 800,
              textTransform: 'none',
              fontSize: '0.8rem',
            },
            '& .Mui-selected': { color: `${theme.palette.primary.main} !important` },
            '& .MuiTabs-indicator': { height: 3 },
          }}
        >
          <Tab icon={<TimelineIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Charts" />
          <Tab icon={<WarningAmberIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Alerts" />
          <Tab icon={<TableChartIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Data" />
        </Tabs>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box display="flex" justifyContent="center" py={3}>
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
                <Typography
                  variant="body2"
                  color="text.secondary"
                  fontWeight={800}
                  sx={{ mb: 0.75, letterSpacing: 0.5, fontSize: '0.8rem' }}
                >
                  METRIC
                </Typography>
                <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                  <InputLabel id="m-qv-metric">Choose metric</InputLabel>
                  <Select
                    labelId="m-qv-metric"
                    label="Choose metric"
                    value={activeParam}
                    onChange={(e) => setSelectedParam(e.target.value)}
                    sx={{ borderRadius: 2 }}
                    renderValue={(id) =>
                      id ? formatDisplayName(id, { withUnit: true }) : 'Select metric'
                    }
                  >
                    {parameters.map((p) => (
                      <MenuItem key={p} value={p} dense>
                        <ListItemText
                          primary={formatDisplayName(p, { withUnit: true })}
                          secondary={p}
                          primaryTypographyProps={{ fontWeight: 700, fontSize: '1rem' }}
                          secondaryTypographyProps={{
                            variant: 'caption',
                            sx: { fontFamily: 'monospace', fontSize: '0.7rem' },
                          }}
                        />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {/* Fixed-height shell so Recharts always measures; activeParam avoids empty selection */}
                <Box
                  sx={{
                    width: '100%',
                    minWidth: 0,
                    minHeight: 380,
                    '& .MuiCard-root': { borderRadius: 3 },
                  }}
                >
                  {activeParam ? (
                    <QuickViewChart
                      key={`${selectedDevice}-${activeParam}-${selectedPeriod}`}
                      parameter={activeParam}
                      data={chartData}
                      alertLogs={alertData}
                      alertConfigs={alertConfigs}
                      deviceName={deviceName}
                    />
                  ) : null}
                </Box>
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
