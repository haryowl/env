const SPARING_PARAMS = ['pH', 'cod', 'tss', 'nh3n', 'debit'];

const TMAT_PARAMS = [
  'tmat_value',
  'hujan_value',
  'kelembapan_tanah',
  'suhu_value',
  'ph_value',
  'baterai_value',
  'tss_value',
];

const REPORTING_TYPES = new Set(['off', 'sparing', 'tmat']);
const SEND_MODES = new Set(['hourly', '2min', 'both']);

const DEFAULT_SPARING_API_BASE = 'https://sparing.kemenlh.go.id/api';
const DEFAULT_TMAT_API_URL =
  'https://gambutindonesia.kemenlh.go.id/backoffice-SPAgambut/api/v1/realtime_push';

/** Max hourly batches in one period operation. */
const MAX_PERIOD_HOURLY_SLOTS = 168;
/** Max 2-minute slots in one period operation (24h). */
const MAX_PERIOD_2MIN_SLOTS = 720;

module.exports = {
  SPARING_PARAMS,
  TMAT_PARAMS,
  REPORTING_TYPES,
  SEND_MODES,
  DEFAULT_SPARING_API_BASE,
  DEFAULT_TMAT_API_URL,
  MAX_PERIOD_HOURLY_SLOTS,
  MAX_PERIOD_2MIN_SLOTS,
};
