/**
 * Single source of truth for sidebar sections, menu paths, and route guards.
 * Keep in sync with <Routes> in App.jsx (path + menuPath for permission checks).
 */
import React from 'react';
import {
  Dashboard as DashboardIcon,
  ViewQuilt as UDashboardIcon,
  Devices as DevicesIcon,
  People as PeopleIcon,
  Security as SecurityIcon,
  Map as MapIcon,
  ShowChart as ShowChartIcon,
  Settings as SettingsIcon,
  Radio as RadioIcon,
  Create as CreateIcon,
  TableChart as TableChartIcon,
  Notifications as NotificationsIcon,
  Visibility as VisibilityIcon,
  Palette as PaletteIcon,
  ColorLens as ColorLensIcon,
  Science as ScienceIcon,
  ScheduleSend as ScheduleSendIcon,
  Business as BusinessIcon,
  Sensors as SensorsIcon,
  Handyman as HandymanIcon,
  Engineering as EngineeringIcon,
  SupportAgent as SupportAgentIcon,
  DonutLarge as DonutLargeIcon,
  Domain as DomainIcon,
  Memory as MemoryIcon,
  FormatSize as FormatSizeIcon,
  PhoneAndroid as PhoneAndroidIcon,
  Send as SendIcon,
  MyLocation as MyLocationIcon,
  DeleteSweep as DeleteSweepIcon,
  UploadFile as UploadFileIcon,
  Public as PublicIcon,
  InfoOutlined as StatusIcon,
  SettingsInputAntenna as MqttConfigIcon,
  CloudUpload as KlhkReportingIcon,
  HealthAndSafety as HealthAndSafetyIcon,
} from '@mui/icons-material';

export const MENU_SECTIONS = [
  {
    title: 'Data',
    icon: <ShowChartIcon />,
    items: [
      { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', menuPath: '/dashboard' },
      { text: 'U-Dashboard', icon: <UDashboardIcon />, path: '/u-dashboard', menuPath: '/u-dashboard' },
      { text: 'N-Dashboard', icon: <UDashboardIcon />, path: '/n-dashboard', menuPath: '/n-dashboard' },
      { text: 'Status', icon: <StatusIcon />, path: '/status', menuPath: '/status' },
      { text: 'Dashboard (mobile)', icon: <PhoneAndroidIcon />, path: '/m/dashboard', menuPath: '/dashboard' },
      { text: 'Quick View', icon: <VisibilityIcon />, path: '/quick-view', menuPath: '/quick-view' },
      { text: 'Quick View (mobile)', icon: <PhoneAndroidIcon />, path: '/m/quick-view', menuPath: '/quick-view' },
      { text: 'Data', icon: <ShowChartIcon />, path: '/data', menuPath: '/data' },
      { text: 'Data Dash', icon: <TableChartIcon />, path: '/data-dash', menuPath: '/data-dash' },
      { text: 'Data Dash 2', icon: <DashboardIcon />, path: '/data-dash-2', menuPath: '/data-dash-2' },
      { text: 'Comparison', icon: <DonutLargeIcon />, path: '/comparison-dashboard', menuPath: '/comparison-dashboard' },
      { text: 'Site health', icon: <HealthAndSafetyIcon />, path: '/site-health', menuPath: '/site-health' },
      { text: 'Theme Demo', icon: <PaletteIcon />, path: '/theme-demo', menuPath: '/theme-demo' },
      { text: 'Color Customizer', icon: <ColorLensIcon />, path: '/color-customizer', menuPath: '/color-customizer' },
      { text: 'Parameter Colors', icon: <ScienceIcon />, path: '/parameter-colors', menuPath: '/parameter-colors' },
      { text: 'Parameter Demo', icon: <ScienceIcon />, path: '/parameter-demo', menuPath: '/parameter-demo' },
      { text: 'ALERT', icon: <NotificationsIcon color="error" />, path: '/alerts', menuPath: '/alerts' },
    ],
  },
  {
    title: 'Device',
    icon: <DevicesIcon />,
    items: [
      { text: 'Devices', icon: <DevicesIcon />, path: '/devices', menuPath: '/devices' },
      { text: 'Device Groups', icon: <BusinessIcon />, path: '/device-groups', menuPath: '/devices' },
      { text: 'Live tracking', icon: <MyLocationIcon />, path: '/live-tracking', menuPath: '/live-tracking' },
      { text: 'Device Mapper', icon: <MapIcon />, path: '/mapper', menuPath: '/mapper' },
      { text: 'Listeners', icon: <RadioIcon />, path: '/listeners', menuPath: '/listeners' },
      { text: 'MQTT Configuration', icon: <MqttConfigIcon />, path: '/mqtt-config', menuPath: '/mqtt-config' },
      { text: 'KLHK Reporting', icon: <KlhkReportingIcon />, path: '/klhk-reporting', menuPath: '/klhk-reporting' },
    ],
  },
  {
    title: 'Organization',
    icon: <BusinessIcon />,
    items: [
      { text: 'Company and Site', icon: <BusinessIcon />, path: '/company-site', menuPath: '/company-site' },
    ],
  },
  {
    title: 'Equipment & maintenance',
    icon: <SensorsIcon />,
    items: [
      { text: 'Sensor Management', icon: <SensorsIcon />, path: '/sensor-management', menuPath: '/sensor-management' },
      { text: 'Maintenance', icon: <HandymanIcon />, path: '/maintenance', menuPath: '/maintenance' },
    ],
  },
  {
    title: 'Field service',
    icon: <EngineeringIcon />,
    items: [
      { text: 'Technician Dashboard', icon: <SupportAgentIcon />, path: '/technician', menuPath: '/technician' },
    ],
  },
  {
    title: 'System Administration',
    icon: <SettingsIcon />,
    items: [
      { text: 'Users', icon: <PeopleIcon />, path: '/users', menuPath: '/users' },
      { text: 'Tenants', icon: <DomainIcon />, path: '/tenants', menuPath: '/tenants' },
      { text: 'Roles', icon: <SecurityIcon />, path: '/roles', menuPath: '/roles' },
      { text: 'Field Creator', icon: <CreateIcon />, path: '/field-creator', menuPath: '/field-creator' },
      { text: 'Alert Settings', icon: <SettingsIcon />, path: '/alert-settings', menuPath: '/alert-settings' },
      { text: 'Notification Config', icon: <NotificationsIcon />, path: '/notification-config', menuPath: '/notification-config' },
      { text: 'Scheduled Exports', icon: <ScheduleSendIcon />, path: '/scheduled-exports', menuPath: '/scheduled-exports' },
      { text: 'MQTT Publisher', icon: <SendIcon />, path: '/mqtt-publisher', menuPath: '/mqtt-publisher' },
      { text: 'Deployment & domain', icon: <PublicIcon />, path: '/deployment-settings', menuPath: '/deployment-settings' },
      { text: 'System Information', icon: <MemoryIcon />, path: '/system-info', menuPath: '/system-info' },
      { text: 'Data cleanup', icon: <DeleteSweepIcon />, path: '/data-cleanup', menuPath: '/data-cleanup' },
      { text: 'Data import', icon: <UploadFileIcon />, path: '/data-import', menuPath: '/data-import' },
      { text: 'Settings', icon: <SettingsIcon />, path: '/settings', menuPath: '/settings' },
      { text: 'Font Customizer', icon: <FormatSizeIcon />, path: '/font-customizer', menuPath: '/font-customizer' },
    ],
  },
];

/** Flat list of all menu items for breadcrumbs and lookups */
export function getFlatMenuItems() {
  return MENU_SECTIONS.flatMap((s) => s.items);
}

/**
 * menuPath to use for permission check for a URL pathname (exact App routes).
 * Routes not listed fall back to pathname itself (then hasMenuPermission may be false).
 */
export const ROUTE_MENU_PATH_MAP = {
  '/': '/dashboard',
  '/dashboard': '/dashboard',
  '/u-dashboard': '/u-dashboard',
  '/n-dashboard': '/n-dashboard',
  '/status': '/status',
  '/m/dashboard': '/dashboard',
  '/quick-view': '/quick-view',
  '/m/quick-view': '/quick-view',
  '/devices': '/devices',
  '/device-groups': '/devices',
  '/live-tracking': '/live-tracking',
  '/users': '/users',
  '/tenants': '/tenants',
  '/roles': '/roles',
  '/field-creator': '/field-creator',
  '/mapper': '/mapper',
  '/listeners': '/listeners',
  '/mqtt-config': '/mqtt-config',
  '/klhk-reporting': '/klhk-reporting',
  '/data': '/data',
  '/data-dash': '/data-dash',
  '/data-dash-2': '/data-dash-2',
  '/comparison-dashboard': '/comparison-dashboard',
  '/site-health': '/site-health',
  '/alerts': '/alerts',
  '/alert-settings': '/alert-settings',
  '/notification-config': '/notification-config',
  '/theme-demo': '/theme-demo',
  '/color-customizer': '/color-customizer',
  '/parameter-colors': '/parameter-colors',
  '/parameter-demo': '/parameter-demo',
  '/font-customizer': '/font-customizer',
  '/scheduled-exports': '/scheduled-exports',
  '/mqtt-publisher': '/mqtt-publisher',
  '/company-site': '/company-site',
  '/sensor-management': '/sensor-management',
  '/maintenance': '/maintenance',
  '/technician': '/technician',
  '/deployment-settings': '/deployment-settings',
  '/system-info': '/system-info',
  '/data-cleanup': '/data-cleanup',
  '/data-import': '/data-import',
  '/settings': '/settings',
};

export function getMenuPathForRoute(pathname) {
  const normalized = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  if (ROUTE_MENU_PATH_MAP[normalized] != null) return ROUTE_MENU_PATH_MAP[normalized];
  return normalized;
}

/** Section titles that contain a given pathname (for auto-expand). */
export function getSectionTitlesForPath(pathname) {
  const normalized = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const titles = [];
  for (const section of MENU_SECTIONS) {
    if (section.items.some((item) => item.path === normalized)) {
      titles.push(section.title);
    }
  }
  return titles;
}

const EXPANDED_STORAGE_KEY = 'iot_nav_sections_expanded';

export function loadStoredExpandedSections() {
  try {
    const raw = sessionStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function persistExpandedSections(expanded) {
  try {
    sessionStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expanded));
  } catch {
    /* ignore quota / private mode */
  }
}
