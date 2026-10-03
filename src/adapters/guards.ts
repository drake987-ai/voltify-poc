import type { AdapterError, Result, Telemetry } from './schema';
import { telemetryIssues } from './schema';

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export const isNumArray = (x: unknown): x is number[] => Array.isArray(x) && x.every(isNum);

export const fail = (code: AdapterError['code'], message: string): Result<never, AdapterError> => ({
  ok: false,
  error: { code, message },
});

/** Final gate shared by all adapters: reject readings outside plausible physical limits. */
export function finish(t: Telemetry): Result<Telemetry, AdapterError> {
  const issues = telemetryIssues(t);
  return issues.length === 0 ? { ok: true, value: t } : fail('out_of_range', issues.join('; '));
}
