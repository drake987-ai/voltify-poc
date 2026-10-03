import { useEffect, useState } from 'react';

/** `value`, but only once it has stopped changing for `delayMs` (so dragging a slider does not start a run per pixel). */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return settled;
}
