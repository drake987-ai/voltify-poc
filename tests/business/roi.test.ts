import { describe, expect, it } from 'vitest';
import { fadePerEfc, projectLifetime } from '@/sim';
import {
  ROI_FIELDS,
  ROI_INPUT_IDS,
  computeRoi,
  defaultRoiInputs,
  lifeExtensionFromChargeCooling,
  sanitizeInput,
  type RoiInputs,
  type RoiScenario,
} from '@/business/roi';
import { defaultValues, incidentSavings } from '@/business/assumptions';

const inputs = defaultRoiInputs();
const none: RoiScenario = { lifeExtensionPct: 0, electricitySavingPct: 0, preventionRate: 0 };
const target: RoiScenario = { lifeExtensionPct: 35, electricitySavingPct: 20, preventionRate: 0.5 };
const withInputs = (over: Partial<RoiInputs>): RoiInputs => ({ ...inputs, ...over });

describe('ROI inputs', () => {
  it('has a finite default inside its own range for every field', () => {
    for (const id of ROI_INPUT_IDS) {
      const { min, max } = ROI_FIELDS[id];
      expect(Number.isFinite(inputs[id]), id).toBe(true);
      expect(inputs[id], id).toBeGreaterThanOrEqual(min);
      expect(inputs[id], id).toBeLessThanOrEqual(max);
    }
  });

  it('shares its defaults with the fleet KPIs instead of repeating them', () => {
    const shared = defaultValues();
    for (const id of ['packCostVnd', 'packDamageFraction', 'strandedCostVnd', 'rideTempC', 'efcPerDay', 'chargeShare'] as const) {
      expect(inputs[id]).toBe(shared[id]);
    }
  });

  it('clamps a typed value into range and rejects non-numbers', () => {
    expect(sanitizeInput('packs', 5_000_000)).toBe(ROI_FIELDS.packs.max);
    expect(sanitizeInput('rideTempC', 3)).toBe(ROI_FIELDS.rideTempC.min);
    expect(sanitizeInput('efcPerDay', 1.5)).toBe(1.5);
    expect(sanitizeInput('packs', Number.NaN)).toBeNull();
    expect(sanitizeInput('packs', Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('baseline pack life', () => {
  it('is the Arrhenius projection at the operating temperature and cycle rate', () => {
    const r = computeRoi(inputs, none);
    const p = projectLifetime({ coreTempC: inputs.rideTempC, efcPerDay: inputs.efcPerDay });
    expect(r.baseline.daysToEol).toBe(p.daysToEol);
    expect(r.baseline.efcToEol).toBeCloseTo(0.2 / fadePerEfc(inputs.rideTempC), 9);
  });

  it('is shorter when hotter and when cycled more', () => {
    const base = computeRoi(inputs, none).baseline.daysToEol;
    expect(computeRoi(withInputs({ rideTempC: inputs.rideTempC + 5 }), none).baseline.daysToEol).toBeLessThan(base);
    expect(computeRoi(withInputs({ efcPerDay: inputs.efcPerDay * 2 }), none).baseline.daysToEol).toBeCloseTo(base / 2, 9);
  });

  it('replaces packs x 365 / life per year', () => {
    const r = computeRoi(withInputs({ packs: 1000 }), none);
    expect(r.baseline.replacementsPerYear).toBeCloseTo((1000 * 365) / r.baseline.daysToEol, 9);
    expect(r.baseline.replacementCostVnd).toBeCloseTo(r.baseline.replacementsPerYear * inputs.packCostVnd, 3);
  });
});

describe('savings', () => {
  it('are zero when no lever moves, and the net is then just minus the fee', () => {
    const r = computeRoi(inputs, none);
    expect(r.savings.totalVnd).toBeCloseTo(0, 6);
    expect(r.netPerYearVnd).toBeCloseTo(-r.saasCostPerYearVnd, 6);
    expect(r.paybackMonths).toBeNull();
    expect(r.incidentsPrevented).toBe(0);
  });

  it('on replacements follow P x N x 365/d0 x (1 - 1/(1+e))', () => {
    const e = 0.35;
    const r = computeRoi(inputs, { ...none, lifeExtensionPct: 35 });
    const expected = inputs.packCostVnd * ((inputs.packs * 365) / r.baseline.daysToEol) * (1 - 1 / (1 + e));
    expect(r.savings.replacementVnd).toBeCloseTo(expected, 3);
    expect(r.withVoltify.daysToEol).toBeCloseTo(r.baseline.daysToEol * 1.35, 9);
    expect(r.lifeAddedDays).toBeCloseTo(r.baseline.daysToEol * 0.35, 9);
  });

  it('on replacements grow with the extension but less than in proportion (a longer life is replaced less often)', () => {
    const at = (e: number) => computeRoi(inputs, { ...none, lifeExtensionPct: e }).savings.replacementVnd;
    expect(at(10)).toBeGreaterThan(at(5));
    expect(at(40)).toBeGreaterThan(at(20));
    expect(at(40)).toBeLessThan(2 * at(20));
  });

  it('on electricity are the bill times the saved share; the bill is packs x cycles x kWh / efficiency x price', () => {
    const r = computeRoi(inputs, { ...none, electricitySavingPct: 20 });
    const kwh = (inputs.packs * inputs.efcPerDay * 365 * inputs.packKwh) / inputs.chargeEfficiency;
    expect(r.baseline.energyKwhPerYear).toBeCloseTo(kwh, 6);
    expect(r.baseline.energyCostVnd).toBeCloseTo(kwh * inputs.electricityVndPerKwh, 3);
    expect(r.savings.energyVnd).toBeCloseTo(0.2 * r.baseline.energyCostVnd, 3);
  });

  it('on incidents reuse the Fleet KPI formula: prevented x (pack cost x damage + stranded cost)', () => {
    const r = computeRoi(inputs, { ...none, preventionRate: 0.5 });
    const base = (inputs.packs * inputs.incidentsPerThousandPacksYear) / 1000;
    expect(r.baseline.incidentsPerYear).toBeCloseTo(base, 9);
    expect(r.incidentsPrevented).toBeCloseTo(base * 0.5, 9);
    expect(r.withVoltify.incidentsPerYear).toBeCloseTo(base * 0.5, 9);
    const v = defaultValues();
    expect(r.savings.incidentsVnd).toBeCloseTo(incidentSavings(base * 0.5, v).totalVnd, 3);
    expect(r.savings.incidentPackLossVnd + r.savings.incidentStrandedVnd).toBeCloseTo(r.savings.incidentsVnd, 3);
  });

  it('add up: total = replacements + electricity + incidents; net = total - SaaS fee', () => {
    const r = computeRoi(inputs, target);
    expect(r.savings.totalVnd).toBeCloseTo(r.savings.replacementVnd + r.savings.energyVnd + r.savings.incidentsVnd, 3);
    expect(r.saasCostPerYearVnd).toBe(inputs.packs * inputs.saasFeeVndPerPackMonth * 12);
    expect(r.netPerYearVnd).toBeCloseTo(r.savings.totalVnd - r.saasCostPerYearVnd, 3);
  });

  it('scale linearly with the number of packs', () => {
    const a = computeRoi(withInputs({ packs: 1000 }), target);
    const b = computeRoi(withInputs({ packs: 4000 }), target);
    expect(b.savings.totalVnd).toBeCloseTo(4 * a.savings.totalVnd, 3);
    expect(b.netPerYearVnd).toBeCloseTo(4 * a.netPerYearVnd, 3);
    expect(b.paybackMonths!).toBeCloseTo(a.paybackMonths!, 9); // same per-pack economics
  });
});

describe('payback and break-even', () => {
  it('pays back the onboarding cost from the monthly net benefit', () => {
    const r = computeRoi(inputs, target);
    expect(r.netPerYearVnd).toBeGreaterThan(0);
    expect(r.paybackMonths!).toBeCloseTo(r.onboardingVnd / (r.netPerYearVnd / 12), 9);
  });

  it('is immediate with no onboarding cost, and absent when the net benefit is not positive', () => {
    expect(computeRoi(withInputs({ onboardingVndPerPack: 0 }), target).paybackMonths).toBe(0);
    expect(computeRoi(withInputs({ saasFeeVndPerPackMonth: 1_000_000 }), none).paybackMonths).toBeNull();
  });

  it('the break-even life extension is exactly where the net benefit crosses zero (other levers held)', () => {
    const lever = { electricitySavingPct: 0, preventionRate: 0 };
    const be = computeRoi(inputs, { ...lever, lifeExtensionPct: 0 }).breakEvenLifeExtensionPct!;
    expect(be).toBeGreaterThan(0);
    expect(computeRoi(inputs, { ...lever, lifeExtensionPct: be }).netPerYearVnd).toBeCloseTo(0, 0);
    expect(computeRoi(inputs, { ...lever, lifeExtensionPct: be * 0.9 }).netPerYearVnd).toBeLessThan(0);
    expect(computeRoi(inputs, { ...lever, lifeExtensionPct: be * 1.1 }).netPerYearVnd).toBeGreaterThan(0);
  });

  it('needs no extension when the fee is zero, and is impossible when the fee exceeds all replacement spend', () => {
    expect(computeRoi(withInputs({ saasFeeVndPerPackMonth: 0 }), none).breakEvenLifeExtensionPct).toBe(0);
    expect(computeRoi(withInputs({ saasFeeVndPerPackMonth: 1_000_000 }), none).breakEvenLifeExtensionPct).toBeNull();
  });

  it('reports benefit per VND of fee, and nothing when there is no fee', () => {
    const r = computeRoi(inputs, target);
    expect(r.benefitPerFeeVnd!).toBeCloseTo(r.savings.totalVnd / r.saasCostPerYearVnd, 9);
    expect(computeRoi(withInputs({ saasFeeVndPerPackMonth: 0 }), target).benefitPerFeeVnd).toBeNull();
  });
});

describe('life extension from a cooler charge', () => {
  it('is zero for no cooling and grows with it', () => {
    const i = { tempC: 42, chargeShare: 0.5 };
    expect(lifeExtensionFromChargeCooling(i, 0)).toBeCloseTo(0, 9);
    expect(lifeExtensionFromChargeCooling(i, 2)).toBeGreaterThan(0);
    expect(lifeExtensionFromChargeCooling(i, 4)).toBeGreaterThan(lifeExtensionFromChargeCooling(i, 2));
  });

  it('is nothing if no part of the cycle is spent charging, and largest if all of it is', () => {
    expect(lifeExtensionFromChargeCooling({ tempC: 42, chargeShare: 0 }, 4)).toBeCloseTo(0, 9);
    expect(lifeExtensionFromChargeCooling({ tempC: 42, chargeShare: 1 }, 4)).toBeGreaterThan(
      lifeExtensionFromChargeCooling({ tempC: 42, chargeShare: 0.5 }, 4),
    );
  });

  it('matches the Arrhenius ratio for a fully charging cycle', () => {
    expect(lifeExtensionFromChargeCooling({ tempC: 42, chargeShare: 1 }, 5)).toBeCloseTo((fadePerEfc(42) / fadePerEfc(37) - 1) * 100, 9);
  });
});

describe('edge cases', () => {
  it('stays finite and does not invent savings when packs do no cycles', () => {
    const r = computeRoi(withInputs({ efcPerDay: 0.1 }), target);
    expect(Number.isFinite(r.netPerYearVnd)).toBe(true);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(computeRoi(inputs, target))).toBe(JSON.stringify(computeRoi(inputs, target)));
  });
});
