import { useEffect, useReducer } from 'react';
import { iris, RequestError } from './api';
export function useData<T = any>(path: string, query: Record<string, string> = {}, interval = 0) {
  const serialized = JSON.stringify(query);
  const key = JSON.stringify([path, serialized]);
  const [revision, refresh] = useReducer((n) => n + 1, 0);
  const [state, merge] = useReducer(
    (
      s: { key: string; data?: T; error: string; loading: boolean; at?: Date },
      p: Partial<typeof s> & { key: string },
    ) => ({
      ...(s.key === p.key ? s : { data: undefined, error: '', loading: false, at: undefined }),
      ...p,
    }),
    { key, error: '', loading: !!path },
  );
  useEffect(() => {
    let canceled = false,
      timer: number | undefined;
    merge({ key, error: '', loading: !!path });
    const sample = async () => {
      if (canceled) return;
      merge({ key, loading: true });
      try {
        const result = await iris<T>(path, JSON.parse(serialized));
        if (!canceled) merge({ key, data: result.data, error: '', at: new Date() });
      } catch (error) {
        if (!canceled)
          merge({
            key,
            error: (error as Error).message,
            ...(error instanceof RequestError && error.status === 403
              ? { data: undefined, at: undefined }
              : {}),
          });
      } finally {
        if (!canceled) {
          merge({ key, loading: false });
          if (interval)
            timer = window.setTimeout(() => {
              visibleSample();
            }, interval);
        }
      }
    };
    function visibleSample() {
      if (canceled) return;
      if (document.hidden) timer = window.setTimeout(visibleSample, interval);
      else void sample();
    }
    if (path) void sample();
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [path, serialized, key, interval, revision]);
  // Effects reset stored state after commit; a different source must already be empty at render.
  const current =
    path && state.key === key
      ? state
      : { data: undefined, error: '', loading: !!path, at: undefined };
  return {
    data: current.data,
    error: current.error,
    loading: current.loading,
    at: current.at,
    refresh,
  };
}
