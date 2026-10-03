// The competitor table (CLAUDE.md section 7). Only what the brief states is filled in; a cell with no
// source is left as an explicit placeholder rather than guessed, in line with the rule that no figure
// or claim appears without a basis.
export const COMPETITOR_ROWS = ['vehicle', 'compat', 'charging', 'ai', 'model', 'market'] as const;
export type CompetitorRow = (typeof COMPETITOR_ROWS)[number];

export const COMPETITOR_COLUMNS = ['voltify', 'oem', 'deeptech', 'inhouse'] as const;
export type CompetitorColumn = (typeof COMPETITOR_COLUMNS)[number];

/** Cells that stay placeholders until a verified source is found. */
export const PLACEHOLDER_CELLS: readonly `${CompetitorColumn}.${CompetitorRow}`[] = [
  'oem.charging',
  'oem.ai',
  'oem.model',
  'oem.market',
  'deeptech.compat',
  'deeptech.model',
  'inhouse.compat',
  'inhouse.charging',
  'inhouse.model',
];
