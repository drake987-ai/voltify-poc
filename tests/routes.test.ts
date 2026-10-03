import { describe, expect, it } from 'vitest';
import { allPaths, findRoute, NAV_GROUPS, ROUTES } from '@/app/routes';
import en from '@/i18n/en.json';
import vi from '@/i18n/vi.json';
import { PAGE_IDS } from '@/lib/pageIds';

describe('route registry', () => {
  it('has exactly one route per page id', () => {
    expect(ROUTES.map((r) => r.id).sort()).toEqual([...PAGE_IDS].sort());
  });

  it('has no duplicate URL patterns', () => {
    const paths = ROUTES.flatMap(allPaths);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('puts every route in a known nav group', () => {
    for (const route of ROUTES) expect(NAV_GROUPS).toContain(route.group);
  });

  it('has a nav label and page title/subtitle in both languages', () => {
    for (const locale of [vi, en]) {
      for (const route of ROUTES) {
        expect(locale.nav.items[route.id], `nav.items.${route.id}`).toBeTruthy();
        expect(locale.pages[route.id].title, `pages.${route.id}.title`).toBeTruthy();
        expect(locale.pages[route.id].subtitle, `pages.${route.id}.subtitle`).toBeTruthy();
      }
    }
  });

  it('resolves URLs back to routes, including the parameterised twin path', () => {
    expect(findRoute('/fleet')?.id).toBe('fleet');
    expect(findRoute('/twin')?.id).toBe('twin');
    expect(findRoute('/twin/A-0412')?.id).toBe('twin');
    expect(findRoute('/does-not-exist')).toBeUndefined();
  });
});
