// The "try your own payload" box of the Cross-brand Hub: the starting texts it offers and the
// verdict on whatever text is in it. Pure, so the verdicts can be tested.
import { detectBrand, normalize, type AdapterErrorCode, type Brand, type Telemetry } from '../../adapters';
import { formatJson } from './format';

export type TryItVerdict =
  | { ok: true; brand: Brand; telemetry: Telemetry }
  | { ok: false; code: AdapterErrorCode | 'invalid_json' };

export function judge(text: string): TryItVerdict {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: 'invalid_json' };
  }
  const result = normalize(raw);
  if (!result.ok) return { ok: false, code: result.error.code };
  return { ok: true, brand: detectBrand(raw) as Brand, telemetry: result.value };
}

export const SAMPLE_IDS = ['A', 'B', 'C', 'implausible', 'nonNumeric', 'unknown', 'brokenJson'] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];

/** Starting texts: a real payload of each brand, and four ways a feed can go wrong. */
export function sampleText(id: SampleId, rawByBrand: Record<Brand, unknown>): string {
  const a = rawByBrand.A as Record<string, unknown>;
  switch (id) {
    case 'A':
    case 'B':
    case 'C':
      return formatJson(rawByBrand[id]);
    // A cell-temperature reading a sensor fault could produce: the right shape, an impossible value.
    case 'implausible':
      return formatJson({ ...a, temp_c: 900 });
    // The right shape with a text where a number belongs.
    case 'nonNumeric':
      return formatJson({ ...a, i_a: 'n/a' });
    // A format none of the adapters knows.
    case 'unknown':
      return formatJson({ vendor: 'X', v: 1, readings: { t: 41.5, soc: 80 } });
    // Cut off in the middle, as a dropped connection would leave it.
    case 'brokenJson': {
      const full = formatJson(a);
      return full.slice(0, Math.floor(full.length * 0.6));
    }
  }
}
