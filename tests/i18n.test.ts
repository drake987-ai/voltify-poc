import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import vi from '@/i18n/vi.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const viFlat = flatten(vi as Tree);
const enFlat = flatten(en as Tree);

describe('locale files', () => {
  it('vi and en define exactly the same keys (EN must be complete)', () => {
    const onlyVi = Object.keys(viFlat).filter((k) => !(k in enFlat));
    const onlyEn = Object.keys(enFlat).filter((k) => !(k in viFlat));
    expect({ onlyVi, onlyEn }).toEqual({ onlyVi: [], onlyEn: [] });
  });

  it('has no empty strings', () => {
    const empty = [...Object.entries(viFlat), ...Object.entries(enFlat)]
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it('uses the same interpolation placeholders in both languages', () => {
    const mismatched = Object.keys(viFlat).filter(
      (k) => JSON.stringify(placeholders(viFlat[k]!)) !== JSON.stringify(placeholders(enFlat[k] ?? '')),
    );
    expect(mismatched).toEqual([]);
  });

  it('does not make absolute claims forbidden by CLAUDE.md section 3', () => {
    const banned = [/99\s*%/, /tuyệt đối/i, /absolute/i, /97[.,]4/];
    const hits = [...Object.entries(viFlat), ...Object.entries(enFlat)]
      .filter(([, v]) => banned.some((re) => re.test(v)))
      .map(([k]) => k);
    expect(hits).toEqual([]);
  });
});
