import { useEffect, useMemo, useRef, useState } from 'react';
import { Edition, Item, buildPages, canRequest, istDate, recordRequest, remaining, searchItems, Quota, MAX_REQUESTS_PER_DAY } from './core';
import { dailyPrompt, verifyPrompt, generate, testKey } from './api';

const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full */ } },
};
type Tab = 'edition' | 'categories' | 'search' | 'revision' | 'archive' | 'settings';
let inflight = false;

function Rich({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}
function Card({ it, saved, toggle }: { it: Item; saved: boolean; toggle: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="item">
      <div className="meta"><span>{it.category}{it.state ? ` · ${it.state}` : ''}</span>
        <span className={it.status === 'verified' ? 'ok' : 'warn'}>{it.status === 'verified' ? 'Cross-verified' : 'Official source only'}</span></div>
      <h3>{it.headline}</h3>
      <p className="stmt"><Rich text={it.statement} /></p>
      {it.examFacts.length > 0 && <ul className="recall">{it.examFacts.map((f, i) => <li key={i}><Rich text={f} /></li>)}</ul>}
      <div className="row">
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide English notes' : 'English notes'}</button>
        <button className="link" onClick={toggle} aria-pressed={saved}>{saved ? 'Saved' : 'Save'}</button>
      </div>
      {open && <div className="eng">
        {it.vocab.map(v => <p key={v.word}><b>{v.word}</b>{v.pos ? ` (${v.pos})` : ''}: {v.meaning}{v.synonym ? ` Synonym: ${v.synonym}.` : ''}{v.antonym ? ` Antonym: ${v.antonym}.` : ''}</p>)}
        {it.grammar && <p><b>{it.grammar.focus}:</b> {it.grammar.note} <i>{it.grammar.example}</i></p>}
        {!it.vocab.length && !it.grammar && <p>No English note for this item.</p>}
      </div>}
      <div className="src">{it.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.name}{s.date ? ` (${s.date})` : ''}</a>)}</div>
    </article>
  );
}

export default function App() {
  const today = istDate();
  const [tab, setTab] = useState<Tab>('edition');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editions, setEditions] = useState<Record<string, Edition>>(() => ls.get('editions', {}));
  const [quota, setQuota] = useState<Quota | null>(() => ls.get('quota', null));
  const [marks, setMarks] = useState<Record<string, Item>>(() => ls.get('marks', {}));
  const [cfg, setCfg] = useState(() => ls.get('cfg', { auto: true, remember: true, model: 'gemini-2.5-flash', state: '', font: 17, dark: false }));
  const [key, setKey] = useState(() => localStorage.getItem('gkey') || sessionStorage.getItem('gkey') || '');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewDate, setViewDate] = useState(today);
  const [pageNo, setPageNo] = useState(0);
  const [dir, setDir] = useState(0);
  const [q, setQ] = useState('');
  const touch = useRef<{ x: number; y: number } | null>(null);
  const ed = editions[viewDate];
  const isToday = viewDate === today;
  const pages = useMemo(() => buildPages(ed?.items || [], 5, cfg.state), [ed, cfg.state]);
  const all = useMemo(() => Object.values(editions).flatMap(e => e.items), [editions]);

  useEffect(() => { ls.set('cfg', cfg); document.documentElement.dataset.theme = cfg.dark ? 'dark' : 'light'; document.documentElement.style.setProperty('--fs', cfg.font + 'px'); }, [cfg]);
  const saveEditions = (e: Record<string, Edition>) => { setEditions(e); ls.set('editions', e); };

  async function refresh(manual: boolean) {
    const t = istDate();
    if (!key) { setMsg('Add your Google API key in Settings first.'); return; }
    if (!canRequest(quota, t, inflight)) { setMsg(inflight ? 'A request is already running.' : 'Daily request limit reached. Try again tomorrow (IST).'); return; }
    const existing = editions[t];
    if (manual && existing && !confirm('This uses one of your two daily requests to re-verify today\'s notes. Continue?')) return;
    inflight = true; setBusy(true); setMsg('');
    const nq = recordRequest(quota, t); setQuota(nq); ls.set('quota', nq);  // count before sending: failed calls still may bill
    try {
      const prompt = existing ? verifyPrompt(t, JSON.stringify(existing.items.map(({ id, ...r }) => r))) : dailyPrompt(t, cfg.state);
      const e = await generate(key, cfg.model, prompt, t, !!existing);
      if (!e.items.length) { setMsg('No items passed verification. Saved editions are unchanged.'); }
      else { saveEditions({ ...editions, [t]: e }); setViewDate(t); setPageNo(0); setMsg(`Saved ${e.items.length} verified items (${e.rejected} rejected).`); }
    } catch (err: any) { setMsg(err?.message || 'Unexpected error.'); }
    finally { inflight = false; setBusy(false); }
  }
  useEffect(() => { if (cfg.auto && key && !editions[today] && canRequest(quota, today, inflight)) void refresh(false); /* once per mount */ // eslint-disable-next-line
  }, []);

  const go = (d: number) => { const n = pageNo + d; if (n < 0 || n >= pages.length) return; setDir(d); setPageNo(n); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') go(1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') go(-1);
    if (e.key === 'Escape') setMenuOpen(false);
  };
  const toggleMark = (it: Item) => { const m = { ...marks }; if (m[it.id]) delete m[it.id]; else m[it.id] = it; setMarks(m); ls.set('marks', m); };
  const card = (it: Item) => <Card key={it.id} it={it} saved={!!marks[it.id]} toggle={() => toggleMark(it)} />;
  const left = remaining(quota, today);
  const page = pages[pageNo];

  return (
    <div className="app" onKeyDown={onKey}>
      <header>
        <div><h1>Exam Affairs Daily</h1>
          <p>{new Date(viewDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{!isToday && ' · archived edition'}</p></div>
        <button className="menu-toggle" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <span></span><span></span><span></span>
        </button>
      </header>
      {menuOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)}>
        <nav className="menu" aria-label="Sections" onClick={e => e.stopPropagation()}>
          <p className="menu-label">Explore</p>
          {(['edition', 'categories', 'search', 'revision', 'archive', 'settings'] as Tab[]).map(t =>
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setMenuOpen(false); }}>
              {t === 'edition' ? 'Today’s edition' : t[0].toUpperCase() + t.slice(1)}
            </button>
          )}
        </nav>
      </div>}
      {msg && <div className="banner" role="status">{msg}</div>}
      <main>
        {tab === 'edition' && (!ed ? (
          <div className="empty"><h2>{isToday ? "Today's edition is not loaded" : 'No edition for this date'}</h2>
            <p>{key ? `You have ${left} of ${MAX_REQUESTS_PER_DAY} requests left today.` : 'Add your Google API key in Settings to fetch notes.'}</p>
            {isToday && <button className="btn" disabled={busy || !key || left === 0} onClick={() => refresh(false)}>{busy ? 'Fetching…' : "Fetch today's notes"}</button>}
          </div>
        ) : !page ? <div className="empty"><h2>Nothing here yet</h2><p>No verified items for this filter.</p></div> : (
          <section className="reader" onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={e => { const s = touch.current; if (!s || window.getSelection()?.toString()) return; const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y; if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.25) go(dy < 0 ? 1 : -1); else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1); touch.current = null; }}>
            <div className="pagebar"><button onClick={() => go(-1)} disabled={pageNo === 0} aria-label="Previous page">‹</button>
              <div><strong>{page.title}</strong><small>Page {pageNo + 1} of {pages.length}</small></div>
              <button onClick={() => go(1)} disabled={pageNo >= pages.length - 1} aria-label="Next page">›</button></div>
            <div key={pageNo} className={'page ' + (dir > 0 ? 'fwd' : dir < 0 ? 'back' : '')}>{page.items.map(card)}</div>
            <p className="stamp">{isToday ? 'Updated' : 'Downloaded'} {new Date(ed.fetchedAt).toLocaleString('en-IN')} · {ed.items.length} items{ed.verifiedPass ? ' · re-verified' : ''}</p>
          </section>
        ))}
        {tab === 'categories' && <div className="list">{pages.length ? pages.map((p, i) => <button key={i} className="rowbtn" onClick={() => { setPageNo(i); setDir(0); setTab('edition'); }}>{p.title}<small>{p.items.length} items</small></button>) : <p className="empty">Load an edition first.</p>}</div>}
        {tab === 'search' && <div><input className="inp" type="search" placeholder="Search saved notes" value={q} onChange={e => setQ(e.target.value)} />
          {searchItems(all, q).map(card)}{q && !searchItems(all, q).length && <p className="empty">No match in saved editions.</p>}</div>}
        {tab === 'revision' && <div>{Object.values(marks).length ? Object.values(marks).map(card) : <p className="empty">Tap Save on any item to revise it here.</p>}</div>}
        {tab === 'archive' && <div className="list">{Object.keys(editions).sort().reverse().map(d => <button key={d} className="rowbtn" onClick={() => { setViewDate(d); setPageNo(0); setDir(0); setTab('edition'); }}>{d}{d === today ? ' (today)' : ''}<small>{editions[d].items.length} items · fetched {new Date(editions[d].fetchedAt).toLocaleString('en-IN')}</small></button>)}
          {!Object.keys(editions).length && <p className="empty">No saved editions.</p>}</div>}
        {tab === 'settings' && <div className="settings">
          <h2>Google API key</h2>
          <input className="inp" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={key} placeholder="Paste your key" onChange={e => setKey(e.target.value.trim())} />
          <label><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show key</label>
          <label><input type="checkbox" checked={cfg.remember} onChange={e => setCfg({ ...cfg, remember: e.target.checked })} /> Remember on this device</label>
          <div className="row">
            <button className="btn" onClick={() => { localStorage.removeItem('gkey'); sessionStorage.removeItem('gkey'); (cfg.remember ? localStorage : sessionStorage).setItem('gkey', key); setMsg('Key saved on this device.'); }}>Save key</button>
            <button className="btn alt" onClick={async () => { try { await testKey(key); setMsg('Connection works.'); } catch (e: any) { setMsg(e.message); } }}>Test</button>
            <button className="btn alt" onClick={() => { localStorage.removeItem('gkey'); sessionStorage.removeItem('gkey'); setKey(''); setMsg('Key removed.'); }}>Remove</button></div>
          <p className="note">The key stays in this browser and goes only to Google. Browser storage is not fully secure: malicious page code or anyone with your device could read it. Restrict the key in Google AI Studio and use a key with a spending cap.</p>
          <h2>Updates</h2>
          <label><input type="checkbox" checked={cfg.auto} onChange={e => setCfg({ ...cfg, auto: e.target.checked })} /> Fetch automatically on first open each day</label>
          <p>Requests used today: {MAX_REQUESTS_PER_DAY - left} of {MAX_REQUESTS_PER_DAY}. Resets at midnight IST.</p>
          <button className="btn alt" disabled={busy || left === 0 || !key} onClick={() => refresh(true)}>{editions[today] ? 'Re-verify today' : 'Fetch now'}</button>
          <label>Model <input className="inp" value={cfg.model} onChange={e => setCfg({ ...cfg, model: e.target.value.trim() })} /></label>
          <label>State focus <input className="inp" placeholder="e.g. Telangana (optional)" value={cfg.state} onChange={e => setCfg({ ...cfg, state: e.target.value })} /></label>
          <h2>Display</h2>
          <label>Font size {cfg.font}px <input type="range" min={14} max={24} value={cfg.font} onChange={e => setCfg({ ...cfg, font: +e.target.value })} /></label>
          <label><input type="checkbox" checked={cfg.dark} onChange={e => setCfg({ ...cfg, dark: e.target.checked })} /> Dark mode</label>
          <h2>Data</h2>
          <div className="row">
            <button className="btn alt" onClick={() => { const b = new Blob([JSON.stringify({ editions, marks }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'exam-affairs-backup.json'; a.click(); }}>Export</button>
            <button className="btn alt" onClick={() => { if (confirm('Delete all editions and saved items?')) { saveEditions({}); setMarks({}); ls.set('marks', {}); } }}>Clear data</button></div>
        </div>}
      </main>
    </div>
  );
}
