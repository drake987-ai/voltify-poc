import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const AI_DIR = join(__dirname, '..', '..', 'src', 'ai');

// Paths (relative to this file's perspective of the AI folder) that would give the AI
// access to simulator ground truth or to the evaluation harness.
const FORBIDDEN = /from\s+['"](?:\.\.\/sim|\.\.\/eval|@\/sim|@\/eval)/;
const ALLOWED = new Set(['nominal.ts']);

describe('the AI sees telemetry only', () => {
  const files = readdirSync(AI_DIR).filter((f) => f.endsWith('.ts'));

  it('finds the AI sources', () => {
    expect(files.length).toBeGreaterThan(8);
    expect(files).toContain('nominal.ts');
  });

  it('imports nothing from the simulator or the evaluation harness, except the nominal datasheet file', () => {
    const offenders = files.filter((f) => !ALLOWED.has(f) && FORBIDDEN.test(readFileSync(join(AI_DIR, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('limits what even the nominal file takes from the simulator to datasheet-level constants and formulas', () => {
    const text = readFileSync(join(AI_DIR, 'nominal.ts'), 'utf8');
    const imports = [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\.\/sim\/([^']+)'/g)].map((m) => ({
      names: m[1].split(',').map((n) => n.trim()),
      from: m[2],
    }));
    const forbiddenModules = imports.filter((i) => ['battery', 'fleet', 'scenarios', 'brandFormats'].includes(i.from));
    expect(forbiddenModules).toEqual([]);
    // No hidden per-unit state (battery config, truth, faults) may be imported by name.
    const names = imports.flatMap((i) => i.names);
    for (const bad of ['BatteryTruth', 'BatteryState', 'truthOf', 'createFleet', 'SCENARIOS', 'FAULT']) {
      expect(names).not.toContain(bad);
    }
  });

  it('does not read ground-truth fields anywhere in the AI', () => {
    const banned = /\b(truthOf|BatteryTruth|bmsTrippedAtS|qFaultW|shortCurrentA|faultOnsetS|faultActive)\b/;
    const offenders = files.filter((f) => banned.test(readFileSync(join(AI_DIR, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
