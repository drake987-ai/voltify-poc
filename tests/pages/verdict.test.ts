import { describe, expect, it } from 'vitest';
import { BRANDS, type Brand } from '@/adapters';
import { runHub } from '@/eval/hub';
import { SAMPLE_IDS, judge, sampleText } from '@/pages/hub/verdict';

const run = runHub({ seed: 202, durationS: 60, scenario: 'baseline' });
const raws = Object.fromEntries(BRANDS.map((b) => [b, run.streams[b].frames[1].raw])) as Record<Brand, unknown>;

describe('try-your-own-payload box', () => {
  it.each(BRANDS)('understands a real brand %s payload shown as text, and names the brand', (b) => {
    const v = judge(sampleText(b, raws));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.brand).toBe(b);
      expect(v.telemetry.brand).toBe(b);
      expect(v.telemetry).toEqual(run.streams[b].frames[1].telemetry);
    }
  });

  it('gives each kind of broken feed its own verdict, never throwing', () => {
    expect(judge(sampleText('implausible', raws))).toEqual({ ok: false, code: 'out_of_range' });
    expect(judge(sampleText('nonNumeric', raws))).toEqual({ ok: false, code: 'malformed' });
    expect(judge(sampleText('unknown', raws))).toEqual({ ok: false, code: 'unknown_format' });
    expect(judge(sampleText('brokenJson', raws))).toEqual({ ok: false, code: 'invalid_json' });
  });

  it('survives anything typed into it', () => {
    for (const text of ['', ' ', 'null', '[]', '{}', '12', '"x"', '[[[[', '{"bat_id":1,"cells_mv":2}']) {
      expect(() => judge(text), JSON.stringify(text)).not.toThrow();
      expect(judge(text).ok).toBe(false);
    }
  });

  it('offers every sample id', () => {
    for (const id of SAMPLE_IDS) expect(sampleText(id, raws).length).toBeGreaterThan(10);
  });
});
