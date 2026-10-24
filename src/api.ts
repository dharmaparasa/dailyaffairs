import { Edition, extractJson, validateEdition } from './core';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export class ApiError extends Error {}
function explain(status: number, body: any): string {
  const m = String(body?.error?.message || '').slice(0, 160).replace(/AIza[\w-]+/g, '[key]');
  if (status === 400 && /API key/i.test(m)) return 'The API key is invalid. Check it in Settings.';
  if (status === 401 || status === 403) return 'Access denied. Enable the Generative Language API for this key and check its restrictions.';
  if (status === 429) return 'Quota exceeded or rate limited. Wait, or check your Google AI Studio quota and billing.';
  if (status === 404) return 'Model not found. Pick another model in Settings.';
  if (status >= 500) return 'Google API is unavailable right now. Your saved editions are unchanged.';
  return `Request failed (${status}). ${m}`;
}
async function call(key: string, path: string, init?: RequestInit) {
  let res: Response;
  try { res = await fetch(BASE + path, { ...init, headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' } }); }
  catch { throw new ApiError('Network error. Check your connection.'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(explain(res.status, body));
  return body;
}
/** Lightweight key check. Lists one model; does not use the daily edition quota. */
export async function testKey(key: string) { await call(key, '/models?pageSize=1'); }

const SCHEMA = `Return ONLY one JSON object: {"items":[{"category":one of [Polity & Governance, Government Schemes, Banking & Economy, Environment & Geography, Important Days, Science, Space & Defence, Railways & Infrastructure, Reports, Awards & Appointments, State Affairs],"headline":string,"statement":string (1-2 short sentences in formal exam-style English, wrap key names/dates/numbers in **double asterisks**),"examFacts":[string],"eventDate":"YYYY-MM-DD"|null,"state":string|null,"status":"verified" (>=2 independent source hosts) | "official_only" (official primary document only),"evidence":string (what each source confirms),"conflict":boolean (true if sources disagree),"sources":[{"name":string,"url":string (real https URL you actually found),"date":"YYYY-MM-DD"|null}],"vocab":[{"word":string taken from the statement,"pos":string,"meaning":string,"synonym":string,"antonym":string}] (max 2),"grammar":{"focus":string,"note":string,"example":string}|null}]}`;
const RULES = `Rules: include only facts useful for Indian competitive exams (SSC, RRB, banking, UPSC, State PSC). Exclude crime, accidents, celebrity, politics rows, opinions, stock tips, rumours, old news. Use only facts found in search results; never invent URLs, dates, numbers or themes. Omit any item you cannot verify or where sources disagree. Fewer items is better than filler. Do not repeat copied press releases as independent sources.`;
export function dailyPrompt(date: string, state: string) {
  return `Today is ${date} (IST). Search the web for India's most exam-relevant verified current affairs from the last 24-48 hours (all India${state ? `, plus ${state}` : ''}). Cover only categories with real news. ${RULES}\n${SCHEMA}`;
}
export function verifyPrompt(date: string, candidates: string) {
  return `Today is ${date} (IST). Re-verify each candidate item below with fresh web searches. Correct wrong facts, add missing sources, set conflict=true or drop items that cannot be confirmed, and add any clearly missed exam-relevant item. ${RULES}\n${SCHEMA}\nCANDIDATES:\n${candidates}`;
}
export async function generate(key: string, model: string, prompt: string, date: string, verifiedPass: boolean): Promise<Edition> {
  const body = await call(key, `/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST',
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.1 } }) });
  const cand = body?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: any) => p.text || '').join('');
  if (!text) throw new ApiError('Empty response from the API. Nothing was saved.');
  const gm = cand?.groundingMetadata;
  if (!gm?.groundingChunks?.length) throw new ApiError('The response had no search citations, so it was discarded.');
  let parsed; try { parsed = extractJson(text); } catch { throw new ApiError('Could not read the response as structured data. Nothing was saved.'); }
  const { items, rejected } = validateEdition(parsed);
  return { date, fetchedAt: new Date().toISOString(), model, items, rejected, queries: gm.webSearchQueries || [], verifiedPass };
}
