import { describe, expect, it } from 'vitest';
import { ASSUMPTION_IDS, DEFAULT_ASSUMPTIONS, defaultValues, incidentSavings } from '@/business/assumptions';
import en from '@/i18n/en.json';
import vi from '@/i18n/vi.json';

describe('business assumptions', () => {
  it('defines every assumption with a finite value and a unit', () => {
    for (const id of ASSUMPTION_IDS) {
      expect(Number.isFinite(DEFAULT_ASSUMPTIONS[id].value), id).toBe(true);
      expect(DEFAULT_ASSUMPTIONS[id].unit).toBeTruthy();
    }
    expect(Object.keys(defaultValues()).sort()).toEqual([...ASSUMPTION_IDS].sort());
  });

  it('keeps fractions between 0 and 1 and costs positive', () => {
    const v = defaultValues();
    for (const id of ['packDamageFraction', 'chargeShare'] as const) {
      expect(v[id]).toBeGreaterThan(0);
      expect(v[id]).toBeLessThanOrEqual(1);
    }
    expect(v.packCostVnd).toBeGreaterThan(0);
    expect(v.strandedCostVnd).toBeGreaterThan(0);
  });

  it('explains each assumption in both languages (what it is and why this default)', () => {
    for (const locale of [vi, en]) {
      for (const id of ASSUMPTION_IDS) {
        expect(locale.assumptions[id].label, id).toBeTruthy();
        expect(locale.assumptions[id].why, id).toBeTruthy();
      }
    }
  });

  it('computes savings as prevented x (pack cost x damage + stranded cost), linear in the count', () => {
    const v = defaultValues();
    const one = incidentSavings(1);
    expect(one.totalVnd).toBe(v.packCostVnd * v.packDamageFraction + v.strandedCostVnd);
    expect(incidentSavings(7).totalVnd).toBe(7 * one.totalVnd);
    expect(incidentSavings(0).totalVnd).toBe(0);
    expect(incidentSavings(3, { ...v, packDamageFraction: 0 }).packLossAvoidedVnd).toBe(0);
  });
});
