"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Shared fetch hook so pages do not re-implement loading/error handling.
 * Pass `null` to skip the request (e.g. while auth is still resolving).
 */
export function useApi<T>(path: string | null): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // Reset loading/error while rendering whenever the request identity changes.
  const requestKey = `${path ?? "none"}#${version}`;
  const [lastRequestKey, setLastRequestKey] = useState(requestKey);
  if (lastRequestKey !== requestKey) {
    setLastRequestKey(requestKey);
    setLoading(path !== null);
    setError(null);
  }

  useEffect(() => {
    if (path === null) return;

    let active = true;

    api<T>(path)
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(apiErrorMessage(err));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [path, version]);

  return { data, loading, error, reload };
}
