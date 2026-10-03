import { describe, expect, it } from 'vitest';
import { formatJson } from '@/pages/hub/format';

describe('formatJson', () => {
  it('keeps arrays of numbers on one line and indents the rest', () => {
    const text = formatJson({ id: 'A-1', cells: [3.85, 3.851, 3.84], gps: { lat: 10.1, lng: 106.2 } });
    expect(text).toContain('"cells": [3.85, 3.851, 3.84]');
    expect(text).toContain('\n  "gps": {');
    expect(JSON.parse(text)).toEqual({ id: 'A-1', cells: [3.85, 3.851, 3.84], gps: { lat: 10.1, lng: 106.2 } });
  });

  it('rounds rebuilt floats to six decimals', () => {
    expect(formatJson({ v: 3.8460625000000001 / 3 })).toContain('1.282021');
    expect(formatJson([0.1 + 0.2])).toBe('[0.3]');
  });

  it('handles a positional array with a nested array', () => {
    const text = formatJson(['C1', 6, [-3, 4, 0], 293]);
    expect(text).toContain('[-3, 4, 0]');
    expect(JSON.parse(text)).toEqual(['C1', 6, [-3, 4, 0], 293]);
  });
});
