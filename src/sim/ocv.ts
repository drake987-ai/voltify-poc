import { OCV_TABLE } from './params';

/** Open-circuit voltage of one cell (V) at state of charge `soc` (0..1, clamped). */
export function ocv(soc: number): number {
  const s = soc <= 0 ? 0 : soc >= 1 ? 1 : soc;
  for (let i = 1; i < OCV_TABLE.length; i++) {
    const [s1, v1] = OCV_TABLE[i];
    if (s <= s1) {
      const [s0, v0] = OCV_TABLE[i - 1];
      return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0);
    }
  }
  return OCV_TABLE[OCV_TABLE.length - 1][1];
}
