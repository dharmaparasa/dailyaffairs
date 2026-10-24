export const CATS = ['Polity & Governance','Government Schemes','Banking & Economy','Environment & Geography','Important Days','Science, Space & Defence','Railways & Infrastructure','Reports, Awards & Appointments','State Affairs'] as const;
export type Cat = typeof CATS[number];
export interface Source { name: string; url: string; date?: string }
export interface Vocab { word: string; pos?: string; meaning: string; synonym?: string; antonym?: string }
export interface Item {
  id: string; category: Cat; headline: string; statement: string; examFacts: string[]; eventDate?: string; state?: string;
  sources: Source[]; status: 'verified' | 'official_only'; evidence: string; vocab: Vocab[];
  grammar?: { focus: string; note: string; example: string };
}
export interface Edition { date: string; fetchedAt: string; model: string; items: Item[]; rejected: number; queries: string[]; verifiedPass: boolean }
export interface Quota { date: string; used: number }
export const MAX_REQUESTS_PER_DAY = 2;

/** Calendar day in Asia/Kolkata as YYYY-MM-DD. */
export function istDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function normalizeQuota(q: Quota | null, today: string): Quota { return q && q.date === today ? q : { date: today, used: 0 }; }
export function remaining(q: Quota | null, today: string, max = MAX_REQUESTS_PER_DAY): number { return Math.max(0, max - normalizeQuota(q, today).used); }
export function canRequest(q: Quota | null, today: string, inflight: boolean, max = MAX_REQUESTS_PER_DAY): boolean { return !inflight && remaining(q, today, max) > 0; }
export function recordRequest(q: Quota | null, today: string): Quota { const n = normalizeQuota(q, today); return { date: today, used: n.used + 1 }; }

export function extractJson(text: string): unknown {
  const t = text.replace(/```json|```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('No JSON object in model response');
  return JSON.parse(t.slice(a, b + 1));
}
const OFFICIAL = [/\.gov\.in$/, /\.nic\.in$/, /(^|\.)rbi\.org\.in$/, /(^|\.)sebi\.gov\.in$/, /(^|\.)nabard\.org$/, /(^|\.)isro\.gov\.in$/, /(^|\.)drdo\.gov\.in$/, /(^|\.)eci\.gov\.in$/];
export function host(url: string): string | null {
  try { const u = new URL(url); return u.protocol === 'https:' ? u.hostname.replace(/^www\./, '').toLowerCase() : null; } catch { return null; }
}
export const isOfficialHost = (h: string) => OFFICIAL.some(r => r.test(h));
const PLACEHOLDER = /\[[^\]]*(verified|state|x+)[^\]]*\]|lorem|example\.com|placeholder/i;
const str = (v: unknown, min = 1) => typeof v === 'string' && v.trim().length >= min;
export function hashId(s: string): string { let h = 5381; for (const c of s.toLowerCase().replace(/[^a-z0-9]/g, '')) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return 'n' + h.toString(36); }

/** Returns a clean Item or a rejection reason. Never trusts model output blindly. */
export function validateItem(raw: any): Item | string {
  if (!raw || typeof raw !== 'object') return 'not an object';
  if (!CATS.includes(raw.category)) return 'unknown category';
  if (!str(raw.headline, 5) || !str(raw.statement, 25) || raw.statement.length > 700) return 'missing or invalid text';
  if (PLACEHOLDER.test(raw.headline + raw.statement)) return 'placeholder text';
  if (raw.conflict === true) return 'sources conflict';
  if (!str(raw.evidence, 10)) return 'no evidence note';
  const sources: Source[] = [];
  for (const s of Array.isArray(raw.sources) ? raw.sources : []) {
    if (s && str(s.name) && host(s.url) && !sources.some(x => x.url === s.url)) sources.push({ name: s.name.trim(), url: s.url, date: str(s.date) ? s.date : undefined });
  }
  const hosts = new Set(sources.map(s => host(s.url)!));
  let status: Item['status'];
  if (raw.status === 'verified') { if (hosts.size < 2) return 'needs two independent source hosts'; status = 'verified'; }
  else if (raw.status === 'official_only') { if (![...hosts].some(isOfficialHost)) return 'official_only needs an official source'; status = 'official_only'; }
  else return 'invalid status';
  if (raw.eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(raw.eventDate)) return 'bad event date';
  const vocab: Vocab[] = (Array.isArray(raw.vocab) ? raw.vocab : []).filter((v: any) => v && str(v.word) && str(v.meaning)).slice(0, 2);
  const g = raw.grammar && str(raw.grammar.focus) && str(raw.grammar.note) && str(raw.grammar.example) ? raw.grammar : undefined;
  return {
    id: hashId(raw.headline), category: raw.category, headline: raw.headline.trim(), statement: raw.statement.trim(),
    examFacts: (Array.isArray(raw.examFacts) ? raw.examFacts : []).filter((x: unknown) => str(x)).slice(0, 4),
    eventDate: raw.eventDate || undefined, state: str(raw.state) ? raw.state : undefined, sources, status, evidence: raw.evidence.trim(), vocab, grammar: g
  };
}
export function validateEdition(raw: any): { items: Item[]; rejected: number } {
  const list: any[] = Array.isArray(raw?.items) ? raw.items : [];
  const items: Item[] = []; let rejected = 0;
  for (const r of list) { const v = validateItem(r); if (typeof v === 'string') rejected++; else items.push(v); }
  return { items: dedupe(items), rejected };
}
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3));
function jaccard(a: Set<string>, b: Set<string>) { let i = 0; a.forEach(x => b.has(x) && i++); return i / (a.size + b.size - i || 1); }
export function dedupe(items: Item[]): Item[] {
  const out: Item[] = [];
  for (const it of items) {
    const dup = out.find(o => o.id === it.id || jaccard(tokens(o.headline), tokens(it.headline)) >= 0.6 || o.sources.some(s => it.sources.some(t => t.url === s.url)));
    if (dup) { for (const s of it.sources) if (!dup.sources.some(x => x.url === s.url)) dup.sources.push(s); } else out.push({ ...it, sources: [...it.sources] });
  }
  return out;
}
export interface Page { title: string; items: Item[] }
export function buildPages(items: Item[], perPage = 5, state = ''): Page[] {
  const pool = state ? items.filter(i => !i.state || i.state === state) : items;
  const pages: Page[] = []; let cur: Page | null = null;
  for (const cat of CATS) {
    const list = pool.filter(i => i.category === cat);
    for (let i = 0; i < list.length; i += perPage) {
      const chunk = list.slice(i, i + perPage);
      if (cur && cur.items.length + chunk.length <= perPage && (chunk.length < 3 || cur.items.length < 3)) { cur.items.push(...chunk); if (!cur.title.includes(cat)) cur.title += ' · ' + cat; }
      else { cur = { title: cat, items: [...chunk] }; pages.push(cur); }
    }
  }
  return pages;
}
export function searchItems(items: Item[], q: string): Item[] {
  const t = q.toLowerCase().trim(); if (!t) return [];
  return items.filter(i => [i.headline, i.statement, i.state, i.eventDate, i.category, ...i.examFacts, ...i.sources.map(s => s.name)].join(' ').toLowerCase().includes(t));
}
