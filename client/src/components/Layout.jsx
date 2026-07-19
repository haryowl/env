import React, { useState, useEffect } from 'react';
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
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Security as SecurityIcon,
  Settings as SettingsIcon,
  AccountCircle,
  Logout,
  ChevronLeft as ChevronLeftIcon,
  Notifications as NotificationsIcon,
  Home as HomeIcon,
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions.jsx';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useUserTheme } from '../contexts/UserThemeContext';
import ThemeSelector from './ThemeSelector';
import {
  MENU_SECTIONS,
  getFlatMenuItems,
  loadStoredExpandedSections,
  persistExpandedSections,
  getSectionTitlesForPath,
} from '../config/navigationConfig';
import { resolveProfilePictureUrl } from '../utils/profilePicture';

const drawerWidth = 240;

const Layout = ({ children, user, userContext, onLogout }) => {
  const avatarSrc = resolveProfilePictureUrl(user?.profile_picture);
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
      case 'darkBlue':
        return {
          background: '#0F1D35',
          text: '#E2E8F0',
          textSecondary: 'rgba(148, 163, 184, 0.9)',
          textActive: '#38BDF8',
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
      case 'darkBlue':
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
  const [expandedSections, setExpandedSections] = useState(() => loadStoredExpandedSections() || {});
  const navigate = useNavigate();
  const location = useLocation();
  const isMobileDataShell = /^\/m\//.test(location.pathname);
  const { canAccessMenu, loading: permissionsLoading } = usePermissions();
  const { flags, loading: flagsLoading } = useFeatureFlags();

  // Keep the section that contains the current route expanded (merge with user toggles / sessionStorage).
  useEffect(() => {
    const titles = getSectionTitlesForPath(location.pathname);
    if (titles.length === 0) return;
    setExpandedSections((prev) => {
      const next = { ...prev };
      titles.forEach((t) => {
        next[t] = true;
      });
      return next;
    });
  }, [location.pathname]);

  const assignedSites = Array.isArray(userContext?.sites) ? userContext.sites : [];
  const assignmentLabel = (() => {
    if (!assignedSites.length) return 'No assigned site';
    if (assignedSites.length === 1) {
      const s = assignedSites[0] || {};
      const company = s.company_name || 'N/A';
      const site = s.site_name || 'N/A';
      return `${company} • ${site}`;
    }
    const companies = new Set(assignedSites.map(s => s?.company_name).filter(Boolean));
    const companyCount = companies.size || 0;
    return companyCount > 1 ? `${companyCount} companies • ${assignedSites.length} sites` : `${assignedSites.length} sites`;
  })();
  // Future look: "COMPANY NAME - SITE NAME" (uppercase, for center header badge)
  const assignmentDisplayText = (() => {
    if (!assignedSites.length) return 'NO ASSIGNED SITE';
    if (assignedSites.length === 1) {
      const s = assignedSites[0] || {};
      const company = (s.company_name || 'N/A').toUpperCase();
      const site = (s.site_name || 'N/A').toUpperCase();
      return `${company} - ${site}`;
    }
    const companies = new Set(assignedSites.map(s => s?.company_name).filter(Boolean));
    const companyCount = companies.size || 0;
    return companyCount > 1 ? `${companyCount} COMPANIES - ${assignedSites.length} SITES` : `${assignedSites.length} SITES`;
  })();
  const assignmentTooltip = assignedSites.length
    ? assignedSites
        .slice(0, 8)
        .map(s => `${s?.company_name || 'N/A'} • ${s?.site_name || 'N/A'}`)
        .join('\n')
    : '';

  // Filter menu sections based on user permissions
  const filteredMenuSections = (permissionsLoading || flagsLoading) ? [] : MENU_SECTIONS.map(section => ({
    ...section,
    items: section.items
      .filter(item => canAccessMenu(item.menuPath))
      .filter(item => {
        if (item.menuPath === '/mqtt-publisher') return Boolean(flags?.mqttPublisher);
        return true;
      })
  })).filter(section => section.items.length > 0);

  // Helper function to get breadcrumbs
  const getBreadcrumbs = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs = [{ label: 'Home', icon: <HomeIcon />, path: '/' }];
    
    let currentPath = '';
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const menuItem = getFlatMenuItems().find((item) => item.path === currentPath);
      
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
    setExpandedSections((prev) => {
      const next = { ...prev, [sectionTitle]: !prev[sectionTitle] };
      persistExpandedSections(next);
      return next;
    });
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
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
          <Avatar
            src={avatarSrc || undefined}
            alt=""
            sx={{
              bgcolor: 'rgba(255,255,255,0.2)',
              width: 56,
              height: 56,
              border: '2px solid rgba(255,255,255,0.3)',
            }}
          >
            {!avatarSrc ? <AccountCircle sx={{ fontSize: 40 }} /> : null}
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
      <List sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', px: 1, py: 2 }}>
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
                      bgcolor:
                        currentTheme === 'light' || currentTheme === 'green'
                          ? theme.palette.primary.main
                          : currentTheme === 'darkBlue'
                            ? theme.palette.primary.main
                            : '#F59E0B',
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
    <Box
      sx={{
        display: 'flex',
        width: '100%',
        // Lock shell to viewport so scrolling happens inside the main card (enables sticky headers in pages).
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
      }}
    >
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
          backgroundColor: theme.palette.background.paper,
          color: 'text.primary',
          boxShadow: theme.palette.mode === 'dark' ? '0 1px 3px rgba(0, 0, 0, 0.35)' : '0 1px 3px rgba(0, 0, 0, 0.06)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: '56px', sm: '64px' }, px: { xs: 1, sm: 2 }, position: 'relative' }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, color: 'text.primary' }}
          >
            <MenuIcon />
          </IconButton>

          {/* Left: Breadcrumbs */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
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

          {/* Center: Future look – COMPANY NAME - SITE NAME (bold uppercase white in black outline) */}
          <Box
            sx={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              justifyContent: 'center',
              px: 2,
              py: 1,
              backgroundColor: '#000',
              border: '2px solid #000',
              borderRadius: 0,
              maxWidth: 'min(420px, 50vw)'
            }}
            title={assignmentTooltip}
          >
            <Typography
              variant="body2"
              sx={{
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.8rem',
                letterSpacing: '0.04em',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {assignmentDisplayText}
            </Typography>
          </Box>

          {/* Right: date + controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
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

            <Tooltip title={canAccessMenu('/settings') ? 'Settings' : 'No access to Settings'}>
              <span>
                <IconButton
                  size="small"
                  sx={{ color: 'text.secondary' }}
                  aria-label="Settings"
                  disabled={permissionsLoading || !canAccessMenu('/settings')}
                  onClick={() => handleNavigation('/settings')}
                >
                  <SettingsIcon />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title={canAccessMenu('/alerts') ? 'Alerts & notifications' : 'No access to Alerts'}>
              <span>
                <IconButton
                  size="small"
                  sx={{ color: 'text.secondary' }}
                  aria-label="Alerts and notifications"
                  disabled={permissionsLoading || !canAccessMenu('/alerts')}
                  onClick={() => handleNavigation('/alerts')}
                >
                  <NotificationsIcon />
                </IconButton>
              </span>
            </Tooltip>
            
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleUserMenuOpen}
              sx={{ color: 'text.primary', p: 0.5 }}
            >
              {avatarSrc ? (
                <Avatar src={avatarSrc} alt="" sx={{ width: 32, height: 32 }} />
              ) : (
                <AccountCircle sx={{ fontSize: 32 }} />
              )}
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
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          width: { md: drawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%' },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          // Only apply KIMA custom colors when that theme is active; otherwise a stale
          // light `card` value paints a white content shell over dark themes.
          backgroundColor:
            (currentTheme === 'kima' && customColors?.background)
            || theme.palette.background.default,
          padding: isMobileDataShell ? { xs: 0.5, sm: 1.25, md: 1.5 } : { xs: 1, sm: 1.25, md: 1.5 },
          paddingTop: { xs: 8, sm: 9, md: 10 },
          className: 'main-content',
          boxSizing: 'border-box',
          transition: theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            backgroundColor:
              (currentTheme === 'kima' && customColors?.card)
              || theme.palette.background.paper,
            borderRadius: isMobileDataShell ? { xs: 0, sm: '4px' } : '4px',
            p: isMobileDataShell ? { xs: 0, sm: 1.25, md: 1.5 } : { xs: 1, sm: 1.25, md: 1.5 },
            boxShadow: isMobileDataShell
              ? { xs: 'none', sm: theme.palette.mode === 'dark' ? '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)' }
              : theme.palette.mode === 'dark'
                ? '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)'
                : '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
            border: isMobileDataShell
              ? { xs: 'none', sm: theme.palette.mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)' }
              : theme.palette.mode === 'dark'
                ? '1px solid rgba(255, 255, 255, 0.1)'
                : '1px solid rgba(0, 0, 0, 0.1)',
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default Layout; 