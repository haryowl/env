import React, { useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  useMediaQuery,
  useTheme as useMuiTheme,
  CircularProgress,
  Breadcrumbs,
  Link,
  Chip,
  Badge,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Devices as DevicesIcon,
  People as PeopleIcon,
  Security as SecurityIcon,
  Map as MapIcon,
  ShowChart as ShowChartIcon,
  Settings as SettingsIcon,
  AccountCircle,
  Logout,
  ChevronLeft as ChevronLeftIcon,
  Radio as RadioIcon,
  Create as CreateIcon,
  TableChart as TableChartIcon,
  Notifications as NotificationsIcon,
  Visibility as VisibilityIcon,
  Home as HomeIcon,
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Palette as PaletteIcon,
  ColorLens as ColorLensIcon,
  Science as ScienceIcon,
  ScheduleSend as ScheduleSendIcon,
  Business as BusinessIcon,
  LocationOn as LocationOnIcon,
  Sensors as SensorsIcon,
  Build as BuildIcon,
  Assignment as AssignmentIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions.jsx';
import { useUserTheme } from '../contexts/UserThemeContext';
import ThemeSelector from './ThemeSelector';

const drawerWidth = 240;

const Layout = ({ children, user, onLogout }) => {
  const theme = useMuiTheme();
  const { customColors, currentTheme } = useUserTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Determine sidebar colors based on theme
  const getSidebarColors = () => {
    switch (currentTheme) {
      case 'light':
        return {
          background: '#f5f5f5', // Light gray background for light theme
          text: '#333333', // Dark text for light background
          textSecondary: '#666666', // Medium gray text
          textActive: '#1976d2' // Blue for active items
        };
      case 'green':
        return {
          background: '#f1f8e9', // Light green background for green theme
          text: '#1b5e20', // Dark green text for light green background
          textSecondary: '#2e7d32', // Medium green text
          textActive: '#1b5e20' // Dark green for active items
        };
      case 'dark':
        return {
          background: '#121212', // Dark background
          text: 'white',
          textSecondary: 'rgba(255,255,255,0.8)',
          textActive: 'white'
        };
      case 'kima':
      default:
        return {
          background: '#0E7490', // Teal for KIMA theme
          text: 'white',
          textSecondary: 'rgba(255,255,255,0.85)',
          textActive: 'white'
        };
    }
  };

  const sidebarColors = getSidebarColors();

  // Get sidebar gradients based on theme
  const getSidebarGradients = () => {
    switch (currentTheme) {
      case 'light':
        return {
          background: 'linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.02) 100%)',
          border: 'rgba(0,0,0,0.1)'
        };
      case 'green':
        return {
          background: 'linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.02) 100%)',
          border: 'rgba(0,0,0,0.1)'
        };
      case 'dark':
      case 'kima':
      default:
        return {
          background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
          border: 'rgba(255,255,255,0.1)'
        };
    }
  };

  const sidebarGradients = getSidebarGradients();
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [anchorEl, setAnchorEl] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const navigate = useNavigate();
  const location = useLocation();
  const { canAccessMenu, loading: permissionsLoading } = usePermissions();

  const menuSections = [
    {
      title: 'Data',
      icon: <ShowChartIcon />,
      items: [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', menuPath: '/dashboard' },
        { text: 'Quick View', icon: <VisibilityIcon />, path: '/quick-view', menuPath: '/quick-view' },
        { text: 'Data', icon: <ShowChartIcon />, path: '/data', menuPath: '/data' },
        { text: 'Data Dash', icon: <TableChartIcon />, path: '/data-dash', menuPath: '/data-dash' },
        { text: 'Data Dash 2', icon: <DashboardIcon />, path: '/data-dash-2', menuPath: '/data-dash-2' },
        { text: 'Theme Demo', icon: <PaletteIcon />, path: '/theme-demo', menuPath: '/theme-demo' },
        { text: 'Color Customizer', icon: <ColorLensIcon />, path: '/color-customizer', menuPath: '/color-customizer' },
        { text: 'Parameter Colors', icon: <ScienceIcon />, path: '/parameter-colors', menuPath: '/parameter-colors' },
        { text: 'Parameter Demo', icon: <ScienceIcon />, path: '/parameter-demo', menuPath: '/parameter-demo' },
        { text: 'ALERT', icon: <NotificationsIcon color="error" />, path: '/alerts', menuPath: '/alerts' },
      ]
    },
    {
      title: 'Device',
      icon: <DevicesIcon />,
      items: [
        { text: 'Devices', icon: <DevicesIcon />, path: '/devices', menuPath: '/devices' },
        { text: 'Device Mapper', icon: <MapIcon />, path: '/mapper', menuPath: '/mapper' },
        { text: 'Listeners', icon: <RadioIcon />, path: '/listeners', menuPath: '/listeners' },
      ]
    },
    {
      title: 'In Addition',
      icon: <AssignmentIcon />,
      items: [
        { text: 'Company and Site', icon: <BusinessIcon />, path: '/company-site', menuPath: '/company-site' },
        { text: 'Sensor Management', icon: <SensorsIcon />, path: '/sensor-management', menuPath: '/sensor-management' },
        { text: 'Maintenance', icon: <BuildIcon />, path: '/maintenance', menuPath: '/maintenance' },
      ]
    },
    {
      title: 'Field Operations',
      icon: <BuildIcon />,
      items: [
        { text: 'Technician Dashboard', icon: <BuildIcon />, path: '/technician', menuPath: '/technician' },
      ]
    },
    {
      title: 'System Administration',
      icon: <SettingsIcon />,
      items: [
        { text: 'Users', icon: <PeopleIcon />, path: '/users', menuPath: '/users' },
        { text: 'Roles', icon: <SecurityIcon />, path: '/roles', menuPath: '/roles' },
        { text: 'Field Creator', icon: <CreateIcon />, path: '/field-creator', menuPath: '/field-creator' },
        { text: 'Alert Settings', icon: <SettingsIcon />, path: '/alert-settings', menuPath: '/alert-settings' },
        { text: 'Notification Config', icon: <NotificationsIcon />, path: '/notification-config', menuPath: '/notification-config' },
        { text: 'Scheduled Exports', icon: <ScheduleSendIcon />, path: '/scheduled-exports', menuPath: '/scheduled-exports' },
        { text: 'Settings', icon: <SettingsIcon />, path: '/settings', menuPath: '/settings' },
      ]
    }
  ];

  // Filter menu sections based on user permissions
  const filteredMenuSections = permissionsLoading ? [] : menuSections.map(section => ({
    ...section,
    items: section.items.filter(item => canAccessMenu(item.menuPath))
  })).filter(section => section.items.length > 0);

  // Helper function to get breadcrumbs
  const getBreadcrumbs = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs = [{ label: 'Home', icon: <HomeIcon />, path: '/' }];
    
    let currentPath = '';
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const menuItem = menuSections
        .flatMap(section => section.items)
        .find(item => item.path === currentPath);
      
      if (menuItem) {
        breadcrumbs.push({
          label: menuItem.text,
          icon: menuItem.icon,
          path: currentPath
        });
      }
    });
    
    return breadcrumbs;
  };

  // Helper function to toggle section expansion
  const toggleSection = (sectionTitle) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionTitle]: !prev[sectionTitle]
    }));
  };

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleSidebarToggle = () => {
    if (!isMobile) {
      setDrawerOpen(!drawerOpen);
    }
  };

  const handleUserMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleUserMenuClose();
    onLogout();
  };

  const handleNavigation = (path) => {
    navigate(path);
    if (isMobile) {
      setDrawerOpen(false);
    }
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo Section */}
      <Box sx={{ 
        p: 2, 
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: sidebarGradients.background,
        borderBottom: `1px solid ${sidebarGradients.border}`
      }}>
        <Typography variant="h6" noWrap component="div" sx={{ 
          color: sidebarColors.text, 
          fontWeight: 700,
          fontSize: '1.2rem'
        }}>
          ENV Monitoring
        </Typography>
        {!isMobile && (
          <IconButton onClick={handleSidebarToggle} sx={{ color: sidebarColors.text }}>
            <ChevronLeftIcon sx={{ 
              transform: drawerOpen ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.3s'
            }} />
          </IconButton>
        )}
      </Box>

      {/* User Profile Section */}
      <Box sx={{ 
        p: 2, 
        background: sidebarGradients.background,
        borderBottom: `1px solid ${sidebarGradients.border}`
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ 
            bgcolor: 'rgba(255,255,255,0.2)', 
            width: 40, 
            height: 40,
            border: '2px solid rgba(255,255,255,0.3)'
          }}>
            <AccountCircle />
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ 
              color: sidebarColors.text, 
              fontWeight: 600,
              fontSize: '0.9rem',
              lineHeight: 1.2
            }}>
              {user?.username || 'Administrator'}
            </Typography>
            <Typography variant="caption" sx={{ 
              color: sidebarColors.textSecondary,
              fontSize: '0.75rem',
              lineHeight: 1.2
            }}>
              Account
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Navigation Menu */}
      <List sx={{ flexGrow: 1, px: 1, py: 2 }}>
        {permissionsLoading ? (
          <ListItem>
            <ListItemIcon>
              <CircularProgress size={24} sx={{ color: 'white' }} />
            </ListItemIcon>
            <ListItemText 
              primary="Loading menu..." 
              sx={{ color: 'white' }}
            />
          </ListItem>
        ) : filteredMenuSections.length === 0 ? (
          <ListItem>
            <ListItemIcon>
              <SecurityIcon sx={{ color: 'white' }} />
            </ListItemIcon>
            <ListItemText 
              primary="No menu access" 
              secondary="Contact administrator for permissions"
              sx={{ 
                '& .MuiListItemText-primary': { color: 'white' },
                '& .MuiListItemText-secondary': { color: 'rgba(255,255,255,0.7)' }
              }}
            />
          </ListItem>
        ) : (
          filteredMenuSections.map((section) => (
            <Box key={section.title}>
              {/* Section Header */}
              <ListItem
                onClick={() => toggleSection(section.title)}
                sx={{ 
                  cursor: 'pointer',
                  borderRadius: '4px',
                  mb: 0.5,
                  py: 1,
                  '&:hover': {
                    backgroundColor: currentTheme === 'light' || currentTheme === 'green' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
                  }
                }}
              >
                <ListItemIcon sx={{ color: sidebarColors.text, minWidth: 36 }}>
                  {section.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={section.title}
                  sx={{ 
                    color: sidebarColors.text,
                    '& .MuiListItemText-primary': {
                      fontSize: '0.875rem',
                      fontWeight: 500
                    }
                  }}
                />
                {expandedSections[section.title] ? 
                  <ExpandLessIcon sx={{ color: sidebarColors.text }} /> : 
                  <ExpandMoreIcon sx={{ color: sidebarColors.text }} />
                }
              </ListItem>

              {/* Section Items */}
              {expandedSections[section.title] && section.items.map((item) => (
                <ListItem
                  key={item.text}
                  onClick={() => handleNavigation(item.path)}
                  selected={location.pathname === item.path}
                  sx={{ 
                    cursor: 'pointer',
                    ml: 1.5,
                    mr: 0.5,
                    borderRadius: '4px',
                    mb: 0.25,
                    py: 0.75,
                    pl: 2,
                    borderLeft: '3px solid transparent',
                    '&.Mui-selected': {
                      backgroundColor: currentTheme === 'light' || currentTheme === 'green' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.18)',
                      borderLeftColor: currentTheme === 'light' || currentTheme === 'green' ? theme.palette.primary.main : 'rgba(255,255,255,0.9)',
                      '&:hover': {
                        backgroundColor: currentTheme === 'light' || currentTheme === 'green' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.22)',
                      }
                    },
                    '&:hover': {
                      backgroundColor: currentTheme === 'light' || currentTheme === 'green' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                    }
                  }}
                >
                  <ListItemIcon sx={{ 
                    color: location.pathname === item.path ? sidebarColors.textActive : sidebarColors.textSecondary,
                    minWidth: 36
                  }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText 
                    primary={item.text} 
                    sx={{ 
                      color: location.pathname === item.path ? sidebarColors.textActive : sidebarColors.textSecondary,
                      '& .MuiListItemText-primary': {
                        fontSize: '0.8125rem',
                        fontWeight: location.pathname === item.path ? 600 : 400
                      }
                    }}
                  />
                  {location.pathname === item.path && (
                    <Box sx={{ 
                      width: 6, 
                      height: 6, 
                      borderRadius: '50%', 
                      bgcolor: currentTheme === 'light' || currentTheme === 'green' ? theme.palette.primary.main : '#F59E0B',
                      ml: 0.5
                    }} />
                  )}
                </ListItem>
              ))}
            </Box>
          ))
        )}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: drawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%' },
          ml: { md: drawerOpen ? `${drawerWidth}px` : 0 },
          zIndex: theme.zIndex.drawer + 1,
          transition: theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          backgroundColor: 'white',
          color: 'text.primary',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: '56px', sm: '64px' }, px: { xs: 1, sm: 2 } }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, color: 'text.primary' }}
          >
            <MenuIcon />
          </IconButton>
          
          {/* Breadcrumbs */}
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
            <Breadcrumbs
              separator={<ChevronRightIcon fontSize="small" />}
              aria-label="breadcrumb"
              sx={{ 
                '& .MuiBreadcrumbs-separator': { 
                  color: 'text.secondary',
                  mx: 1
                }
              }}
            >
              {getBreadcrumbs().map((breadcrumb, index) => (
                <Link
                  key={index}
                  color={index === getBreadcrumbs().length - 1 ? 'text.primary' : 'text.secondary'}
                  href={breadcrumb.path}
                  onClick={(e) => {
                    e.preventDefault();
                    if (breadcrumb.path !== location.pathname) {
                      handleNavigation(breadcrumb.path);
                    }
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: index === getBreadcrumbs().length - 1 ? 600 : 400,
                    '&:hover': {
                      textDecoration: 'underline',
                    }
                  }}
                >
                  {breadcrumb.icon}
                  {breadcrumb.label}
                </Link>
              ))}
            </Breadcrumbs>
          </Box>

          {/* Right side controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ 
              mr: 2, 
              display: { xs: 'none', sm: 'block' },
              color: 'text.secondary',
              fontSize: '0.875rem'
            }}>
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Typography>
            
            <ThemeSelector variant="icons" size="small" />
            
            <IconButton
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <SettingsIcon />
            </IconButton>
            
            <IconButton
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <Badge badgeContent={0} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
            
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleUserMenuOpen}
              sx={{ color: 'text.primary' }}
            >
              <AccountCircle />
            </IconButton>
            
            <Menu
              id="menu-appbar"
              anchorEl={anchorEl}
              anchorOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              keepMounted
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              open={Boolean(anchorEl)}
              onClose={handleUserMenuClose}
            >
              <MenuItem onClick={() => handleNavigation('/settings')}>
                <ListItemIcon>
                  <SettingsIcon fontSize="small" />
                </ListItemIcon>
                Settings
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <Logout fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Box
        component="nav"
        sx={{ 
          width: { md: drawerOpen ? drawerWidth : 0 }, 
          flexShrink: { md: 0 },
          minWidth: { md: drawerOpen ? drawerWidth : 0 },
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={drawerOpen && isMobile}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              border: 'none',
              backgroundColor: sidebarColors.background
            },
          }}
        >
          {drawer}
        </Drawer>
        
        {/* Desktop drawer */}
        <Drawer
          variant="persistent"
          open={drawerOpen && !isMobile}
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              border: 'none',
              boxShadow: 2,
              backgroundColor: sidebarColors.background
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: drawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%' },
          minHeight: '100vh',
          backgroundColor: customColors?.background || theme.palette.background.default,
          padding: { xs: 2, sm: 2.5, md: 3 },
          paddingTop: { xs: 8, sm: 10, md: 11 },
          className: 'main-content',
          boxSizing: 'border-box',
          transition: theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Box sx={{ 
          width: '100%',
          height: '100%',
          minHeight: 'calc(100vh - 100px)',
          backgroundColor: customColors?.card || theme.palette.background.paper,
          borderRadius: '4px',
          p: { xs: 2, sm: 3, md: 4 },
          boxShadow: customColors?.isDarkMode 
            ? '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)'
            : '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
          border: customColors?.isDarkMode 
            ? '1px solid rgba(255, 255, 255, 0.1)'
            : '1px solid rgba(0, 0, 0, 0.1)',
          overflow: 'auto',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default Layout; 