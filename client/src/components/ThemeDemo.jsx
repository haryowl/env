import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Switch,
  FormControlLabel,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  Science as ScienceIcon,
} from '@mui/icons-material';
import KPICards from './KPICards';
import { useUserTheme } from '../contexts/UserThemeContext';

const ThemeDemo = () => {
  const [switchOn, setSwitchOn] = React.useState(true);
  const { customColors } = useUserTheme();
  
  // Load parameter colors from localStorage
  const [parameterColors, setParameterColors] = React.useState({});
  
  React.useEffect(() => {
    const savedParameterColors = localStorage.getItem('kima_parameter_colors');
    if (savedParameterColors) {
      setParameterColors(JSON.parse(savedParameterColors));
    }
  }, []);

  const sampleData = {
    pH: '8.20',
    COD: '41.84',
    TSS: '103.12',
    NH3N: '1.61',
    Debit: '0.00',
    Speed: '0.0',
  };

  const sampleTableData = [
    { id: 1, name: 'Device 001', status: 'Online', value: '25.5°C', lastUpdate: '2 min ago' },
    { id: 2, name: 'Device 002', status: 'Offline', value: '--', lastUpdate: '1 hour ago' },
    { id: 3, name: 'Device 003', status: 'Online', value: '78.2%', lastUpdate: '1 min ago' },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        KIMA Professional Theme Demo
      </Typography>
      
      <Typography variant="body1" sx={{ mb: 4, color: 'text.secondary' }}>
        This is a demonstration of the new KIMA Professional theme. Notice the purple sidebar, 
        modern card designs, and professional styling throughout the interface.
      </Typography>

      {/* KPI Cards Demo */}
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        KPI Cards with Individual Parameter Colors
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Each parameter card has its own distinct color scheme. Customize these colors 
        in the Color Customizer → Parameter Colors tab.
      </Typography>
      <KPICards data={sampleData} parameterColors={parameterColors} />

      {/* Buttons and Controls Demo */}
      <Typography variant="h5" sx={{ mb: 2, mt: 4, fontWeight: 600 }}>
        Buttons and Controls
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<DashboardIcon />}>
          Primary Button
        </Button>
        <Button variant="outlined" startIcon={<SettingsIcon />}>
          Outlined Button
        </Button>
        <Button variant="text" startIcon={<NotificationsIcon />}>
          Text Button
        </Button>
        <FormControlLabel
          control={
            <Switch
              checked={switchOn}
              onChange={(e) => setSwitchOn(e.target.checked)}
            />
          }
          label="Toggle Switch"
        />
      </Box>

      {/* Chips Demo */}
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Status Chips
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 4, flexWrap: 'wrap' }}>
        <Chip label="Online" color="success" size="small" />
        <Chip label="Offline" color="error" size="small" />
        <Chip label="Warning" color="warning" size="small" />
        <Chip label="Info" color="info" size="small" />
        <Chip label="Primary" color="primary" size="small" />
      </Box>

      {/* Table Demo */}
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Data Table
      </Typography>
      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Device ID</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>Last Update</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sampleTableData.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  <Chip
                    label={row.status}
                    color={row.status === 'Online' ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
                <TableCell>{row.value}</TableCell>
                <TableCell>{row.lastUpdate}</TableCell>
                <TableCell>
                  <Button size="small" variant="outlined">
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Cards Demo */}
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Information Cards
      </Typography>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ScienceIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Sensor Data
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Real-time sensor data from environmental monitoring devices. 
                This card demonstrates the modern styling and spacing of the KIMA theme.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <SettingsIcon sx={{ mr: 1, color: 'secondary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  System Status
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                System health and configuration status. All systems are operating 
                normally with the new KIMA Professional theme applied.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
        This demo shows the KIMA Professional theme in action. Switch between themes 
        using the theme selector in the top navigation to see the differences.
        <br />
        <strong>New Feature:</strong> When using the KIMA theme, you can customize colors 
        in Settings → Appearance or visit the Color Customizer page for advanced options.
      </Typography>
    </Box>
  );
};

export default ThemeDemo;
