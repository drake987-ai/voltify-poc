// Text for showing payloads on screen: indented JSON, with arrays of numbers kept on one line
// (a 16-cell voltage list should not take 16 lines).

const round = (_key: string, value: unknown): unknown =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : value;

/** Pretty-print any JSON value; numbers are rounded to 6 decimals so rebuilt floats stay readable. */
export function formatJson(value: unknown): string {
  const text = JSON.stringify(value, round, 2);
  // `[ 1, 2, 3 ]` spread over lines -> `[1, 2, 3]`.
  return text.replace(/\[\s*(-?[\d.eE+-]+(?:,\s*-?[\d.eE+-]+)*)\s*\]/g, (_m, inner: string) => `[${inner.replace(/\s*\n\s*/g, ' ')}]`);
}
