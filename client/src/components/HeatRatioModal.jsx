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
import {
  buildSparingCards,
  toNum,
} from '../utils/sparingAnalysis';
import {
  buildTmatCards,
  computeInvertedCeilingRatio,
  computeMoistureEwsRatio,
  computePp57TmatRatio,
  computeSoilTempEwsRatio,
  getTmatOperationalDefaults,
  isInvertedTmatParam,
  isTmatKindParam,
  tmatParamKind,
  TMAT_EWS,
} from '../utils/tmatAnalysis';

const SCALE_MAX = 120;

/**
 * Decide which analysis programme to show from Device Group name/description.
 * - "SPARING" (etc.) → Section A only
 * - "TMAT" (etc.) → Section B only
 * - unclear / ungrouped → both (fallback)
 */
export function resolveHeatProgram(groupName, groupDescription) {
  const text = `${groupName || ''} ${groupDescription || ''}`.toLowerCase();
  if (!text.trim()) return 'both';
  const isTmat = /\btmat\b|tanah\s*gambut|ground\s*water|groundwater|infiltrasi|muka\s*air\s*tanah/.test(text);
  const isSparing = /\bsparing\b|waste\s*water|wastewater|limbah|kualitas\s*air/.test(text);
  if (isTmat && !isSparing) return 'tmat';
  if (isSparing && !isTmat) return 'sparing';
  return 'both';
}

/** CSS stops mapped onto a bar that represents 0-120%. */
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
  { label: '0-50% Hijau Aman', color: '#16A34A', text: '#fff' },
  { label: '45% Lime', color: '#84CC16', text: '#14532D' },
  { label: '75-81% Kuning', color: '#EAB308', text: '#422006' },
  { label: '85-91% Orange', color: '#F97316', text: '#fff' },
  { label: '100% Merah', color: '#EF4444', text: '#fff' },
  { label: '>100% Merah Tua', color: '#7F1D1D', text: '#fff' },
];

/**
 * True safe-zone band (e.g. pH 6–9, TMAT -0.4–0.1).
 * Exact min=0 with a max is a SPARING-style ceiling placeholder, not a band.
 * Negative mins are kept (groundwater elevation below soil surface).
 */
export function isTrueBand(bakuMin, bakuMax) {
  const mn = toNum(bakuMin);
  const mx = toNum(bakuMax);
  return mn != null && mx != null && mx > mn && mn !== 0;
}

/**
 * Ratio % on a 0-120 heat scale.
 * - Safe band (min≠0 + max, incl. negative min): |nilai−mid|/half×100
 *   (0% at band center, 100% at edge, >100% outside — e.g. TMAT −0.6 vs [−0.4, 0.1])
 * - Ceiling (max only / min=0+max): nilai/bakuMax×100 (SPARING)
 * - Floor only: below min → (min−nilai)/|min|×100
 */
export function computeHeatRatio(nilai, bakuMin, bakuMax) {
  const v = toNum(nilai);
  const mn = toNum(bakuMin);
  const mx = toNum(bakuMax);
  if (v == null) return null;

  if (isTrueBand(mn, mx)) {
    const mid = (mn + mx) / 2;
    const half = (mx - mn) / 2;
    if (half <= 0) return null;
    return (Math.abs(v - mid) / half) * 100;
  }

  // SPARING ceiling: min omitted or exact 0 placeholder
  if (mx != null && (mn == null || mn === 0)) {
    if (mx === 0) return null;
    return (v / mx) * 100;
  }

  if (mn != null && mx == null) {
    if (v >= mn) return 0;
    if (mn === 0) return null;
    return ((mn - v) / Math.abs(mn)) * 100;
  }

  return null;
}

export function heatStatus(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) {
    return { key: 'unknown', label: '-', color: '#64748B' };
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
  if (n == null || !Number.isFinite(n)) return '-';
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(digits);
}

function rowSubtitle(row, ratio, unit, inverted) {
  const mn = toNum(row.bakuMin);
  const mx = toNum(row.bakuMax);
  const v = toNum(row.nilai);
  const kind = tmatParamKind(row.param);
  if (ratio == null) return `Nilai ${fmt(v)} / Baku -`;
  if (kind === 'moisture') {
    return `${ratio.toFixed(1)}% EWS kelembaban · ideal ${TMAT_EWS.moisture.idealMin}–${TMAT_EWS.moisture.idealMax}% · hidrofobik <${TMAT_EWS.moisture.hydrophobicMax}%${unit ? ` | ${unit}` : ''}`;
  }
  if (kind === 'soil_temp') {
    return `${ratio.toFixed(1)}% EWS suhu · ideal ${TMAT_EWS.soil_temp.idealMin}–${TMAT_EWS.soil_temp.idealMax}°C · bahaya >${TMAT_EWS.soil_temp.bahaya}°C${unit ? ` | ${unit}` : ''}`;
  }
  if (kind === 'tmat' && !isTrueBand(mn, mx)) {
    const outside = v != null && mn != null && v < mn;
    return `${ratio.toFixed(1)}% vs PP57 ${fmt(mn ?? TMAT_EWS.tmat.bakuMutuM)} m · aman 0…−0,39 · baku −0,40${outside ? ' · di bawah baku mutu' : ''}${unit ? ` | ${unit}` : ''}`;
  }
  if (isTrueBand(mn, mx)) {
    const mid = (mn + mx) / 2;
    const outside = v != null && (v < mn || v > mx);
    return `${ratio.toFixed(1)}% vs zona aman [${fmt(mn)} … ${fmt(mx)}] · ideal ${fmt(mid)}${outside ? ' · di luar zona' : ''}${unit ? ` | ${unit}` : ''}`;
  }
  if (inverted) {
    return `${ratio.toFixed(1)}% risiko dangkal | invert${unit ? ` | ${unit}` : ''}`;
  }
  if (mx != null) {
    return `${ratio.toFixed(1)}% dari baku mutu${unit ? ` | ${unit}` : ''}`;
  }
  if (mn != null) {
    return `${ratio.toFixed(1)}% vs batas min ${fmt(mn)}${unit ? ` | ${unit}` : ''}`;
  }
  return `Nilai ${fmt(v)}`;
}

/**
 * Prefer EWS / PP57 helpers for peat params; custom true bands for TMAT still win.
 */
function ratioForRow(row) {
  const kind = tmatParamKind(row.param);
  if (kind === 'moisture') return computeMoistureEwsRatio(row.nilai);
  if (kind === 'soil_temp') return computeSoilTempEwsRatio(row.nilai);

  if (kind === 'tmat') {
    if (isTrueBand(row.bakuMin, row.bakuMax)) {
      return computeHeatRatio(row.nilai, row.bakuMin, row.bakuMax);
    }
    const ambang = toNum(row.bakuMin) ?? toNum(row.bakuMax) ?? TMAT_EWS.tmat.bakuMutuM;
    const v = toNum(row.nilai);
    if (ambang < 0 || (v != null && v < 0)) {
      return computePp57TmatRatio(row.nilai, ambang);
    }
    return computeInvertedCeilingRatio(row.nilai, ambang);
  }

  if (isTrueBand(row.bakuMin, row.bakuMax)) {
    return computeHeatRatio(row.nilai, row.bakuMin, row.bakuMax);
  }
  return computeHeatRatio(row.nilai, row.bakuMin, row.bakuMax);
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
        overflow: 'hidden',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        bgcolor: 'rgba(15,23,42,0.55)',
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0, background: HEAT_GRADIENT, opacity: 0.22 }} />
      {pinned != null && leftPct > 0 && (
        <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${leftPct}%`, overflow: 'hidden' }}>
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${10000 / Math.max(leftPct, 0.01)}%`,
              background: HEAT_GRADIENT,
            }}
          />
        </Box>
      )}
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
              textShadow: '0 1px 2px rgba(0,0,0,0.55)',
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
              boxShadow: `0 0 10px ${alpha('#fff', 0.45)}`,
              zIndex: 2,
            }}
          />
        </>
      )}
    </Box>
  );
}

function MiniHeatBar({ ratio, color }) {
  const pinned = ratio == null || !Number.isFinite(ratio)
    ? 0
    : Math.max(0, Math.min(SCALE_MAX, ratio));
  const pct = (pinned / SCALE_MAX) * 100;
  return (
    <Box sx={{ mt: 1.25, height: 4, borderRadius: 999, bgcolor: alpha('#fff', 0.08), overflow: 'hidden' }}>
      <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color || '#94A3B8', borderRadius: 999 }} />
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
    if (bakuMin == null && bakuMax == null) {
      const ews = getTmatOperationalDefaults(p);
      if (ews) {
        bakuMin = ews.bakuMin;
        bakuMax = ews.bakuMax;
      } else if (range) {
        bakuMin = range.min;
        bakuMax = range.max;
      }
    }
    // Exact 0 min + max → SPARING ceiling placeholder. Keep negative mins (TMAT).
    if (bakuMin != null && bakuMin === 0 && bakuMax != null && bakuMax > 0) {
      bakuMin = null;
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
 * Heat-ratio visualization: SPARING Section A + TMAT Section B.
 */
export default function HeatRatioModal({
  open,
  onClose,
  deviceName,
  groupName,
  groupDescription,
  params = [],
  latestFields = {},
  alertThresholds = {},
  history = [],
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

  const program = useMemo(
    () => resolveHeatProgram(groupName, groupDescription),
    [groupName, groupDescription]
  );
  const showSparing = program === 'sparing' || program === 'both';
  const showTmat = program === 'tmat' || program === 'both';

  const sparingRows = useMemo(() => {
    if (!showSparing) return [];
    // SPARING-only group: show all mapped params as compliance rows
    if (program === 'sparing') return rows;
    return rows.filter((r) => !isTmatKindParam(r.param));
  }, [rows, showSparing, program]);

  const tmatRows = useMemo(() => {
    if (!showTmat) return [];
    // TMAT-only group: show all mapped params (TMAT fields + any other sensors on that device)
    if (program === 'tmat') return rows;
    return rows.filter((r) => isTmatKindParam(r.param));
  }, [rows, showTmat, program]);

  const sparingCards = useMemo(
    () => (showSparing ? buildSparingCards(rows, getUnit) : []),
    [rows, getUnit, showSparing]
  );
  const tmatCards = useMemo(
    () => (showTmat ? buildTmatCards(rows, history, getUnit) : []),
    [rows, history, getUnit, showTmat]
  );

  const programLabel =
    program === 'sparing' ? 'SPARING'
      : program === 'tmat' ? 'TMAT'
        : 'SPARING + TMAT';
  const groupLabel = (groupName || '').trim() || 'Ungrouped';

  const renderParamRows = (list, { ambangLabel = 'BAKU MUTU' } = {}) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {list.map((row) => {
        const inverted = isInvertedTmatParam(row.param);
        const ratio = ratioForRow(row);
        const status = heatStatus(ratio);
        const unit = unitOf(row.param);
        // TMAT always edits min+max (safe zone may be negative). SPARING bands when both bounds set.
        const isRange = inverted || isTrueBand(row.bakuMin, row.bakuMax);

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
                gridTemplateColumns: { xs: '1fr', md: 'minmax(180px, 1.2fr) minmax(240px, 1.1fr)' },
                gap: 1.25,
                alignItems: 'center',
                mb: 1,
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
                    {rowSubtitle(row, ratio, unit, inverted)}
                  </Typography>
                </Box>
              </Box>

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
                      label={inverted ? 'ZONA MIN' : 'BAKU MIN'}
                      type="number"
                      value={row.bakuMin}
                      onChange={(e) => updateRow(row.param, { bakuMin: e.target.value })}
                      inputProps={{ step: 'any' }}
                      sx={fieldSx}
                    />
                    <TextField
                      size="small"
                      label={inverted ? 'ZONA MAX' : 'BAKU MAX'}
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
                    label={inverted ? 'AMBANG' : ambangLabel}
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
                  {ratio == null ? '-' : `${ratio.toFixed(1)}%`}
                </Box>
              </Box>
            </Box>
            <HeatBar ratio={ratio} />
          </Box>
        );
      })}
    </Box>
  );

  const renderCards = (cards, title) => (
    <>
      <Typography sx={{ fontWeight: 800, fontSize: '0.78rem', mb: 1, mt: 0.5, color: 'text.primary' }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.25,
          mb: 1.5,
        }}
      >
        {cards.map((card) => (
          <Box
            key={card.id}
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: '#0F172A',
              border: '1px solid',
              borderColor: alpha(card.color || '#94A3B8', 0.35),
              boxShadow: `0 0 0 1px ${alpha(card.color || '#94A3B8', 0.12)}`,
              minHeight: 120,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.78rem', color: '#F8FAFC' }}>
                {card.title}
              </Typography>
              <Chip
                size="small"
                label={card.label}
                sx={{
                  height: 20,
                  fontSize: '0.6rem',
                  fontWeight: 800,
                  bgcolor: alpha(card.color, 0.2),
                  color: card.color,
                  border: `1px solid ${alpha(card.color, 0.45)}`,
                  '& .MuiChip-label': { px: 0.7 },
                }}
              />
            </Box>
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#F8FAFC', mb: 0.35 }}>
              {card.primary}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8' }}>
              {card.ready
                ? card.detail
                : `Data kurang: ${(card.missing || []).join(', ') || '-'}`}
            </Typography>
            <Typography sx={{ fontSize: '0.6rem', color: '#64748B', mt: 0.5, fontFamily: 'monospace' }}>
              {card.formula}
            </Typography>
            <MiniHeatBar ratio={card.ratio} color={card.color} />
          </Box>
        ))}
      </Box>
    </>
  );

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
            {deviceName || 'Device'} · Group: {groupLabel} · {programLabel} · SCALE 0–{SCALE_MAX}%
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
          <Box sx={{ height: 14, borderRadius: 999, background: HEAT_GRADIENT, mb: 0.75 }} />
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

        {showSparing && (
          <>
            <Box
              sx={{
                p: { xs: 1.25, sm: 1.75 },
                borderRadius: 2.5,
                bgcolor: '#0F172A',
                color: '#E2E8F0',
                border: '1px solid',
                borderColor: alpha('#fff', 0.08),
                mb: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
                  <FavoriteIcon sx={{ color: '#F43F5E', fontSize: 20, mt: 0.2 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#F8FAFC' }}>
                      SECTION A — SPARING · WATER QUALITY COMPLIANCE
                    </Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                      Group {groupLabel} · Heat bars from alert Baku Mutu · pH = % deviasi dari ideal · Flow L/min -&gt; m3/s untuk Load
                    </Typography>
                  </Box>
                </Box>
                <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#94A3B8', flexShrink: 0 }}>
                  SCALE 0–{SCALE_MAX}% · LIVE
                </Typography>
              </Box>
              {sparingRows.length === 0 ? (
                <Typography sx={{ fontSize: '0.78rem', color: '#94A3B8', textAlign: 'center', py: 2 }}>
                  Tidak ada parameter SPARING pada perangkat ini.
                </Typography>
              ) : (
                renderParamRows(sparingRows)
              )}
            </Box>
            {renderCards(sparingCards, 'SPARING · Analysis cards (Table 1)')}
          </>
        )}

        {showTmat && (
          <>
            <Box
              sx={{
                p: { xs: 1.25, sm: 1.75 },
                borderRadius: 2.5,
                bgcolor: '#0F172A',
                color: '#E2E8F0',
                border: '1px solid',
                borderColor: alpha('#fff', 0.08),
                mb: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
                  <OpacityIcon sx={{ color: '#38BDF8', fontSize: 20, mt: 0.2 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#F8FAFC' }}>
                      SECTION B — TMAT · GROUNDWATER & PEAT EWS
                    </Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                      Group {groupLabel} · TMAT = baku mutu PP 57/2016 (−0,40 m) · Moisture / Suhu / Hujan = indikator operasional & early warning
                    </Typography>
                  </Box>
                </Box>
                <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#94A3B8', flexShrink: 0 }}>
                  SCALE 0–{SCALE_MAX}% · LIVE
                </Typography>
              </Box>

              <Box
                sx={{
                  mb: 1.5,
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: alpha('#38BDF8', 0.06),
                  border: '1px solid',
                  borderColor: alpha('#38BDF8', 0.2),
                }}
              >
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: '#7DD3FC', mb: 0.75 }}>
                  Ambang pemantauan telemetri (IoT)
                </Typography>
                <Typography sx={{ fontSize: '0.62rem', color: '#94A3B8', mb: 1, lineHeight: 1.45 }}>
                  Berbeda dengan TMAT yang punya batas angka pasti di regulasi, Soil Moisture, Soil Temperature, dan Curah Hujan
                  diperlakukan sebagai indikator kondisi operasional, ambang fisiologis (hidrofobik), serta pemicu peringatan dini.
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1.1fr 1fr 1fr 1fr' },
                    gap: 0.75,
                    fontSize: '0.6rem',
                  }}
                >
                  {[
                    {
                      p: 'TMAT',
                      aman: '0 … −0,39 m',
                      waspada: '−0,40 m (PP 57/2016)',
                      bahaya: '< −0,40 m (mis. −0,50 m)',
                    },
                    {
                      p: 'Soil Moisture',
                      aman: '> 50% (ideal 50–80%)',
                      waspada: '35–49%',
                      bahaya: '< 35% hidrofobik',
                    },
                    {
                      p: 'Soil Temperature',
                      aman: '24–30°C',
                      waspada: '31–35°C',
                      bahaya: '> 35°C / ≥45°C smoldering',
                    },
                    {
                      p: 'Curah Hujan',
                      aman: 'Terdistribusi kontinu',
                      waspada: '< 5 mm · dry spell 10 hari',
                      bahaya: 'Dry spell > 10–14 hari',
                    },
                  ].map((row) => (
                    <Box
                      key={row.p}
                      sx={{
                        p: 0.85,
                        borderRadius: 1.5,
                        bgcolor: alpha('#fff', 0.03),
                        border: '1px solid',
                        borderColor: alpha('#fff', 0.06),
                      }}
                    >
                      <Typography sx={{ fontWeight: 800, fontSize: '0.65rem', color: '#E2E8F0', mb: 0.4 }}>
                        {row.p}
                      </Typography>
                      <Typography sx={{ color: '#86EFAC', lineHeight: 1.35 }}>Aman: {row.aman}</Typography>
                      <Typography sx={{ color: '#FCD34D', lineHeight: 1.35 }}>Waspada: {row.waspada}</Typography>
                      <Typography sx={{ color: '#FCA5A5', lineHeight: 1.35 }}>Bahaya: {row.bahaya}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              {tmatRows.length === 0 ? (
                <Typography sx={{ fontSize: '0.78rem', color: '#94A3B8', textAlign: 'center', py: 2 }}>
                  Tidak ada parameter TMAT (TMAT / water level / soil moisture / soil temp / rainfall) pada perangkat ini.
                </Typography>
              ) : (
                renderParamRows(tmatRows, { ambangLabel: 'AMBANG' })
              )}
            </Box>
            {renderCards(tmatCards, 'TMAT · Analysis cards (Table 2)')}
          </>
        )}

        {!showSparing && !showTmat && (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', textAlign: 'center', py: 3 }}>
            Tidak ada section analisis untuk group perangkat ini.
          </Typography>
        )}
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
