// The three sources the brief cites (CLAUDE.md section 7), shown on the Evidence and Market screens
// together with what each is used for and what is NOT taken from it.
export const REFERENCE_IDS = ['mdpi', 'ifactory', 'tuoitre'] as const;
export type ReferenceId = (typeof REFERENCE_IDS)[number];

export const REFERENCE_URLS: Record<ReferenceId, string> = {
  mdpi: 'https://www.mdpi.com/2673-4052/6/4/92',
  ifactory: 'https://ifactoryapp.com/industries/automotive-manufacturing/how-ai-manages-thermal-runaway-risk-in-ev-battery-production',
  tuoitre: 'https://news.tuoitre.vn/charging-station-battery-swapping-investment-race-heats-up-in-vietnam-103260422150619538.htm',
};
