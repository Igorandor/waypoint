import { useEffect, useReducer } from 'react';
import { iris } from './api';
export function useData<T = any>(path: string, query: Record<string, string> = {}, interval = 0) {
  const [revision, refresh] = useReducer((n) => n + 1, 0);
  const [state, merge] = useReducer(
    (s: { data?: T; error: string; loading: boolean; at?: Date }, p: Partial<typeof s>) => ({
      ...s,
      ...p,
    }),
    { error: '', loading: !!path },
  );
  const serialized = JSON.stringify(query);
  useEffect(() => {
    let canceled = false,
      timer: number | undefined;
    merge({ data: undefined, error: '', loading: !!path, at: undefined });
    const sample = async () => {
      if (canceled) return;
      merge({ loading: true });
      try {
        const result = await iris<T>(path, JSON.parse(serialized));
        if (!canceled) merge({ data: result.data, error: '', at: new Date() });
      } catch (error) {
        if (!canceled) merge({ error: (error as Error).message });
      } finally {
        if (!canceled) {
          merge({ loading: false });
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
  }, [path, serialized, interval, revision]);
  return { ...state, refresh };
}
