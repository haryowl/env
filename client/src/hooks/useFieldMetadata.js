import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

const humanize = (value = '') =>
  value
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

let metadataCache = null;
let metadataPromise = null;

/** Stable fallback so consumers do not get a new {} reference every render while loading. */
const EMPTY_METADATA = Object.freeze({});

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeFields = (fields = []) => {
  const map = {};
  fields.forEach((field) => {
    if (!field?.field_name) {
      return;
    }
    map[field.field_name] = {
      fieldName: field.field_name,
      displayName: field.display_name || humanize(field.field_name),
      unit: field.unit || '',
      dataType: field.data_type || null,
      description: field.description || '',
      category: field.category || '',
      statusKeywords: field.status_keywords || '',
      displayMin: toFiniteOrNull(field.display_min),
      displayMax: toFiniteOrNull(field.display_max),
    };
  });
  return map;
};

const fetchFieldDefinitions = async () => {
  const token = localStorage.getItem('iot_token');
  const response = await axios.get(`${API_BASE_URL}/field-definitions`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });

  if (!response.data?.fields) {
    return {};
  }

  return normalizeFields(response.data.fields);
};

export const getCachedFieldMetadata = () => metadataCache;

export const useFieldMetadata = () => {
  const [metadata, setMetadata] = useState(metadataCache);
  const [loading, setLoading] = useState(!metadataCache);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const resolve = (data) => {
      if (!isMounted) return;
      metadataCache = data;
      setMetadata(data);
      setLoading(false);
    };

    const reject = (err) => {
      if (!isMounted) return;
      setError(err);
      setLoading(false);
    };

    if (metadataCache) {
      setMetadata(metadataCache);
      setLoading(false);
    } else {
      if (!metadataPromise) {
        metadataPromise = fetchFieldDefinitions()
          .then((data) => {
            metadataPromise = null;
            metadataCache = data;
            return data;
          })
          .catch((err) => {
            metadataPromise = null;
            throw err;
          });
      }

      metadataPromise.then(resolve).catch(reject);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFieldDefinitions();
      metadataCache = data;
      setMetadata(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const getMetadata = useCallback(
    (fieldName) => {
      if (!fieldName) return null;
      return metadata?.[fieldName] || null;
    },
    [metadata]
  );

  const getUnit = useCallback(
    (fieldName) => getMetadata(fieldName)?.unit || '',
    [getMetadata]
  );

  /** Configured display range [min, max] for a field, or null when not set / invalid. */
  const getDisplayRange = useCallback(
    (fieldName) => {
      const meta = getMetadata(fieldName);
      if (!meta) return null;
      const { displayMin, displayMax } = meta;
      if (displayMin === null || displayMax === null || displayMax <= displayMin) {
        return null;
      }
      return { min: displayMin, max: displayMax };
    },
    [getMetadata]
  );

  const formatDisplayName = useCallback(
    (fieldName, { withUnit = false } = {}) => {
      if (!fieldName) return '';
      const meta = getMetadata(fieldName);
      const label = meta?.displayName || humanize(fieldName);
      if (withUnit && meta?.unit) {
        return `${label} (${meta.unit})`;
      }
      return label;
    },
    [getMetadata]
  );

  return {
    metadata: metadata ?? EMPTY_METADATA,
    loading,
    error,
    refresh,
    getMetadata,
    getUnit,
    getDisplayRange,
    formatDisplayName,
  };
};

