/**
 * Shared compact UI presets modeled on N-Dashboard typography and control sizing.
 * Use these on data pages (Devices, U-Dashboard, Status, Quick View, Data Dash)
 * so headers, filters and tables share one visual language.
 */

/** Page title, e.g. "Device Management" */
export const compactPageTitleSx = {
  fontWeight: 800,
  fontSize: '1.05rem',
  lineHeight: 1.2,
  color: 'text.primary',
};

/** One-line page subtitle under the title */
export const compactPageSubtitleSx = {
  fontSize: '0.72rem',
  color: 'text.secondary',
};

/** Card/section heading, e.g. "Site Overview" */
export const compactSectionTitleSx = {
  fontWeight: 700,
  fontSize: '0.82rem',
  color: 'text.primary',
};

/** Small Select control (pair with size="small" and compactMenuItemSx on items) */
export const compactSelectSx = {
  fontSize: '0.75rem',
  minHeight: 32,
  borderRadius: 1.5,
  '& .MuiSelect-select': { py: 0.6 },
};

/** MenuItem inside a compact Select */
export const compactMenuItemSx = { fontSize: '0.78rem' };

/** Small TextField (search boxes, filter inputs) — pair with size="small" */
export const compactTextFieldSx = {
  '& .MuiInputBase-root': { fontSize: '0.78rem', minHeight: 32, borderRadius: 1.5 },
  '& .MuiInputBase-input': { py: 0.6 },
  '& .MuiInputLabel-root': { fontSize: '0.78rem' },
};

/** Table header cell */
export const compactTableHeadCellSx = {
  fontSize: '0.7rem',
  fontWeight: 700,
  color: 'text.secondary',
  py: 0.75,
  whiteSpace: 'nowrap',
};

/** Table body cell */
export const compactTableCellSx = {
  fontSize: '0.75rem',
  py: 0.75,
};

/** Small chip used in tables and filters */
export const compactChipSx = {
  height: 20,
  fontSize: '0.62rem',
  fontWeight: 700,
  '& .MuiChip-label': { px: 0.6 },
};
