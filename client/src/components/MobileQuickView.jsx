import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
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
} from '@mui/material';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import TimelineIcon from '@mui/icons-material/Timeline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TableChartIcon from '@mui/icons-material/TableChart';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Link } from 'react-router-dom';
import moment from 'moment-timezone';
import { API_BASE_URL } from '../config/api';
import { getUserTimezone } from '../utils/timezoneUtils';
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
  return <Box sx={{ pt: 2 }}>{children}</Box>;
}

/**
 * Mobile-first Quick View: same APIs and chart/table components as standard Quick View, separate shell only.
 */
const MobileQuickView = () => {
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

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', pb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <PhoneAndroidIcon color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={800}>
              Quick View
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Mobile layout · {getUserTimezone()}
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={() => loadData()} disabled={loading} aria-label="Refresh" size="large">
          <RefreshIcon />
        </IconButton>
      </Stack>

      <Typography variant="caption" color="primary" sx={{ display: 'block', mb: 2 }}>
        <Link to="/quick-view">Open standard Quick View</Link>
      </Typography>

      <FormControl fullWidth size="medium" sx={{ mb: 2 }}>
        <InputLabel id="m-qv-device">Device</InputLabel>
        <Select
          labelId="m-qv-device"
          label="Device"
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
        >
          {devices.map((d) => (
            <MenuItem key={d.device_id} value={d.device_id}>
              {d.name} ({d.device_id})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Period
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="medium"
        value={selectedPeriod}
        onChange={(_, v) => v && setSelectedPeriod(v)}
        sx={{ mb: 2 }}
      >
        {PERIODS.map((p) => (
          <ToggleButton key={p.value} value={p.value}>
            {p.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Card variant="outlined" sx={{ borderRadius: 2, mb: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{ minHeight: 48, '& .MuiTab-root': { minHeight: 48, py: 1 } }}
        >
          <Tab icon={<TimelineIcon />} iconPosition="start" label="Charts" />
          <Tab icon={<WarningAmberIcon />} iconPosition="start" label="Alerts" />
          <Tab icon={<TableChartIcon />} iconPosition="start" label="Data" />
        </Tabs>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
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
              <Alert severity="info">No mapped parameters for this device.</Alert>
            ) : (
              <>
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Parameter</InputLabel>
                  <Select
                    label="Parameter"
                    value={selectedParam}
                    onChange={(e) => setSelectedParam(e.target.value)}
                  >
                    {parameters.map((p) => (
                      <MenuItem key={p} value={p}>
                        {p}
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
              <Alert severity="info">No parameters to show.</Alert>
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
        <Alert severity="info">Select a device to load data.</Alert>
      )}
    </Box>
  );
};

export default MobileQuickView;
