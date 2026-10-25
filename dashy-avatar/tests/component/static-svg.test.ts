import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_STATES } from '../../src/static';

describe('exported SVG files', () => {
  it.each(ALL_STATES)('%s parses as valid XML (full and small)', state => {
    for (const f of [`exports/svg/${state}.svg`, `exports/svg/small/${state}.svg`]) {
      const doc = new DOMParser().parseFromString(readFileSync(f, 'utf8'), 'image/svg+xml');
      expect(doc.querySelector('parsererror'), f).toBeNull();
      expect(doc.documentElement.getAttribute('role')).toBe('img');
      expect(doc.querySelectorAll('mask')).toHaveLength(2);
      expect(doc.querySelector('title')!.textContent).toMatch(/^Dashy: /);
    }
  });
});
