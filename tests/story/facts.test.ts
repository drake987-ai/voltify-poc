import { describe, expect, it } from 'vitest';
import { defaultRoiInputs } from '@/business/roi';
import { runCabinetAB } from '@/eval/cabinet';
import { runAB } from '@/eval/timeline';
import { abSpec } from '@/pages/ab/abConfig';
import { FACT_KEYS, abFacts, formatFacts, roiFacts, type FactFormat } from '@/story/facts';
import { BEAT_IDS, STORY_STEPS } from '@/story/steps';
import en from '@/i18n/en.json';
import vi from '@/i18n/vi.json';

const f: FactFormat = { num: (x, dp = 0) => x.toFixed(dp), vnd: (x) => `VND ${Math.round(x)}` };
const ab = runAB(abSpec('severeHeatLoad', 'A', 'full'));

describe('the numbers the captions quote', () => {
  it('come from the run on the BMS-vs-Voltify screen, not from typed-in text', () => {
    const a = abFacts(ab);
    expect(a.alertS).toBe(ab.voltify.summary.alertS);
    expect(a.tripS).toBe(ab.bms.summary.bmsTripS);
    expect(a.leadS).toBe(ab.leadTimeS);
    expect(a.peakVoltifyC).toBe(ab.voltify.summary.peakTempC);
    expect(a.stationId).toBe(ab.voltify.events.find((e) => e.kind === 'shipper_notified')!.stationId);
    expect(a.swapS).toBe(ab.voltify.summary.swapS);
    // The story is only worth telling if Voltify really is early and really holds the pack below the limit.
    expect(a.alertS!).toBeLessThan(a.tripS!);
    expect(a.leadS!).toBeGreaterThan(0);
    expect(a.peakVoltifyC).toBeLessThan(a.peakBmsC);
  });

  it('follow the ROI model with the measured careful case and the target case', () => {
    const cabinet = runCabinetAB({ seed: 202, brand: 'A', durationS: 18_000 });
    const roi = roiFacts(cabinet, { seed: 1, packs: 300, minutes: 120, baselineTrips: 3, voltifyTrips: 1, prevented: 2, rate: 2 / 3 });
    expect(roi.packs).toBe(defaultRoiInputs().packs);
    expect(roi.targetNetVnd).toBeGreaterThan(roi.carefulNetVnd);
    expect(roi.carefulNetVnd).toBeGreaterThan(0);
    expect(roi.carefulPaybackMonths).not.toBeNull();
    expect(roi.breakEvenPct!).toBeGreaterThan(0);
  });

  it('read as an ellipsis, never a guess, while a run has not finished', () => {
    const v = formatFacts({ ab: null, roi: null }, f);
    for (const k of FACT_KEYS) {
      if (k === 'derate') continue; // a policy constant, always known
      expect(v[k], k).toBe('…');
    }
    expect(v.derate).toBe('15');
  });

  it('are written with the clock (mm:ss) for times and minutes for the lead time once known', () => {
    const v = formatFacts({ ab: abFacts(ab), roi: null }, f);
    expect(v.alert).toMatch(/^\d\d:\d\d$/);
    expect(v.trip).toMatch(/^\d\d:\d\d$/);
    expect(v.lead).toBe((ab.leadTimeS! / 60).toFixed(1));
    expect(v.station).toMatch(/^HCM-\d+$/);
    expect(v.careful).toBe('…');
  });
});

describe('the captions', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

  it('exist for every step and moment in both languages and quote only known facts', () => {
    for (const locale of [vi, en]) {
      for (const step of STORY_STEPS) {
        for (const beat of BEAT_IDS) {
          const text = locale.story.beats[step.id][beat];
          expect(text, `${step.id}.${beat}`).toBeTruthy();
          for (const p of placeholders(text)) expect(FACT_KEYS as readonly string[], `${step.id}.${beat} {{${p}}}`).toContain(p);
        }
        expect(locale.story.steps[step.id].name).toBeTruthy();
        expect(locale.story.steps[step.id].what).toBeTruthy();
      }
    }
  });

  it('do not make absolute claims', () => {
    for (const locale of [vi, en]) {
      const all = JSON.stringify(locale.story).toLowerCase();
      for (const bad of ['99%', 'tuyệt đối', 'absolute', '100%', 'guarantee', 'cam kết 100']) expect(all.includes(bad), bad).toBe(false);
    }
  });
});
