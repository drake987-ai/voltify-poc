import { useEffect, useState } from 'react';

export type AsyncState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string };

/** Run an async factory whenever `key` changes; stale results from an earlier key are ignored. */
export function useAsync<T>(factory: () => Promise<T>, key: string): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    factory().then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
    };
    // The key identifies the request; the factory closure is rebuilt every render.
  }, [key]);
  return state;
}
