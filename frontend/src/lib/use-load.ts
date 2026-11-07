"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

type State<T> = { key: string; data: T | null; error: string | null };

/**
 * Load data for `key` (e.g. the persona) and reload it on demand or every `pollMs`.
 * State is only set from the request's callback, and results are tagged with their key,
 * so switching persona never shows the previous customer's data.
 */
export function useLoad<T>(key: string, load: () => Promise<T>, pollMs = 0) {
  const [state, setState] = useState<State<T> | null>(null);
  const [tick, setTick] = useState(0);
  const run = useCallback(() => {
    load()
      .then((data) => setState({ key, data, error: null }))
      .catch((e: unknown) =>
        setState({ key, data: null, error: e instanceof ApiError ? e.message : "Something went wrong. Please try again." }),
      );
    // `load` is recreated every render; `key` and `tick` decide when to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  useEffect(() => {
    run();
    if (!pollMs) return;
    const timer = window.setInterval(run, pollMs);
    return () => window.clearInterval(timer);
  }, [run, pollMs]);

  const current = state?.key === key ? state : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    reload: () => setTick((t) => t + 1),
    /** Replace the data straight away, e.g. with what a save returned. */
    set: (data: T) => setState({ key, data, error: null }),
  };
}
