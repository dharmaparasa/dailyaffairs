import { describe, it, expect } from 'vitest';
import { istDate, canRequest, recordRequest, remaining, validateItem, validateEdition, dedupe, extractJson, buildPages, Item } from './core';
const good = (o: any = {}) => ({ category: 'Environment & Geography', headline: 'Ramsar site added in Tamil Nadu', statement: 'The **Ministry of Environment** has designated a new Ramsar site in Tamil Nadu, raising the national tally.', evidence: 'PIB release and The Hindu both report it.',
  status: 'verified', sources: [{ name: 'PIB', url: 'https://pib.gov.in/x' }, { name: 'The Hindu', url: 'https://www.thehindu.com/y' }], ...o });
describe('date', () => {
  it('uses IST boundary', () => {
    expect(istDate(new Date('2026-10-24T18:29:00Z'))).toBe('2026-10-24');
    expect(istDate(new Date('2026-10-24T18:31:00Z'))).toBe('2026-10-25');
  });
});
describe('quota', () => {
  it('caps at two per day and resets next day', () => {
    let q = recordRequest(null, '2026-10-24'); q = recordRequest(q, '2026-10-24');
    expect(remaining(q, '2026-10-24')).toBe(0);
    expect(canRequest(q, '2026-10-24', false)).toBe(false);
    expect(canRequest(q, '2026-10-25', false)).toBe(true);
  });
  it('blocks concurrent requests', () => expect(canRequest(null, '2026-10-24', true)).toBe(false));
});
describe('validation', () => {
  it('accepts a well-formed verified item', () => expect(typeof validateItem(good())).toBe('object'));
  it('rejects single-host verified', () => expect(validateItem(good({ sources: [{ name: 'A', url: 'https://a.com/1' }, { name: 'B', url: 'https://a.com/2' }] }))).toMatch(/two/));
  it('rejects http and placeholders', () => {
    expect(typeof validateItem(good({ sources: [{ name: 'A', url: 'http://a.com' }] }))).toBe('string');
    expect(typeof validateItem(good({ statement: 'The government notified a tiger reserve in [verified state] today for exams.' }))).toBe('string');
  });
  it('allows official_only with gov source', () => expect(typeof validateItem(good({ status: 'official_only', sources: [{ name: 'RBI', url: 'https://rbi.org.in/n' }] }))).toBe('object'));
  it('rejects conflicts and counts rejections', () => { const r = validateEdition({ items: [good(), good({ conflict: true, headline: 'Other thing here' })] }); expect(r.items.length).toBe(1); expect(r.rejected).toBe(1); });
  it('survives malformed input', () => expect(validateEdition(null).items).toEqual([]));
});
describe('dedupe', () => {
  it('merges similar headlines and unions sources', () => {
    const a = validateItem(good()) as Item; const b = validateItem(good({ headline: 'New Ramsar site added in Tamil Nadu', sources: [{ name: 'DD', url: 'https://ddnews.gov.in/z' }, { name: 'TOI', url: 'https://toi.in/z' }] })) as Item;
    const d = dedupe([a, b]); expect(d.length).toBe(1); expect(d[0].sources.length).toBe(4);
  });
});
describe('misc', () => {
  it('extracts JSON from fenced text', () => expect(extractJson('```json\n{"items":[]}\n```')).toEqual({ items: [] }));
  it('throws on garbage', () => expect(() => extractJson('nope')).toThrow());
  it('builds pages of at most 5', () => { const items = Array.from({ length: 7 }, (_, i) => validateItem(good({ headline: 'Unique wetland headline number ' + 'abcdefg'.slice(0, i + 1) + i })) as Item); expect(buildPages(items).every(p => p.items.length <= 5)).toBe(true); });
});
