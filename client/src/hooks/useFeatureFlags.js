import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';

const defaultFlags = {
  mqttPublisher: true,
  sparing: false,
  tmat: false,
  klhkReporting: false,
};

export function useFeatureFlags() {
  const [flags, setFlags] = useState(defaultFlags);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = localStorage.getItem('iot_token');
      if (!token) {
        setFlags(defaultFlags);
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/features`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.features) {
        const features = { ...defaultFlags, ...data.features };
        features.klhkReporting = Boolean(
          features.klhkReporting ?? features.sparing ?? features.tmat
        );
        setFlags(features);
      }
    } catch {
      // Keep defaults; do not block UI.
      setFlags(defaultFlags);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { flags, loading, refresh };
}

