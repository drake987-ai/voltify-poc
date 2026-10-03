import { describe, expect, it } from 'vitest';
import { runSuite, evidenceSuites } from '@/eval/evidence';
import { runTimeline } from '@/eval/timeline';
import { RISK_RANK } from '@/lib/riskLevels';
import { TWIN_CASE_PARAM, caseOfSample, encodeTwinCase, parseTwinCase, specOfCase, type TwinCase } from '@/pages/twin/caseParam';

const valid: TwinCase = {
  scenario: 'baseline',
  seed: 301,
  n: 12,
  brand: 'B',
  batteryId: 'B-0002',
  durationS: 4500,
  inject: { atS: 1200, fault: { rShortOhm0: 20, rShortMinOhm: 0.08, tauS: 300 } },
};

describe('the case parameter of the Twin link', () => {
  it('round-trips through the address bar', () => {
    const text = decodeURIComponent(encodeTwinCase(valid));
    expect(parseTwinCase(text)).toEqual(valid);
    expect(TWIN_CASE_PARAM).toBe('case');
  });

  it('accepts a composed scenario and a case without a short', () => {
    const { inject: _inject, ...rest } = valid;
    void _inject;
    const c = { ...rest, scenario: ['overheatLoad', 'escalatingShort'] };
    expect(parseTwinCase(JSON.stringify(c))).toEqual(c);
  });

  it.each([
    ['nothing', null],
    ['empty', ''],
    ['not JSON', '{oops'],
    ['an array', '[1,2]'],
    ['a number', '12'],
    ['an unknown scenario', JSON.stringify({ ...valid, scenario: 'meteorStrike' })],
    ['an empty scenario list', JSON.stringify({ ...valid, scenario: [] })],
    ['a fractional seed', JSON.stringify({ ...valid, seed: 1.5 })],
    ['a huge fleet', JSON.stringify({ ...valid, n: 1e6 })],
    ['an unknown brand', JSON.stringify({ ...valid, brand: 'Z' })],
    ['an id of another brand', JSON.stringify({ ...valid, batteryId: 'A-0002' })],
    ['an id that is not an id', JSON.stringify({ ...valid, batteryId: 'B-2; drop table' })],
    ['an endless run', JSON.stringify({ ...valid, durationS: 1e7 })],
    ['a short that starts after the run', JSON.stringify({ ...valid, inject: { ...valid.inject, atS: 99999 } })],
    ['a short with NaN resistance', '{"scenario":"baseline","seed":1,"n":3,"brand":"A","batteryId":"A-0001","durationS":600,"inject":{"atS":1,"fault":{"rShortOhm0":null,"rShortMinOhm":1,"tauS":1}}}'],
    ['a short without a fault', JSON.stringify({ ...valid, inject: { atS: 10 } })],
  ])('refuses %s', (_name, text) => {
    expect(parseTwinCase(text as string | null)).toBeNull();
  });
});

describe('opening an Evidence pack on the Twin screen', () => {
  const toCase = caseOfSample;
  const firstAlert = (c: TwinCase) => {
    const t = runTimeline(specOfCase(c));
    const f = t.frames.find((fr) => fr.assessment && RISK_RANK[fr.assessment.risk.level] >= RISK_RANK.warning);
    return f ? f.tS : null;
  };

  it('replays the very pack the batch judged: an injected short is alerted at the same moment', () => {
    const spec = evidenceSuites().find((s) => /^short\.moderate\.A\./.test(s.id))!;
    const r = runSuite(spec);
    const target = r.samples.find((s) => s.group === 'short.moderate')!;
    expect(target.alertS).not.toBeNull();
    expect(firstAlert(toCase(target))).toBe(target.alertS);
  });

  it('replays a false alarm too (a weak-cell pack that was alerted in a fleet run)', () => {
    const spec = evidenceSuites().find((s) => /^maintenance\./.test(s.id))!;
    const r = runSuite(spec);
    const alerted = r.samples.find((s) => s.alertS !== null)!;
    expect(firstAlert(toCase(alerted))).toBe(alerted.alertS);
  });
});
