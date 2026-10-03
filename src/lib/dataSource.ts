// Every screen declares where its numbers come from (CLAUDE.md section 3, rule 2).
export type DataSource =
  | { kind: 'simulated' }
  | { kind: 'real'; dataset: string }
  | { kind: 'reference' };
