// The 10 screens of CLAUDE.md section 6 (Story Mode and Sandbox Mode are the
// two halves of screen 10). Kept in one place so locale keys, the router and the
// sidebar cannot drift apart.
export const PAGE_IDS = [
  'story',
  'sandbox',
  'fleet',
  'twin',
  'bms',
  'vitals',
  'intervention',
  'crossBrand',
  'roi',
  'evidence',
  'market',
] as const;

export type PageId = (typeof PAGE_IDS)[number];
