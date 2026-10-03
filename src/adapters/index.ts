import { adaptBrandA, isBrandA } from './brandA';
import { adaptBrandB, isBrandB } from './brandB';
import { adaptBrandC, isBrandC } from './brandC';
import { fail } from './guards';
import type { AdapterError, Brand, Result, Telemetry } from './schema';

export * from './schema';
export type { BrandAPayload, BrandBPayload, BrandCPayload } from './rawTypes';
export { adaptBrandA, adaptBrandB, adaptBrandC };

/** Infer which vendor sent a payload from its shape alone (no side-channel hint needed). */
export function detectBrand(raw: unknown): Brand | null {
  if (isBrandA(raw)) return 'A';
  if (isBrandB(raw)) return 'B';
  if (isBrandC(raw)) return 'C';
  return null;
}

/**
 * Convert any supported vendor payload into canonical Telemetry. Never throws:
 * a bad payload yields a typed error so one broken device cannot stop the pipeline.
 */
export function normalize(raw: unknown): Result<Telemetry, AdapterError> {
  switch (detectBrand(raw)) {
    case 'A':
      return adaptBrandA(raw);
    case 'B':
      return adaptBrandB(raw);
    case 'C':
      return adaptBrandC(raw);
    default:
      return fail('unknown_format', 'payload matches none of the known vendor formats');
  }
}
export * from './fieldMap';
