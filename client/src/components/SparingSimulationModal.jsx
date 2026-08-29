import React, { Suspense, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  IconButton,
  Switch,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { buildSparingSimulationTelemetry } from '../utils/sparingSimulationData';

const SparingScene3D = React.lazy(() => import('./sparing3d/SparingScene3D'));

class SceneErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 3 }}>
          <Box sx={{ textAlign: 'center', maxWidth: 360 }}>
            <WarningAmberIcon sx={{ color: '#EA580C', fontSize: 36, mb: 1 }} />
            <Typography sx={{ color: '#fff', fontWeight: 700, mb: 0.5 }}>
              3D scene failed to load
            </Typography>
            <Typography sx={{ color: alpha('#fff', 0.55), fontSize: '0.75rem' }}>
              WebGL or scene assets may be unavailable. Telemetry cards still work.
            </Typography>
          </Box>
        </Box>
      );
    }
    return this.props.children;
  }
}

function fmt(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function StatusPill({ status }) {
  if (!status || status.key === 'unknown') {
    return (
      <Chip
        size="small"
        label="—"
        sx={{
          height: 18,
          fontSize: '0.52rem',
          fontWeight: 800,
          bgcolor: alpha('#64748B', 0.2),
          color: '#94A3B8',
          '& .MuiChip-label': { px: 0.75 },
        }}
      />
    );
  }
  return (
    <Chip
      size="small"
      label={status.label}
      sx={{
        height: 18,
        fontSize: '0.52rem',
        fontWeight: 800,
        letterSpacing: '0.06em',
        bgcolor: alpha(status.color, 0.18),
        color: status.color,
        border: `1px solid ${alpha(status.color, 0.4)}`,
        '& .MuiChip-label': { px: 0.75 },
      }}
    />
  );
}

function MetricCard({ probe }) {
  const accent = probe.accent;
  const valueText = probe.value == null
    ? '—'
    : probe.id === 'ph'
      ? fmt(probe.value, 1)
      : fmt(probe.value, probe.value >= 100 ? 0 : 1);

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        p: { xs: 1.25, md: 1.5 },
        borderRadius: 2,
        bgcolor: accent ? alpha('#bef264', 0.2) : '#fff',
        border: `1px solid ${accent ? alpha('#65a30d', 0.45) : alpha('#94a3b8', 0.4)}`,
        boxShadow: accent ? `0 0 18px ${alpha('#84cc16', 0.18)}` : 'none',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
        <Typography
          sx={{
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.14em',
            color: accent ? '#3f6212' : '#475569',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {probe.label}
        </Typography>
        <StatusPill status={probe.status} />
      </Box>
      <Typography
        sx={{
          fontSize: { xs: '1.15rem', md: '1.35rem' },
          fontWeight: 800,
          color: accent ? '#3f6212' : '#0f172a',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {valueText}
        {probe.unit ? (
          <Typography component="span" sx={{ ml: 0.5, fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
            {probe.unit}
          </Typography>
        ) : null}
      </Typography>
    </Box>
  );
}

function LayerToggle({ label, detail, checked, onChange }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        p: 1.25,
        borderRadius: 2,
        bgcolor: '#fff',
        border: `1px solid ${alpha('#94a3b8', 0.45)}`,
        mb: 1,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a' }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.58rem', color: '#64748b' }}>{detail}</Typography>
      </Box>
      <Switch
        size="small"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        sx={{
          '& .MuiSwitch-switchBase.Mui-checked': { color: '#65a30d' },
          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#84cc16' },
        }}
      />
    </Box>
  );
}

function TelemetryRow({ probe }) {
  const Icon = probe.status?.key === 'aman' ? CheckCircleOutlineIcon : WarningAmberIcon;
  const color = probe.status?.color || '#64748B';
  const valueText = probe.value == null
    ? '—'
    : probe.id === 'ph'
      ? fmt(probe.value, 1)
      : `${fmt(probe.value, probe.value >= 100 ? 0 : 1)} ${probe.unit}`.trim();

  return (
    <Box
      sx={{
        p: 1.25,
        mb: 1,
        borderRadius: 2,
        bgcolor: '#fff',
        border: `1px solid ${alpha(probe.accent ? '#65a30d' : '#94a3b8', probe.accent ? 0.45 : 0.4)}`,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: probe.accent ? '#3f6212' : '#0f172a' }}>
          {probe.fullName}
        </Typography>
        <StatusPill status={probe.status} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Icon sx={{ fontSize: 14, color }} />
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
          {valueText}
        </Typography>
      </Box>
      <Typography sx={{ mt: 0.4, fontSize: '0.56rem', color: '#64748b' }}>{probe.note}</Typography>
    </Box>
  );
}

export default function SparingSimulationModal({
  open,
  onClose,
  deviceName,
  groupName,
  params = [],
  latestFields = {},
  fieldMetadata = {},
  alertThresholds = {},
  getUnit,
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  const [showFlow, setShowFlow] = useState(true);
  const [showParticles, setShowParticles] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  const telemetry = useMemo(
    () => buildSparingSimulationTelemetry(
      params,
      latestFields,
      fieldMetadata,
      alertThresholds,
      getUnit
    ),
    [params, latestFields, fieldMetadata, alertThresholds, getUnit]
  );

  const groupLabel = (groupName || '').trim() || 'SPARING';
  const flowLabel = telemetry.flowMs != null ? fmt(telemetry.flowMs, 2) : '—';
  const spinLabel = telemetry.impellerSpin != null ? fmt(telemetry.impellerSpin, 1) : '—';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: fullScreen ? '100%' : 'min(96vw, 1280px)',
          height: fullScreen ? '100%' : 'min(90vh, 820px)',
          maxWidth: 'none',
          bgcolor: '#dce8f4',
          backgroundImage: 'none',
          overflow: 'hidden',
        },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          bgcolor: '#dce8f4',
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            px: 2,
            py: 1.25,
            borderBottom: `1px solid ${alpha('#64748b', 0.28)}`,
            background: 'linear-gradient(90deg, rgba(248,250,252,0.96), rgba(226,232,240,0.92))',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <ViewInArIcon sx={{ color: '#4d7c0f', fontSize: 22 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a', letterSpacing: '0.08em' }}>
                SPARING 3D · ISOMETRIC
                <Typography component="span" sx={{ ml: 1, fontWeight: 500, fontSize: '0.62rem', color: '#64748b' }}>
                  | TRUE ISOMETRIC · THREE.JS
                </Typography>
              </Typography>
              <Typography noWrap sx={{ fontSize: '0.65rem', color: '#64748b' }}>
                {deviceName || 'Device'} · {groupLabel} · CHANNEL A · 12m CONCRETE
              </Typography>
            </Box>
            <Chip
              size="small"
              label={telemetry.hasLive ? 'LIVE' : 'NO DATA'}
              sx={{
                height: 22,
                fontWeight: 800,
                fontSize: '0.62rem',
                bgcolor: alpha(telemetry.hasLive ? '#16a34a' : '#64748B', 0.15),
                color: telemetry.hasLive ? '#15803d' : '#64748B',
                border: `1px solid ${alpha(telemetry.hasLive ? '#16a34a' : '#64748B', 0.4)}`,
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <Typography
              sx={{
                display: { xs: 'none', md: 'block' },
                fontSize: '0.58rem',
                color: '#0369a1',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                letterSpacing: '0.04em',
              }}
            >
              ORTHO CAM 10,10,10 · 54.7° ISO · SHADOWS
            </Typography>
            <IconButton onClick={onClose} aria-label="Close" sx={{ color: '#0f172a' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Body */}
        <Box
          sx={{
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1.35fr 0.65fr' },
            gap: 0,
          }}
        >
          <Box sx={{ position: 'relative', minHeight: { xs: 320, md: 0 }, borderRight: { lg: `1px solid ${alpha('#334155', 0.5)}` } }}>
            <SceneErrorBoundary>
              <Suspense
                fallback={(
                  <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                    <CircularProgress sx={{ color: '#bef264' }} />
                  </Box>
                )}
              >
                <SparingScene3D
                  telemetry={telemetry}
                  showFlow={showFlow}
                  showParticles={showParticles}
                  showGrid={showGrid}
                />
              </Suspense>
            </SceneErrorBoundary>

            <Box
              sx={{
                position: 'absolute',
                top: 10,
                left: 10,
                zIndex: 2,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.75,
              }}
            >
              <Chip
                size="small"
                label="PHYSICAL WATER · TRANSMISSION"
                sx={{
                  height: 22,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  bgcolor: alpha('#0f172a', 0.8),
                  color: '#7dd3fc',
                  border: `1px solid ${alpha('#38bdf8', 0.35)}`,
                }}
              />
              <Chip
                size="small"
                label={`EM FLOW · ${flowLabel} m/s · SPIN ${spinLabel} rad/s`}
                sx={{
                  height: 22,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  bgcolor: alpha('#0f172a', 0.8),
                  color: '#bae6fd',
                  border: `1px solid ${alpha('#38bdf8', 0.35)}`,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              />
            </Box>

            <Box
              sx={{
                position: 'absolute',
                top: 10,
                right: 10,
                zIndex: 2,
              }}
            >
              <Typography sx={{ fontSize: '0.55rem', color: '#475569', letterSpacing: '0.06em', fontWeight: 700 }}>
                DRAG TO ROTATE · SCROLL ZOOM
              </Typography>
            </Box>

            <Box
              sx={{
                position: 'absolute',
                left: 10,
                bottom: 10,
                zIndex: 2,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.6,
              }}
            >
              {[
                { c: '#a16207', l: 'TSS brown · settles' },
                { c: '#bef264', l: 'NH3N lime ↑ glow' },
                { c: '#1c1917', l: 'COD flakes · flutter' },
              ].map((z) => (
                <Box
                  key={z.l}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.6,
                    px: 1,
                    py: 0.35,
                    borderRadius: 999,
                    bgcolor: alpha('#0f172a', 0.85),
                    border: `1px solid ${alpha('#475569', 0.5)}`,
                  }}
                >
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: z.c, boxShadow: `0 0 8px ${z.c}` }} />
                  <Typography sx={{ fontSize: '0.52rem', color: '#cbd5e1', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {z.l}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Sidebar */}
          <Box
            sx={{
              overflowY: 'auto',
              p: 1.75,
              bgcolor: alpha('#f8fafc', 0.92),
              borderTop: { xs: `1px solid ${alpha('#94a3b8', 0.35)}`, lg: 'none' },
              borderLeft: { lg: `1px solid ${alpha('#94a3b8', 0.35)}` },
            }}
          >
            <Typography
              sx={{
                fontSize: '0.62rem',
                fontWeight: 800,
                letterSpacing: '0.16em',
                color: '#64748b',
                mb: 1.25,
              }}
            >
              VISUAL LAYERS · 3D
            </Typography>
            <LayerToggle
              label="Flow Animation"
              detail="Vertex wave + texture scroll"
              checked={showFlow}
              onChange={setShowFlow}
            />
            <LayerToggle
              label="Particles"
              detail="THREE.Points BufferGeometry"
              checked={showParticles}
              onChange={setShowParticles}
            />
            <LayerToggle
              label="Isometric Grid"
              detail="GridHelper + Fog"
              checked={showGrid}
              onChange={setShowGrid}
            />

            <Typography
              sx={{
                mt: 2,
                mb: 1.25,
                fontSize: '0.62rem',
                fontWeight: 800,
                letterSpacing: '0.14em',
                color: '#475569',
              }}
            >
              LIVE TELEMETRY · MODBUS MAP · 3D
            </Typography>
            {telemetry.probes.map((p) => (
              <TelemetryRow key={p.id} probe={p} />
            ))}

            {telemetry.flowRaw != null && (
              <Box
                sx={{
                  mt: 0.5,
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: alpha('#e0f2fe', 0.9),
                  border: `1px solid ${alpha('#0284c7', 0.35)}`,
                }}
              >
                <Typography sx={{ fontSize: '0.62rem', letterSpacing: '0.12em', color: '#0369a1', fontWeight: 800 }}>
                  FLOW RATE
                </Typography>
                <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', mt: 0.35 }}>
                  {fmt(telemetry.flowRaw, telemetry.flowRaw >= 100 ? 0 : 2)}
                  <Typography component="span" sx={{ ml: 0.5, fontSize: '0.65rem', color: '#0369a1' }}>
                    {telemetry.flowUnit || 'L/min'}
                  </Typography>
                </Typography>
                <Typography sx={{ fontSize: '0.55rem', color: '#64748b', mt: 0.35 }}>
                  ≈ {telemetry.flowM3Min != null ? fmt(telemetry.flowM3Min, 2) : flowLabel} m³/min
                  {' · '}channel {flowLabel} m/s · impeller {spinLabel} rad/s
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Bottom metric strip */}
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            p: 1.25,
            borderTop: `1px solid ${alpha('#94a3b8', 0.4)}`,
            bgcolor: alpha('#f8fafc', 0.95),
            overflowX: 'auto',
          }}
        >
          {telemetry.probes.map((p) => (
            <MetricCard key={p.id} probe={p} />
          ))}
        </Box>
      </Box>
    </Dialog>
  );
}
