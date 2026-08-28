import React, { Suspense, useMemo } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import { buildTmatSimulationTelemetry } from '../utils/tmatSimulationData';
import { TMAT_EWS } from '../utils/tmatAnalysis';

const TmatScene3D = React.lazy(() => import('./tmat3d/TmatScene3D'));

function fmt(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function HudBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <Box sx={{ flex: 1, height: 6, borderRadius: 999, bgcolor: alpha('#fff', 0.1), overflow: 'hidden' }}>
      <Box
        sx={{
          width: `${pct}%`,
          height: '100%',
          bgcolor: color,
          boxShadow: `0 0 10px ${color}`,
          transition: 'width 0.35s ease',
        }}
      />
    </Box>
  );
}

function HudRow({ dotColor, label, unit, value, barValue, barMax, large = false }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor, boxShadow: `0 0 8px ${dotColor}` }} />
          <Typography sx={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: alpha('#fff', 0.75), fontWeight: 700 }}>
            {label}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: '0.62rem', color: alpha('#fff', 0.45) }}>{unit}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        <Typography
          sx={{
            fontSize: large ? '1.35rem' : '1.1rem',
            fontWeight: 800,
            color: '#fff',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </Typography>
        {barValue != null && barMax != null && <HudBar value={barValue} max={barMax} color={dotColor} />}
      </Box>
    </Box>
  );
}

export default function TmatSimulationModal({
  open,
  onClose,
  deviceName,
  groupName,
  params = [],
  latestFields = {},
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));

  const telemetry = useMemo(
    () => buildTmatSimulationTelemetry(params, latestFields),
    [params, latestFields]
  );

  const hasLive = telemetry.tmatRaw != null || telemetry.rain != null || telemetry.soil != null;
  const levelPct = telemetry.levelPct ?? 45;
  const groupLabel = (groupName || '').trim() || 'TMAT';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: fullScreen ? '100%' : 'min(96vw, 1100px)',
          height: fullScreen ? '100%' : 'min(88vh, 760px)',
          maxWidth: 'none',
          bgcolor: '#070d0b',
          backgroundImage: 'none',
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#070d0b' }}>
        <Suspense
          fallback={(
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <CircularProgress sx={{ color: '#00e5ff' }} />
            </Box>
          )}
        >
          <TmatScene3D levelPct={levelPct} hasLiveData={hasLive} />
        </Suspense>

        {/* Top bar */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.25,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.82), transparent)',
            borderBottom: `1px solid ${alpha('#fff', 0.08)}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <ViewInArIcon sx={{ color: '#34d399', fontSize: 22 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#fff', letterSpacing: '0.06em' }}>
                TMAT 3D · FIXED POV
              </Typography>
              <Typography noWrap sx={{ fontSize: '0.65rem', color: alpha('#fff', 0.55) }}>
                {deviceName || 'Device'} · {groupLabel} · live telemetry
              </Typography>
            </Box>
            <Chip
              size="small"
              label={telemetry.pp57.label}
              sx={{
                height: 22,
                fontWeight: 800,
                fontSize: '0.62rem',
                bgcolor: alpha(telemetry.pp57.color, 0.2),
                color: telemetry.pp57.color,
                border: `1px solid ${alpha(telemetry.pp57.color, 0.45)}`,
              }}
            />
          </Box>
          <IconButton onClick={onClose} aria-label="Close" sx={{ color: '#fff' }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* HMI panel */}
        <Box
          sx={{
            position: 'absolute',
            top: { xs: 56, md: 64 },
            right: { xs: 8, md: 16 },
            zIndex: 2,
            width: { xs: 'min(92vw, 300px)', md: 300 },
          }}
        >
          <Box
            sx={{
              borderRadius: 2,
              overflow: 'hidden',
              border: `1px solid ${alpha('#00e5ff', 0.25)}`,
              bgcolor: alpha('#0c1715', 0.92),
              backdropFilter: 'blur(8px)',
              boxShadow: `0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px ${alpha('#00e5ff', 0.12)}`,
            }}
          >
            <Box
              sx={{
                px: 1.5,
                py: 1.25,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: `1px solid ${alpha('#fff', 0.08)}`,
                background: `linear-gradient(90deg, ${alpha('#00e5ff', 0.12)}, transparent)`,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: '#fff', letterSpacing: '0.12em' }}>
                  TELEMETRY HMI
                </Typography>
                <Typography sx={{ fontSize: '0.58rem', color: alpha('#00e5ff', 0.7) }}>
                  PP57 baku {TMAT_EWS.tmat.bakuMutuM} m
                </Typography>
              </Box>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: hasLive ? '#34d399' : '#64748B',
                  boxShadow: hasLive ? '0 0 10px #34d399' : 'none',
                }}
              />
            </Box>

            <Box sx={{ p: 1.5 }}>
              <HudRow
                dotColor="#ffeb3b"
                label="RAINFALL"
                unit="mm/h"
                value={fmt(telemetry.rain)}
                barValue={telemetry.rain}
                barMax={30}
              />
              <HudRow
                dotColor="#8bc34a"
                label="SOIL MOISTURE"
                unit="% VWC"
                value={fmt(telemetry.soil)}
                barValue={telemetry.soil}
                barMax={70}
              />
              <Box
                sx={{
                  mb: 2,
                  p: 1.25,
                  borderRadius: 1.5,
                  bgcolor: alpha('#00e5ff', 0.08),
                  border: `1px solid ${alpha('#00e5ff', 0.2)}`,
                }}
              >
                <HudRow
                  dotColor="#00e5ff"
                  label="TMAT LEVEL"
                  unit="% CAP"
                  value={`${fmt(levelPct, 1)}%`}
                  barValue={levelPct}
                  barMax={100}
                  large
                />
                <Typography sx={{ fontSize: '0.58rem', color: alpha('#00e5ff', 0.65), letterSpacing: '0.08em' }}>
                  Raw {fmt(telemetry.tmatRaw, 2)} m · 22% min · 90% max
                </Typography>
              </Box>
              <HudRow
                dotColor="#ff9800"
                label="BATTERY"
                unit="V"
                value={telemetry.batteryV != null ? `${fmt(telemetry.batteryV, 2)} V` : '—'}
                barValue={telemetry.batteryPct}
                barMax={100}
              />
            </Box>
          </Box>
        </Box>

        {/* Footer hint */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2,
            px: 1.5,
            py: 0.75,
            borderRadius: 999,
            bgcolor: alpha('#000', 0.45),
            border: `1px solid ${alpha('#00e5ff', 0.15)}`,
          }}
        >
          <Typography sx={{ fontSize: '0.62rem', color: alpha('#00e5ff', 0.85), letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
            FIXED CAMERA · TMAT TANK · LIVE DATA FLOW
          </Typography>
        </Box>
      </Box>
    </Dialog>
  );
}
