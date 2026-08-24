import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ScienceIcon from '@mui/icons-material/Science';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import OpacityIcon from '@mui/icons-material/Opacity';
import SpeedIcon from '@mui/icons-material/Speed';
import PlaceIcon from '@mui/icons-material/Place';

const SCALE_MAX = 120;

/** CSS stops mapped onto a bar that represents 0–120%. */
export const HEAT_GRADIENT =
  'linear-gradient(90deg,'
  + ' #16A34A 0%,'
  + ' #22C55E 16.7%,'
  + ' #84CC16 37.5%,'
  + ' #EAB308 62.5%,'
  + ' #F97316 75%,'
  + ' #EF4444 83.3%,'
  + ' #7F1D1D 100%)';

const LEGEND_CHIPS = [
  { label: '0–50% Hijau Aman', color: '#16A34A', text: '#fff' },
  { label: '45% Lime', color: '#84CC16', text: '#14532D' },
  { label: '75–81% Kuning', color: '#EAB308', text: '#422006' },
  { label: '85–91% Orange', color: '#F97316', text: '#fff' },
  { label: '100% Merah', color: '#EF4444', text: '#fff' },
  { label: '>100% Merah Tua', color: '#7F1D1D', text: '#fff' },
];

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ratio % on a 0–120 heat scale.
 * - Upper limit only: nilai / bakuMax × 100
 * - Range (min+max): distance from midpoint toward edge (0% at center, 100% at boundary)
 * - Lower limit only: how far below min (min / nilai × 100 when nilai > 0)
 */
export function computeHeatRatio(nilai, bakuMin, bakuMax) {
  const v = toNum(nilai);
  const mn = toNum(bakuMin);
  const mx = toNum(bakuMax);
  if (v == null) return null;

  if (mn != null && mx != null && mx > mn) {
    const mid = (mn + mx) / 2;
    const half = (mx - mn) / 2;
    if (half <= 0) return null;
    return (Math.abs(v - mid) / half) * 100;
  }
  if (mx != null && mx !== 0) {
    return (v / mx) * 100;
  }
  if (mn != null && v !== 0) {
    return (mn / v) * 100;
  }
  return null;
}

export function heatStatus(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) {
    return { key: 'unknown', label: '—', color: '#64748B' };
  }
  if (ratio >= 100) return { key: 'melebihi', label: 'MELEBIHI', color: '#DC2626' };
  if (ratio >= 85) return { key: 'waspada', label: 'WASPADA', color: '#EA580C' };
  if (ratio >= 75) return { key: 'waspada', label: 'WASPADA', color: '#CA8A04' };
  return { key: 'aman', label: 'AMAN', color: '#16A34A' };
}

function paramIcon(paramKey) {
  const k = String(paramKey || '').toLowerCase();
  if (k.includes('ph')) return <ScienceIcon sx={{ fontSize: 18 }} />;
  if (k.includes('cod') || k.includes('tss') || k.includes('nh3')) return <ScienceIcon sx={{ fontSize: 18 }} />;
  if (k.includes('flow') || k.includes('debit') || k.includes('rate')) return <SpeedIcon sx={{ fontSize: 18 }} />;
  if (k.includes('moist') || k.includes('humid') || k.includes('water')) return <OpacityIcon sx={{ fontSize: 18 }} />;
  if (k.includes('lat') || k.includes('lon')) return <PlaceIcon sx={{ fontSize: 18 }} />;
  return <WaterDropIcon sx={{ fontSize: 18 }} />;
}

function fmt(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(digits);
}

function HeatBar({ ratio }) {
  const pinned = ratio == null || !Number.isFinite(ratio)
    ? null
    : Math.max(0, Math.min(SCALE_MAX, ratio));
  const leftPct = pinned == null ? 0 : (pinned / SCALE_MAX) * 100;

  return (
    <Box
      sx={{
        position: 'relative',
        height: 36,
        borderRadius: 2,
        background: HEAT_GRADIENT,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        overflow: 'hidden',
      }}
    >
      {pinned != null && (
        <>
          <Typography
            sx={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '0.72rem',
              fontWeight: 800,
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.45)',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          >
            {pinned.toFixed(pinned >= 10 ? 0 : 1)}%
          </Typography>
          <Box
            title={`${pinned.toFixed(1)}%`}
            sx={{
              position: 'absolute',
              left: `calc(${leftPct}% - 7px)`,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 14,
              height: 14,
              borderRadius: '50%',
              bgcolor: '#fff',
              border: '2px solid rgba(15,23,42,0.35)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
              zIndex: 2,
            }}
          />
        </>
      )}
    </Box>
  );
}

function buildRows(params, latestFields, alertThresholds, getDisplayRange) {
  return (params || []).map((p) => {
    const key = (p || '').toString().toLowerCase().replace(/\s+/g, '_');
    const thr = alertThresholds?.[key] || {};
    const range = typeof getDisplayRange === 'function' ? getDisplayRange(p) : null;
    const nilai = toNum(latestFields?.[p]);
    let bakuMin = thr.min != null ? Number(thr.min) : null;
    let bakuMax = thr.max != null ? Number(thr.max) : null;
    if (bakuMin == null && bakuMax == null && range) {
      bakuMin = range.min;
      bakuMax = range.max;
    }
    return {
      param: p,
      nilai: nilai == null ? '' : String(nilai),
      bakuMin: bakuMin == null ? '' : String(bakuMin),
      bakuMax: bakuMax == null ? '' : String(bakuMax),
    };
  });
}

/**
 * Heat-ratio visualization popup for N-Dashboard Latest Readings.
 * Live values + alert thresholds seed the rows; Nilai / Baku can be edited for what-if.
 */
export default function HeatRatioModal({
  open,
  onClose,
  deviceName,
  params = [],
  latestFields = {},
  alertThresholds = {},
  formatDisplayName,
  getUnit,
  getDisplayRange,
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  const [rows, setRows] = useState([]);

  const seed = useMemo(
    () => buildRows(params, latestFields, alertThresholds, getDisplayRange),
    [params, latestFields, alertThresholds, getDisplayRange]
  );

  useEffect(() => {
    if (open) setRows(seed);
  }, [open, seed]);

  const updateRow = (param, patch) => {
    setRows((prev) => prev.map((r) => (r.param === param ? { ...r, ...patch } : r)));
  };

  const resetExample = () => setRows(seed);

  const labelOf = (p) => (formatDisplayName ? formatDisplayName(p, { withUnit: false }) : p);
  const unitOf = (p) => (getUnit ? getUnit(p) : '') || '';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: fullScreen ? 0 : 2,
          bgcolor: theme.palette.mode === 'dark' ? '#0B1220' : '#F8FAFC',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          py: 1.25,
          px: 2,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
            Visualisasi Rasio — Heat Gradation
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }} noWrap>
            {deviceName || 'Device'} · SCALE 0–{SCALE_MAX}% · LIVE HEAT
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={resetExample}
            sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.72rem', borderRadius: 999 }}
          >
            Reset contoh
          </Button>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: { xs: 1.25, sm: 2 }, pb: 2, pt: 0.5 }}>
        {/* Legend */}
        <Box
          sx={{
            mb: 1.5,
            p: 1.5,
            borderRadius: 2,
            bgcolor: theme.palette.mode === 'dark' ? alpha('#fff', 0.04) : '#fff',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: 0.4 }}>
              LEGENDA HEAT — 0% — {SCALE_MAX}%
            </Typography>
            <Chip size="small" label="FULL WIDTH" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700 }} />
          </Box>
          <Box
            sx={{
              height: 14,
              borderRadius: 999,
              background: HEAT_GRADIENT,
              mb: 0.75,
            }}
          />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.62rem',
              color: 'text.secondary',
              fontWeight: 600,
              mb: 1,
              px: 0.25,
            }}
          >
            <span>0% AMAN</span>
            <span>50%</span>
            <span>75%</span>
            <span>90%</span>
            <span>100% KRITIS</span>
            <span>{SCALE_MAX}% MELEBIHI</span>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' },
              gap: 0.75,
            }}
          >
            {LEGEND_CHIPS.map((c) => (
              <Box
                key={c.label}
                sx={{
                  px: 1,
                  py: 0.65,
                  borderRadius: 1.25,
                  bgcolor: c.color,
                  color: c.text,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                {c.label}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Rows panel */}
        <Box
          sx={{
            p: { xs: 1.25, sm: 1.75 },
            borderRadius: 2.5,
            bgcolor: theme.palette.mode === 'dark' ? '#111827' : '#0F172A',
            color: '#E2E8F0',
            border: '1px solid',
            borderColor: alpha('#fff', 0.08),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
              <FavoriteIcon sx={{ color: '#F43F5E', fontSize: 20, mt: 0.2 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#F8FAFC' }}>
                  VISUALISASI RASIO — HEAT GRADATION · FULL WIDTH
                </Typography>
                <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                  Bar 36px · gradasi hijau → merah tua · Nilai &amp; Baku Mutu dapat diedit (reset ke data live)
                </Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#94A3B8', flexShrink: 0 }}>
              SCALE 0–{SCALE_MAX}% · LIVE HEAT
            </Typography>
          </Box>

          {rows.length === 0 && (
            <Typography sx={{ fontSize: '0.8rem', color: '#94A3B8', textAlign: 'center', py: 3 }}>
              Tidak ada parameter untuk ditampilkan. Pastikan perangkat punya pembacaan / mapping.
            </Typography>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {rows.map((row) => {
              const ratio = computeHeatRatio(row.nilai, row.bakuMin, row.bakuMax);
              const status = heatStatus(ratio);
              const unit = unitOf(row.param);
              const mn = toNum(row.bakuMin);
              const mx = toNum(row.bakuMax);
              const bakuText =
                mn != null && mx != null
                  ? `${fmt(mn)}–${fmt(mx)}${unit ? ` ${unit}` : ''}`
                  : mx != null
                    ? `${fmt(mx)}${unit ? ` ${unit}` : ''}`
                    : mn != null
                      ? `≥ ${fmt(mn)}${unit ? ` ${unit}` : ''}`
                      : '—';
              const isRange = mn != null && mx != null;

              return (
                <Box
                  key={row.param}
                  sx={{
                    p: 1.25,
                    borderRadius: 2,
                    bgcolor: alpha('#fff', 0.03),
                    border: '1px solid',
                    borderColor: alpha('#fff', 0.06),
                  }}
                >
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        md: 'minmax(160px, 1.1fr) minmax(0, 1.6fr) minmax(220px, 1.1fr)',
                      },
                      gap: 1.25,
                      alignItems: 'center',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                          bgcolor: alpha(status.color, 0.18),
                          color: status.color,
                        }}
                      >
                        {paramIcon(row.param)}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', color: '#F8FAFC' }}>
                            {labelOf(row.param)}
                          </Typography>
                          <Chip
                            size="small"
                            label={status.label}
                            sx={{
                              height: 20,
                              fontSize: '0.62rem',
                              fontWeight: 800,
                              bgcolor: alpha(status.color, 0.2),
                              color: status.color,
                              border: `1px solid ${alpha(status.color, 0.45)}`,
                              '& .MuiChip-label': { px: 0.7 },
                            }}
                          />
                        </Box>
                        <Typography sx={{ fontSize: '0.68rem', color: '#94A3B8', mt: 0.25 }}>
                          Nilai {fmt(toNum(row.nilai))} / Baku {bakuText}
                        </Typography>
                      </Box>
                    </Box>

                    <HeatBar ratio={ratio} />

                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: isRange ? '1fr 1fr 1fr auto' : '1fr 1fr auto',
                        gap: 0.6,
                        alignItems: 'end',
                      }}
                    >
                      <TextField
                        size="small"
                        label="NILAI"
                        type="number"
                        value={row.nilai}
                        onChange={(e) => updateRow(row.param, { nilai: e.target.value })}
                        inputProps={{ step: 'any' }}
                        sx={fieldSx}
                      />
                      {isRange ? (
                        <>
                          <TextField
                            size="small"
                            label="BAKU MIN"
                            type="number"
                            value={row.bakuMin}
                            onChange={(e) => updateRow(row.param, { bakuMin: e.target.value })}
                            inputProps={{ step: 'any' }}
                            sx={fieldSx}
                          />
                          <TextField
                            size="small"
                            label="BAKU MAX"
                            type="number"
                            value={row.bakuMax}
                            onChange={(e) => updateRow(row.param, { bakuMax: e.target.value })}
                            inputProps={{ step: 'any' }}
                            sx={fieldSx}
                          />
                        </>
                      ) : (
                        <TextField
                          size="small"
                          label="BAKU MUTU"
                          type="number"
                          value={row.bakuMax !== '' ? row.bakuMax : row.bakuMin}
                          onChange={(e) => updateRow(row.param, {
                            bakuMax: e.target.value,
                            bakuMin: '',
                          })}
                          inputProps={{ step: 'any' }}
                          sx={fieldSx}
                        />
                      )}
                      <Box
                        sx={{
                          minWidth: 64,
                          height: 36,
                          px: 1,
                          borderRadius: 999,
                          bgcolor: '#fff',
                          color: ratio != null && ratio >= 100 ? '#DC2626' : '#0F172A',
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                        }}
                      >
                        {ratio == null ? '—' : `${ratio.toFixed(1)}%`}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

const fieldSx = {
  '& .MuiInputBase-root': {
    bgcolor: alpha('#fff', 0.06),
    color: '#F8FAFC',
    fontSize: '0.75rem',
    borderRadius: 1.25,
    minHeight: 36,
  },
  '& .MuiInputLabel-root': { fontSize: '0.68rem', color: '#94A3B8' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha('#fff', 0.12) },
  '& input': { py: 0.7 },
};
