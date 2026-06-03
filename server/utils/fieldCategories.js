const { getRows } = require('../config/database');

const STATUS_CATEGORY = 'Status';

let categoryCache = null;
let categoryCacheAt = 0;
const CACHE_MS = 60 * 1000;

async function getFieldCategoryMap() {
  const now = Date.now();
  if (categoryCache && now - categoryCacheAt < CACHE_MS) {
    return categoryCache;
  }
  const rows = await getRows('SELECT field_name, category FROM field_definitions');
  const map = {};
  for (const row of rows) {
    if (row?.field_name) {
      map[row.field_name] = (row.category || '').trim();
    }
  }
  categoryCache = map;
  categoryCacheAt = now;
  return map;
}

function parseCategoryQuery(req) {
  const excludeCategories = req.query.excludeCategories
    ? String(req.query.excludeCategories)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const categories = req.query.categories
    ? String(req.query.categories)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  return { excludeCategories, categories };
}

function fieldPassesCategoryFilter(fieldName, categoryMap, { excludeCategories = [], categories = null } = {}) {
  if (!fieldName) return false;
  const cat = categoryMap[fieldName] || '';
  if (categories && categories.length > 0) {
    return categories.includes(cat);
  }
  if (excludeCategories.length > 0 && excludeCategories.includes(cat)) {
    return false;
  }
  return true;
}

function filterFieldNames(fieldNames, categoryMap, options = {}) {
  return (fieldNames || []).filter((name) => fieldPassesCategoryFilter(name, categoryMap, options));
}

module.exports = {
  STATUS_CATEGORY,
  getFieldCategoryMap,
  parseCategoryQuery,
  fieldPassesCategoryFilter,
  filterFieldNames,
};
