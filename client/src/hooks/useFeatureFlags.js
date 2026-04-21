import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';

const defaultFlags = {
  mqttPublisher: true,
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
        setFlags({ ...defaultFlags, ...data.features });
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

