'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import NewsCard from '@/components/NewsCard';
import ChartCard from '@/components/ChartCard';
import Landing from '@/components/Landing';
import { LangBtn, tp, tx, useLang } from '@/lib/i18n';

const SAMPLE = { symbol: 'XAUUSD', tf: 'M15', price: 2411.9, adx: 31, rsi: 58, atr: 4.2, ema20: 2412.5, ema50: 2405.1 };
const STATUS: Record<string, string> = tp({ pending: 'รอ EA รับ', sent: 'ส่งให้ EA แล้ว', done: 'เข้าออเดอร์แล้ว', failed: 'ไม่สำเร็จ', blocked: 'ถูก Risk บล็อก' });
const PROVIDERS = [['anthropic', 'Claude'], ['openai', 'GPT'], ['google', 'Gemini']];
const REGIME: Record<string, string> = tp({ trend_up: 'แนวโน้มขาขึ้น', trend_down: 'แนวโน้มขาลง', range: 'ไซด์เวย์', volatile: 'ผันผวน', news: 'ช่วงข่าว' });
const REGIME_HINT: Record<string, string> = tp({
  trend_up: 'ADX สูง และ EMA20 อยู่เหนือ EMA50', trend_down: 'ADX สูง และ EMA20 อยู่ใต้ EMA50',
  range: 'ADX ต่ำ ราคาแกว่งในกรอบ', volatile: 'ผันผวนผิดปกติ ไม่มีทิศทางชัด', news: 'ช่วงข่าวแรง',
});
const GRID_COLS: [string, string, number][] = [['lot', 'Lot เริ่ม', 0.01], ['lotMult', 'Lot x', 0.1], ['step', 'Step (pts)', 50], ['stepW', 'Step W', 0.1], ['stepA', 'Step A', 0.1], ['max', 'Max ไม้', 1], ['tpN', 'TP ปกติ $', 0.5], ['tpO', 'TP เก่า $', 0.5], ['recMult', 'Rec x', 0.1]];
const INTERVALS = [1, 3, 5, 10, 15, 30, 60, 120];
const HOLDS = [0, 10, 15, 20, 30];
type Mode = 'idle' | 'listening' | 'speaking';

export default function Page() {
  const [key, setKey] = useState('');
  const [draft, setDraft] = useState('');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setModeState] = useState<Mode>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [saved, setSaved] = useState('');
  const [theme, setTheme] = useState('dark');
  const { t } = useLang();
  const [loginErr, setLoginErr] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [issued, setIssued] = useState<{ name: string; password?: string; eaKey?: string; login?: string } | null>(null);
  const [newLogin, setNewLogin] = useState('');
  const [fgOpen, setFgOpen] = useState(false); // login page: "forgot password" form
  const [fgLogin, setFgLogin] = useState('');
  const [fgKey, setFgKey] = useState('');
  const [fgPw, setFgPw] = useState('');
  const [fgBusy, setFgBusy] = useState(false);
  const [fgCopied, setFgCopied] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [myNewPw, setMyNewPw] = useState('');
  const [pwCopied, setPwCopied] = useState(false);
  const firstLoad = useRef(true); // true until the first state reply of the current account arrives
  const resetting = useRef(false); // true for a few seconds after the member resets their own password (old-password requests may still be in flight)
  const [acct, setAcct] = useState('main'); // admin only: which trading account's data is shown
  const [copied, setCopied] = useState(false);
  const [iv, setIv] = useState(15);
  const [mSym, setMSym] = useState('');
  const [sel, setSel] = useState('');
  const [gscope, setGscope] = useState('');   // '' = shared grid profiles, otherwise one pair's own set   // pair chosen in the pair list (drives the chart and the order box)
  const [mLot, setMLot] = useState('0.01');
  const [mMsg, setMMsg] = useState('');
  const [hold, setHold] = useState(15);
  const [grid, setGrid] = useState<{ profiles: Record<string, any>; map: Record<string, string> } | null>(null);
  const [mapDraft, setMapDraft] = useState<Record<string, string[]> | null>(null);
  const [autoVoice, setAutoVoice] = useState(false);
  const lastSeen = useRef<string | null>(null);
  const modeRef = useRef<Mode>('idle');
  const recRef = useRef<any>(null);
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };

  // ---- Floating orb ----
  // 'pip'  = Document Picture-in-Picture: a small always-on-top window you can drag over the MT5 chart (Chrome/Edge desktop).
  // 'page' = fallback for other browsers: a draggable orb that floats inside this page only.
  const [orb, setOrb] = useState<'off' | 'pip' | 'page'>('off');
  const pipRef = useRef<Window | null>(null);
  const toggleMicRef = useRef<(from?: Window) => void>(() => {});
  const loadRef = useRef<() => void>(() => {});
  const autoVoiceRef = useRef(false);

  const closeOrb = () => {
    const w = pipRef.current; pipRef.current = null;
    try { w?.close(); } catch {}
    setOrb('off');
  };
  const buildPip = (w: Window) => {
    const doc = w.document;
    for (const ss of Array.from(document.styleSheets)) { // reuse the page's own orb styles
      try { const st = doc.createElement('style'); st.textContent = Array.from(ss.cssRules).map((r) => r.cssText).join('\n'); doc.head.appendChild(st); }
      catch { if (ss.href) { const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = ss.href; doc.head.appendChild(l); } }
    }
    doc.documentElement.dataset.theme = document.documentElement.dataset.theme || 'dark';
    doc.title = 'AI Orb';
    const ov = doc.createElement('style');
    ov.textContent = 'html,body{margin:0;height:100%;overflow:hidden;background:var(--bg)}body{display:grid;place-items:center;cursor:pointer;user-select:none}.orb-wrap{width:100px;height:100px;margin:0}.orb-glow{inset:-26px}';
    doc.head.appendChild(ov);
    doc.body.innerHTML = '<div id="pipOrb" class="orb-wrap idle" role="button" aria-label={tx("คุยกับ AI")}><div class="orb-glow"></div><div class="orb-wave"></div><div class="orb-wave w2"></div><div class="orb-ring"></div><div class="orb-core"></div></div>';
    doc.body.addEventListener('click', () => toggleMicRef.current(w));
  };
  const openOrb = async () => {
    if (orb !== 'off' || pipRef.current) return;
    const dpip = (window as any).documentPictureInPicture;
    if (!dpip?.requestWindow) { setOrb('page'); return; }          // browser has no Document PiP -> in-page orb
    try {
      const w: Window = await dpip.requestWindow({ width: 200, height: 200 });
      buildPip(w);
      pipRef.current = w;
      w.addEventListener('pagehide', () => { if (pipRef.current === w) { pipRef.current = null; setOrb('off'); } });
      // the popup window is visible, so its timer is not throttled like the (hidden) dashboard tab
      // (this timer is the only poller while the orb is open) every 5 s with voice alerts on, otherwise every 15 s to save Redis commands
      let tick = 0;
      w.setInterval(() => { tick++; if (autoVoiceRef.current || tick % 3 === 0) loadRef.current(); }, 5000);
      setOrb('pip');
    } catch { setOrb('page'); }                                      // blocked / no user gesture -> in-page orb
  };
  useEffect(() => () => { try { pipRef.current?.close(); } catch {} }, []);
  useEffect(() => { // keep the popup in sync with the dashboard (status + theme)
    const w = pipRef.current; if (!w) return;
    const el = w.document.getElementById('pipOrb'); if (el) el.className = 'orb-wrap ' + mode;
    w.document.documentElement.dataset.theme = theme;
    w.document.title = mode === 'listening' ? tx('กำลังฟัง…') : mode === 'speaking' ? tx('กำลังตอบ…') : 'AI Orb';
  }, [mode, theme, orb]);

  useEffect(() => {
    setKey(sessionStorage.getItem('hubkey') || '');
    setAutoVoice(localStorage.getItem('autovoice') === '1');
    setTheme(document.documentElement.dataset.theme || 'dark');
    // browsers only allow speech after a user gesture: unlock it on the first click/tap
    const unlock = () => { try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {} };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const toggleTheme = () => {
    const nt = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement; root.classList.add('tt'); setTimeout(() => root.classList.remove('tt'), 500);   // smooth colour fade
    setTheme(nt); root.dataset.theme = nt;
    try { localStorage.setItem('theme', nt); } catch {}
  };
  const logout = () => { closeOrb(); sessionStorage.removeItem('hubkey'); setKey(''); setData(null); firstLoad.current = true; setUsers([]); setIssued(null); lastSeen.current = null; };
  const loginWith = async (password: string) => {
    setLoginErr('');
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setLoginErr(j.error || tx('เข้าสู่ระบบไม่สำเร็จ')); return; }
    const pw = password.trim(); sessionStorage.setItem('hubkey', pw); setKey(pw); setDraft(''); setFgOpen(false); setFgPw(''); setFgKey(''); setFgLogin('');
  };
  const login = () => loginWith(draft);
  // "Forgot password": MT5 account number + personal EA key -> a new random web password (shown once)
  const forgot = async () => {
    setLoginErr(''); setFgBusy(true);
    try {
      const r = await fetch('/api/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: fgLogin, eaKey: fgKey }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setLoginErr(j.error || tx('รีเซ็ตรหัสผ่านไม่สำเร็จ')); else { setFgPw(j.password); setFgKey(''); setFgCopied(false); }
    } catch { setLoginErr(tx('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')); }
    setFgBusy(false);
  };
  const ThemeBtn = () => <button className="btn" onClick={toggleTheme} aria-label={theme === 'dark' ? t('สลับเป็นโหมดกลางวัน', 'Switch to day mode') : t('สลับเป็นโหมดกลางคืน', 'Switch to night mode')}>{theme === 'dark' ? t('☀️ กลางวัน', '☀️ Day') : t('🌙 กลางคืน', '🌙 Night')}</button>;

  const api = useCallback(async (path: string, body?: any, method?: string) => {
    const r = await fetch(path, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', 'x-admin-key': key, ...(acct !== 'main' ? { 'x-acct': acct } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(r.status === 401 ? tx('รหัสผ่านไม่ถูกต้อง') : (await r.json().catch(() => null))?.error ?? 'เกิดข้อผิดพลาด ' + r.status);
    return r.json();
  }, [key, acct]);

  const load = useCallback(() => api('/api/state' + [autoVoice ? 'voice=1' : '', sel ? 'sym=' + encodeURIComponent(sel) : ''].filter(Boolean).map((x, i) => (i ? '&' : '?') + x).join('')).then((d) => {
    const first = firstLoad.current; firstLoad.current = false; // form drafts are filled from the server only on the first load of an account
    setData(d); setErr('');
    setProvider((p) => (first ? d.ai?.provider ?? d.settings.provider : p)); setModel((m) => (first ? d.ai?.model ?? d.settings.model ?? '' : m)); setIv((v) => (first ? d.ai?.intervalMin ?? d.settings.intervalMin ?? 15 : v)); setHold((v) => (first ? d.settings.holdSec ?? 15 : v)); setMapDraft((m) => (first ? d.settings.map || {} : m)); setGrid((g) => (first ? { profiles: d.settings.gridProfiles || {}, map: d.settings.gridMap || {} } : g));
  }).catch((e) => { if (e.message === tx('รหัสผ่านไม่ถูกต้อง')) { if (!resetting.current) logout(); } else setErr(e.message); }), [api, autoVoice, sel]);  // `data` must NOT be a dependency: every reply is a new object, so load would change on every reply and the effect below would fetch again at once = an endless request loop

  loadRef.current = load;
  autoVoiceRef.current = autoVoice;
  // Polling: every 5 s while voice alerts need it, otherwise every 10 s; nothing while the tab is hidden (unless voice alerts or the floating orb are on).
  // Each request costs Redis commands, so an idle background tab must not poll.
  useEffect(() => {
    if (!key) return;
    load();
    const t = setInterval(() => { if (pipRef.current) return; if (document.hidden && !autoVoice) return; load(); }, autoVoice ? 5000 : 10000);
    const vis = () => { if (!document.hidden && !pipRef.current) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [key, load, autoVoice]);

  const speak = (text: string) => {
    const done = () => { if (modeRef.current === 'speaking') setMode('idle'); };
    try {
      const u = new SpeechSynthesisUtterance(text); u.lang = 'th-TH'; u.onend = done; u.onerror = done;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch { done(); }
  };

  const ask = async (q: string) => {
    setHeard(q); setReply('กำลังคิด…'); setMode('speaking');
    try { const r = await api('/api/ai/chat', { message: q }); setReply(r.text); speak(r.text); }
    catch (e: any) { setReply(e.message); setMode('idle'); }
  };

  // Speak automatically when the market regime of a symbol changes (only for real EA analyses, not dashboard tests).
  useEffect(() => {
    const dd = data?.decision;
    if (!dd || !dd.regime) return;
    const sig = dd.symbol + '|' + dd.regime;
    const prev = lastSeen.current;
    lastSeen.current = sig;
    if (prev === null || prev === sig || dd.src !== 'ea' || !autoVoice || dd.confidence === 0 || modeRef.current !== 'idle') return;
    const text = `${dd.symbol} ตลาดเปลี่ยนเป็น${REGIME[dd.regime] ?? dd.regime} ` +
      (dd.kind === 'grid' ? `สลับไปใช้โปรไฟล์ ${dd.strategy} ` : dd.strategy_id === 'no_trade' ? 'ยังไม่เข้าเทรด ' : `AI เลือกกลยุทธ์ ${dd.strategy}${dd.pass ? ' และผ่านเงื่อนไขเข้าเทรด' : ' แต่ยังไม่ผ่านเงื่อนไข'} `) + (dd.reason || '');
    setHeard('(แจ้งเตือนอัตโนมัติ)'); setReply(text); setMode('speaking'); speak(text);
  }, [data, autoVoice]); // eslint-disable-line react-hooks/exhaustive-deps

  // News guard alerts: heads-up before the window, when new orders stop, and when trading resumes.
  const newsState = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    const n = data?.news; if (!n) return;
    const calc = (g: any): { st: string; text: string } => {
      const e = g.active ?? g.next, name = e ? `${e.cur === 'ALL' ? '' : e.cur + ' '}${e.title}` : '';
      if (g.active) return { st: 'on|' + e.cur + e.title + e.ts, text: `ตอนนี้เข้าช่วงข่าวแรง ${name} ระบบหยุดเปิดออเดอร์ใหม่ของ ${g.symbol} แล้ว จนถึงเวลา ${new Date(g.resumeAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` };
      const mins = g.next ? Math.round((g.next.ts - Date.now()) / 60000) : 0;
      if (g.next && mins - n.before <= 10) return { st: 'pre|' + e.cur + e.title + e.ts, text: `ข่าวแรง ${name} จะออกในอีก ${mins} นาที ระบบจะหยุดเปิดออเดอร์ใหม่ของ ${g.symbol} ในอีก ${Math.max(0, mins - n.before)} นาที` };
      return { st: 'idle', text: '' };
    };
    const prev = newsState.current;
    const next: Record<string, string> = {};
    let say = '';
    for (const g of n.groups as any[]) {
      const c = calc(g); next[g.symbol] = c.st;
      const p = prev?.[g.symbol];
      if (prev === null || prev === undefined || p === c.st) continue; // first load or nothing changed
      if (c.st.startsWith('on|') || c.st.startsWith('pre|')) say += c.text + '. ';
      else if (p?.startsWith('on|')) say += `ช่วงข่าวผ่านไปแล้ว ระบบกลับมาเปิดออเดอร์ใหม่ของ ${g.symbol} ตามปกติ. `;
    }
    if (say && autoVoice && modeRef.current !== 'idle') return; // busy: keep the old state so it is announced on the next refresh
    newsState.current = next;
    if (say && autoVoice) { setHeard('(แจ้งเตือนข่าว)'); setReply(say.trim()); setMode('speaking'); speak(say); }
  }, [data, autoVoice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read out a market summary for every new order (the server holds the order for a few seconds while this dashboard listens).
  const announced = useRef<Set<string> | null>(null);
  useEffect(() => {
    const cmds: any[] | undefined = data?.cmds; if (!cmds) return;
    if (announced.current === null) { announced.current = new Set(cmds.map((c) => c.id)); return; } // never read out old history
    const seen = announced.current;
    if (!autoVoice) { cmds.forEach((c) => seen.add(c.id)); return; }
    for (const c of cmds) if (!seen.has(c.id) && (c.status === 'blocked' || c.status === 'failed')) seen.add(c.id);
    if (modeRef.current !== 'idle') return; // busy: try again on the next refresh
    const c = [...cmds].reverse().find((x) => !seen.has(x.id) && (x.status === 'pending' || ((x.status === 'sent' || x.status === 'done') && Date.now() - x.ts < 90_000)));
    if (!c) return;
    seen.add(c.id);
    const text = orderSpeech(c);
    setHeard('(สรุปตลาดก่อนเปิดออเดอร์)'); setReply(text); setMode('speaking'); speak(text);
  }, [data, autoVoice]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAutoVoice = () => {
    const v = !autoVoice; setAutoVoice(v); localStorage.setItem('autovoice', v ? '1' : '0');
    if (v) openOrb(); else closeOrb();   // must run inside the click so the browser allows the popup
    if (v) { setReply('เปิดเสียงแจ้งเตือนอัตโนมัติแล้ว จะพูดเมื่อตลาดมีแนวโน้มใหม่'); speak('เปิดเสียงแจ้งเตือนอัตโนมัติแล้ว'); setMode('speaking'); }
  };

  const toggleMic = (from?: Window) => {
    if (modeRef.current !== 'idle') { try { recRef.current?.stop(); speechSynthesis.cancel(); } catch {} setMode('idle'); return; }
    const pick = (w: any) => w?.SpeechRecognition || w?.webkitSpeechRecognition;
    const start = (SR: any, canRetry: boolean) => {
      const r = new SR(); r.lang = 'th-TH';
      r.onresult = (e: any) => ask(e.results[0][0].transcript);
      r.onerror = (e: any) => {
        const mainSR = pick(window);
        if (canRetry && mainSR && mainSR !== SR && e?.error !== 'no-speech' && e?.error !== 'aborted') { start(mainSR, false); return; }
        setReply('ไม่ได้รับเสียงจากไมค์ ตรวจสอบสิทธิ์ไมโครโฟน'); setMode('idle');
      };
      r.onend = () => { if (modeRef.current === 'listening') setMode('idle'); };
      recRef.current = r; setMode('listening'); r.start();
    };
    // started from the popup -> use the popup window's recognizer first (it is the visible, focused window)
    const SR = pick(from) || pick(window);
    if (!SR) { setReply('เบราว์เซอร์นี้ไม่รองรับการฟังเสียง ใช้ปุ่มคำถามแทนได้'); return; }
    start(SR, !!from && SR !== pick(window));
  };
  toggleMicRef.current = toggleMic;

  const act = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); await load(); } catch (e: any) { setErr(e.message); } setBusy(false); };
  // A member resets their own web password: the server issues a new random one, shown once. The new password becomes this session's key right away.
  const resetMyPw = async () => {
    resetting.current = true; setBusy(true); setErr('');
    try {
      const r = await api('/api/me', { action: 'resetPassword', current: curPw });
      sessionStorage.setItem('hubkey', r.password); setKey(r.password); setMyNewPw(r.password); setPwCopied(false); setCurPw('');
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
    setTimeout(() => { resetting.current = false; }, 8000);
  };
  const d = data?.decision;
  const symRows: any[] = data?.symbols ?? [];
  const selRow = symRows.find((r) => r.key === (sel || data?.selSym)) ?? null;
  const ordSym = (mSym.trim() || selRow?.symbol || d?.symbol || '').toUpperCase();
  const symGrid: Record<string, any> = data?.settings?.symGrid ?? {};
  const gScopes = Array.from(new Set([...symRows.map((r) => r.key), ...Object.keys(symGrid)]));
  const gName = (k: string) => symRows.find((r) => r.key === k)?.symbol ?? k;
  const pickScope = (sc: string) => { const s = data?.settings; const o = sc ? symGrid[sc] : null; setGrid({ profiles: JSON.parse(JSON.stringify(o?.profiles ?? s.gridProfiles)), map: { ...(o?.map ?? s.gridMap) } }); setGscope(sc); };
  const ago = (ts: number) => { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 90 ? s + ' ' + tx('วิ') : s < 5400 ? Math.round(s / 60) + ' ' + tx('นาที') : Math.round(s / 3600) + ' ' + tx('ชม.'); };
  const isAdmin = data?.me?.role === 'admin';
  useEffect(() => { if (isAdmin) api('/api/users').then((r) => setUsers(r.users)).catch(() => {}); }, [isAdmin, api]);
  const userAct = (body: any) => act(async () => {
    const r = await api('/api/users', body);
    setUsers(r.users);
    if (r.password || r.eaKey) { setIssued({ name: r.name, password: r.password, eaKey: r.eaKey, login: r.login }); setCopied(false); }
    if (body.action === 'create') { setNewName(''); setNewLogin(''); }
  });
  const copyIssued = async () => {
    if (!issued) return;
    try { await navigator.clipboard.writeText(['MT5 Signal Hub', `ลิงก์เว็บ: ${location.origin}`, issued.password && `รหัสผ่านเข้าเว็บ: ${issued.password}`, issued.eaKey && '--- ตั้งค่าใน EA ---', issued.eaKey && `AI_Url: ${location.origin}`, issued.eaKey && `AI_EAKey: ${issued.eaKey}`, issued.login && `ใช้ได้กับบัญชี MT5 เลข ${issued.login} เท่านั้น`].filter(Boolean).join('\n')); setCopied(true); } catch { setErr(tx('คัดลอกไม่สำเร็จ ให้ลากคลุมข้อความแล้วคัดลอกเอง')); }
  };
  const paused = !!data?.settings?.paused;

  if (!key) {
    return (
      <Landing themeBtn={<ThemeBtn />}>
        <div className="card">
          <h2>{t("เข้าสู่ระบบ","Log in")}</h2>
          <label className="sub" htmlFor="k">{t("รหัสผ่าน (ผู้ดูแลหรือผู้ใช้ที่ได้รับรหัสจากผู้ดูแล)","Password (admin, or a user given a password by the admin)")}</label>
          <input id="k" type="password" autoComplete="current-password" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') login(); }} />
          {loginErr && <div className="err" role="alert">{loginErr}</div>}
          <button className="btn main" onClick={login}>{t("เข้าสู่ระบบ","Log in")}</button>
          <button className="btn" aria-expanded={fgOpen} onClick={() => { setFgOpen((v) => !v); setLoginErr(''); setFgPw(''); }}>{t("ลืมรหัสผ่าน?","Forgot password?")}</button>
          {fgOpen && (fgPw ? (
            <div className="bubble ai" role="status">
              <div className="mute">{t("รหัสผ่านใหม่ของคุณ (แสดงครั้งเดียว จดไว้ก่อนปิด) รหัสเดิมใช้ไม่ได้แล้ว","Your new password (shown once, write it down before closing). The old password no longer works.")}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 18, margin: '8px 0', wordBreak: 'break-all', userSelect: 'all' }}>{fgPw}</div>
              <div className="row">
                <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(fgPw); setFgCopied(true); } catch { setLoginErr(tx('คัดลอกไม่สำเร็จ ให้ลากคลุมข้อความแล้วคัดลอกเอง')); } }}>{fgCopied ? t(tx("คัดลอกแล้ว"),"Copied") : t(tx("คัดลอกรหัส"),"Copy")}</button>
                <button className="btn main" onClick={() => loginWith(fgPw)}>{t("เข้าสู่ระบบด้วยรหัสนี้","Log in with this password")}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <div className="mute">{t("ยืนยันตัวตนด้วยเลขบัญชี MT5 และ EA key ส่วนตัวของคุณ (ตัวเดียวกับที่ใส่ในช่อง ApiKey ของ EA) ระบบจะออกรหัสผ่านใหม่ที่สุ่มให้ ผู้ดูแลรีเซ็ตรหัสตัวเองไม่ได้ที่นี่ ถ้าไม่มี EA key แล้วให้ติดต่อผู้ดูแล","Verify with your MT5 account number and your personal EA key (the same one in the EA's ApiKey field). The system issues a new random password. Admins can't reset their own password here; if you no longer have the EA key, contact the admin.")}</div>
              <label className="sub" htmlFor="fgl">{t(tx("เลขบัญชี MT5"),"MT5 account number")}</label>
              <input id="fgl" inputMode="numeric" autoComplete="off" value={fgLogin} onChange={(e) => setFgLogin(e.target.value)} />
              <label className="sub" htmlFor="fgk">EA key</label>
              <input id="fgk" type="password" autoComplete="off" value={fgKey} onChange={(e) => setFgKey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && fgLogin.trim() && fgKey.trim() && !fgBusy) forgot(); }} />
              <button className="btn warn" disabled={fgBusy || !fgLogin.trim() || !fgKey.trim()} onClick={forgot}>{t("รีเซ็ตรหัสผ่าน","Reset password")}</button>
            </div>
          ))}
        </div>
      </Landing>
    );
  }

  return (
    <main className="shell">
      <div className="top">
        <div><h1>MT5 Signal Hub</h1><div className="sub">{t("AI เลือกกลยุทธ์ · เซิร์ฟเวอร์ตรวจเงื่อนไข · EA ส่งคำสั่ง","AI picks the strategy · server checks conditions · EA sends orders")}</div></div>
        <div className="row">
          <span className="mute">{data?.me ? `${data.me.name} (${isAdmin ? t("ผู้ดูแล","Admin") : t("ผู้ใช้","User")})` : ''}{!isAdmin && data?.account?.login ? ` · MT5 ${data.account.login}` : ''}</span>
          {isAdmin && data?.accounts?.length > 1 && (
            <select aria-label={tx("เลือกบัญชีเทรดที่ต้องการดู")} value={acct} onChange={(e) => { lastSeen.current = null; announced.current = null; newsState.current = null; setData(null); firstLoad.current = true; setAcct(e.target.value); }}>
              {data.accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}{a.login ? ` (${a.login})` : ''}</option>)}
            </select>
          )}
          <span className={'chip ' + (paused ? 'no' : 'ok')}>{paused ? t("ระบบหยุดอยู่","System paused") : t("ระบบทำงาน","System running")}</span>
          {isAdmin && <button className={'btn ' + (paused ? 'main' : 'warn')} disabled={busy} onClick={() => act(() => api('/api/settings', { paused: !paused }))}>
            {paused ? t("เปิดระบบ","Resume system") : t("หยุดส่งคำสั่งทั้งหมด","Pause all orders")}
          </button>}
          <LangBtn />
          <ThemeBtn />
          <button className="btn" onClick={logout}>{t("ออกจากระบบ","Log out")}</button>
        </div>
      </div>
      {err && <div className="err" role="alert">{err}</div>}

      <section className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
        <div className="orbbox"><div className={'orb-wrap ' + mode}>
          <div className="orb-glow" /><div className="orb-wave" /><div className="orb-wave w2" /><div className="orb-ring" /><div className="orb-core" />
        </div></div>
        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><h2>{tx("คุยกับ AI Strategist")}</h2>
            <div aria-live="polite" style={{ color: 'var(--accent)', fontSize: 14, marginTop: 4 }}>{mode === 'listening' ? tx('กำลังฟัง…') : mode === 'speaking' ? tx('กำลังตอบ…') : tx('พร้อมคุย · กดปุ่มเพื่อเริ่ม')}</div></div>
          <div className="bubble"><div className="mute">{tx("คุณ")}</div>{heard || (tx('ลองถามว่า') + ' "' + tx('ตอนนี้ใช้กลยุทธ์อะไร') + '"')}</div>
          <div className="bubble ai"><div className="mute">AI</div>{reply || 'AI จะตอบที่นี่'}</div>
          <div className="row">
            <button className="btn main" onClick={() => toggleMic()}>{mode === 'idle' ? tx('คุยกับ AI') : tx('หยุด')}</button>
            <button className="btn" onClick={() => ask('ตอนนี้ใช้กลยุทธ์อะไร')}>{tx("ตอนนี้ใช้กลยุทธ์อะไร")}</button>
            <button className="btn" onClick={() => ask('สรุปคำสั่งล่าสุด')}>{tx("สรุปคำสั่งล่าสุด")}</button>
            <button className="btn" onClick={() => ask('วิเคราะห์ตลาดตอนนี้')}>{tx("วิเคราะห์ตลาดตอนนี้")}</button>
            <button className="btn" onClick={() => ask('มีข่าวแรงอะไรใกล้นี้บ้าง')}>{tx("ข่าวแรงใกล้นี้")}</button>
            <button className={'btn ' + (autoVoice ? 'main' : '')} aria-pressed={autoVoice} onClick={toggleAutoVoice}>{autoVoice ? '🔔 เสียงแจ้งเตือน: เปิด' : '🔕 เสียงแจ้งเตือน: ปิด'}</button>
            <button className={'btn ' + (orb !== 'off' ? 'main' : '')} aria-pressed={orb !== 'off'} onClick={() => (orb === 'off' ? openOrb() : closeOrb())}>{orb === 'off' ? '🔮 เปิดลูกกลมลอย' : '🔮 ปิดลูกกลมลอย'}</button>
          </div>
        </div>
      </section>

      {data?.systems && (() => {
        const sy = data.systems, seen = sy.seen ?? {};
        const mode = sy.sg && sy.sr ? 'both' : sy.sr ? 'sr' : 'sg';
        const al = sy.allowed ?? { sg: true, sr: true };
        const can = (m: string) => (m === 'sg' ? al.sg : m === 'sr' ? al.sr : al.sg && al.sr);
        const set = (m: string) => act(() => api('/api/systems', { sg: m !== 'sr', sr: m !== 'sg' }));
        const dot = (ts: number | null) => (ts && Date.now() - ts < 3 * 60_000 ? tx('ออนไลน์ ·') + ' ' + ago(ts) + ' ' + tx('ที่แล้ว') : ts ? tx('เงียบ · ล่าสุด') + ' ' + ago(ts) + ' ' + tx('ที่แล้ว') : tx('ยังไม่เคยเชื่อมต่อ'));
        const ok = (ts: number | null) => !!ts && Date.now() - ts < 3 * 60_000;
        return (<section className="card" aria-label={tx("เลือกระบบเทรด")}>
          <h2>{tx("เลือกระบบเทรดที่ใช้")}</h2>
          <div className="row" role="group" aria-label={tx("เลือกระบบ")}>
            {([['sg', 'SmartGold Grid'], ['sr', 'SR Breakout'], ['both', tx('ใช้ทั้งสอง')]] as const).map(([m, label]) => (
              <button key={m} className={'btn ' + (mode === m ? 'main' : '')} aria-pressed={mode === m} disabled={busy || !can(m)} title={can(m) ? undefined : tx('ผู้ดูแลไม่ได้ให้สิทธิ์ระบบนี้')} onClick={() => mode !== m && set(m)}>{label}</button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}><table><thead><tr><th>{tx("ระบบ")}</th><th>{tx("สถานะสวิตช์")}</th><th>{tx("การเชื่อมต่อ EA")}</th></tr></thead><tbody>
            <tr><td><b>SmartGold Grid</b></td><td><span className={'chip ' + (sy.sg ? 'ok' : 'no')}>{!al.sg ? tx('ไม่ได้รับสิทธิ์') : sy.sg ? tx('เปิด') : tx('ปิด')}</span></td><td><span className={'chip ' + (ok(seen.sg) ? 'ok' : '')}>{dot(seen.sg)}</span></td></tr>
            <tr><td><b>SR Breakout</b></td><td><span className={'chip ' + (sy.sr ? 'ok' : 'no')}>{!al.sr ? tx('ไม่ได้รับสิทธิ์') : sy.sr ? tx('เปิด') : tx('ปิด')}</span></td><td><span className={'chip ' + (ok(seen.sr) ? 'ok' : '')}>{dot(seen.sr)}</span>{sy.srInfo?.symbol ? ` ${sy.srInfo.symbol}` : ''}{sy.srInfo?.pos != null ? ` · ไม้ที่เปิดอยู่ ${sy.srInfo.pos}` : ''}</td></tr>
          </tbody></table></div>
          <div className="mute">{tx("ระบบที่ปิดจะหยุดเปิดออเดอร์ใหม่ ส่วนออเดอร์ที่เปิดอยู่แล้วยังถูกดูแลและปิดตามปกติ EA อ่านสวิตช์ทุกไม่กี่วินาที (SmartGold) หรือทุก 30 วินาที (SR Breakout) ต้องมีอย่างน้อย 1 ระบบเปิดอยู่")}</div>
        </section>);
      })()}

      {data?.chart?.bars?.length > 1 && <ChartCard chart={data.chart} symbol={selRow?.symbol ?? d?.symbol ?? ''} tf={selRow?.tf ?? d?.tf ?? ''} regime={selRow?.regime ?? d?.regime} />}
      {!isAdmin && data && <section className="card">
        <h2>{tx("บัญชีของฉัน")}</h2>
        <div className="mute">{data.me?.name}{data.account?.login ? ` · บัญชี MT5 ${data.account.login}` : ''}</div>
        {myNewPw ? (
          <div className="bubble ai" role="status">
            <div className="mute">{tx("รหัสผ่านใหม่ของคุณ (แสดงครั้งเดียว จดไว้ก่อนปิด)")}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 18, margin: '8px 0', wordBreak: 'break-all', userSelect: 'all' }}>{myNewPw}</div>
            <div className="row">
              <button className="btn main" onClick={async () => { try { await navigator.clipboard.writeText(myNewPw); setPwCopied(true); } catch { setErr(tx('คัดลอกไม่สำเร็จ ให้ลากคลุมข้อความแล้วคัดลอกเอง')); } }}>{pwCopied ? tx('คัดลอกแล้ว') : tx('คัดลอกรหัส')}</button>
              <button className="btn" onClick={() => setMyNewPw('')}>{tx('ปิดหน้าต่าง')}</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <label className="sub" htmlFor="cpw">{tx("รหัสผ่านปัจจุบัน")}</label>
            <input id="cpw" type="password" autoComplete="current-password" value={curPw} onChange={(e) => setCurPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && curPw.trim() && !busy) resetMyPw(); }} />
            <button className="btn warn" disabled={busy || !curPw.trim()} onClick={resetMyPw}>{tx("รีเซ็ตรหัสผ่านของฉัน")}</button>
          </div>
        )}
        <div className="mute">{tx("ระบบออกรหัสใหม่ที่สุ่มให้ (ตั้งเองไม่ได้ เพื่อความปลอดภัย) รหัสเดิมใช้ไม่ได้ทันที และอุปกรณ์อื่นที่ล็อกอินอยู่จะถูกออกจากระบบ ถ้าลืมรหัสจนเข้าไม่ได้ ให้ติดต่อผู้ดูแลเพื่อรีเซ็ตให้")}</div>
      </section>}

      {data?.news && <NewsCard news={data.news} isAdmin={isAdmin} busy={busy} save={(b) => act(() => api('/api/settings', b))} />}

      {symRows.length > 0 && <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2>{tx("คู่เงินที่ EA ส่งมา (")}{symRows.length})</h2><span className="mute">{tx("กดแถวเพื่อดูกราฟและเลือกคู่สำหรับสั่งออเดอร์")}</span>{symRows.some((r) => Date.now() - r.ts > 30 * 60_000) && <button className="btn" disabled={busy} onClick={() => act(() => api('/api/symbols', { stale: true, minutes: 30 }, 'DELETE'))}>{tx("ลบคู่ที่เงียบเกิน 30 นาที")}</button>}</div>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>{tx("คู่เงิน")}</th><th>TF</th><th>{tx("แนวโน้ม")}</th><th>ADX</th><th>{tx("ที่มา")}</th><th>{tx("โปรไฟล์ / กลยุทธ์")}</th><th>{tx("มั่นใจ")}</th><th>{tx("อัปเดต")}</th><th></th></tr></thead><tbody>
          {symRows.map((r) => {
            const stale = Date.now() - r.ts > 5 * 60_000, on = r.key === (sel || data?.selSym);
            return (<tr key={r.key} tabIndex={0} role="button" aria-pressed={on} style={{ cursor: 'pointer', background: on ? 'var(--line)' : undefined, opacity: stale ? 0.55 : 1 }}
              onClick={() => { setSel(r.key); setMSym(r.symbol); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(r.key); setMSym(r.symbol); } }}>
              <td><b>{r.symbol}</b></td><td>{r.tf}</td>
              <td><span className={'chip ' + (r.regime === 'trend_up' ? 'ok' : r.regime === 'trend_down' ? 'no' : '')}>{r.regime === 'trend_up' ? '▲ ' : r.regime === 'trend_down' ? '▼ ' : ''}{REGIME[r.regime] ?? r.regime}</span></td>
              <td>{typeof r.adx === 'number' ? r.adx.toFixed(0) : '-'}</td><td>{r.src === 'ai' ? 'AI' : r.src === 'ea' ? tx('กติกา EA') : '-'}</td>
              <td>{r.profile ?? '-'}{r.hold ? ' (ค้างค่าเดิม)' : ''}</td><td>{Math.round((r.confidence ?? 0) * 100)}%</td>
              <td>{ago(r.ts)}{stale ? ' · EA เงียบ' : ''}</td>
              <td><button className="btn" disabled={busy} title={tx("ลบคู่นี้ออกจากรายการ (ถ้า EA ยังส่งอยู่ จะกลับมาเอง)")} onClick={(e) => { e.stopPropagation(); if (confirm(`ลบ ${r.symbol} ออกจากรายการ?\nถ้า EA ยังส่งคู่นี้อยู่ จะกลับมาในรอบถัดไป`)) act(() => api('/api/symbols', { key: r.key }, 'DELETE')); }}>{tx("ลบ")}</button></td></tr>);
          })}
        </tbody></table></div>
        {selRow && <div style={{ fontSize: 14, lineHeight: 1.6 }}><b>{selRow.symbol}</b>: {selRow.reason}</div>}
        {data?.scanAi?.summary && <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 6 }}><b>AI {tx("สรุปภาพรวม")}</b> <span className="mute">({ago(data.scanAi.ts)})</span>: {data.scanAi.summary}</div>}
        {data?.scanAi?.error && <div className="mute" style={{ marginTop: 6 }}>AI {tx("วิเคราะห์ชุดสแกนไม่สำเร็จ ตอนนี้แสดงผลจากกติกาของ EA:")} {data.scanAi.error}</div>}
      </section>}

      <section className="card">
        <h2>{tx("เปิดออเดอร์แรกเอง")}</h2>
        <div className="row">
          <label className="sub" htmlFor="msym">Symbol</label>
          <input id="msym" list="symlist" style={{ width: 130 }} value={mSym} placeholder={selRow?.symbol ?? d?.symbol ?? tx('เช่น XAUUSD')} onChange={(e) => { setMSym(e.target.value); const k = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); if (symRows.some((r) => r.key === k)) setSel(k); }} />
          <datalist id="symlist">{symRows.map((r) => <option key={r.key} value={r.symbol} />)}</datalist>
          {symRows.find((r) => r.key === ordSym.replace(/[^A-Z0-9]/g, '').slice(0, 6)) && (() => { const r = symRows.find((x) => x.key === ordSym.replace(/[^A-Z0-9]/g, '').slice(0, 6)); return <span className={'chip ' + (r.regime === 'trend_up' ? 'ok' : r.regime === 'trend_down' ? 'no' : '')}>{r.regime === 'trend_up' ? '▲ ' : r.regime === 'trend_down' ? '▼ ' : ''}{REGIME[r.regime] ?? r.regime}</span>; })()}
          <label className="sub" htmlFor="mlot">Lot</label>
          <input id="mlot" style={{ width: 80 }} inputMode="decimal" value={mLot} onChange={(e) => setMLot(e.target.value)} />
          {(['BUY', 'SELL'] as const).map((sd) => (
            <button key={sd} className={'btn ' + (sd === 'BUY' ? 'main' : '')} disabled={busy} onClick={() => {
              const sym = ordSym;
              if (!window.confirm(`ยืนยัน ${sd} ${sym || '(คู่ล่าสุดของ EA)'} ${mLot} ล็อต ส่งเข้า MT5 ทันที?`)) return;
              act(async () => { const r = await api('/api/orders', { side: sd, lot: Number(mLot), symbol: ordSym || undefined }); setMMsg(r.status === 'blocked' ? 'ถูกบล็อก: ' + (r.note ?? '') : `ส่งคำสั่ง ${sd} ${r.symbol} แล้ว รอ EA รับ (ไม่เกิน ~5 วินาที) ดูผลในตารางคำสั่ง`); });
            }}>{sd === 'BUY' ? 'BUY ซื้อ' : 'SELL ขาย'}</button>
          ))}
        </div>
        <div className="mute">{mMsg || tx('ส่งคำสั่งเข้า MT5 ผ่านคิวเดียวกับออเดอร์อื่น (ตรวจ lot สูงสุด ข่าว และหยุดชั่วคราวเหมือนกัน) ไม่ตั้ง SL/TP ให้กริดดูแลการปิดเอง')}</div>
      </section>

      <div className="grid">
        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}><h2>{tx("การตัดสินใจล่าสุดของ AI")}</h2><span className="mute">{d ? `${d.symbol} · ${d.tf} · ${new Date(d.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>
          {!d ? <div className="mute">{tx("ยังไม่มีข้อมูล รอ EA ส่งแท่งเทียน หรือกดทดสอบด้านล่าง")}</div> : (<>
            <div className="row"><span className="chip ok">{REGIME[d.regime] ?? d.regime}</span><b style={{ fontSize: 19 }}>{d.strategy}</b></div>
            <div><div className="bar"><i style={{ width: Math.round(d.confidence * 100) + '%' }} /></div><div className="mute" style={{ marginTop: 6 }}>{tx("ความมั่นใจ")} {Math.round(d.confidence * 100)}% · {d.provider ?? '-'} {d.model}</div></div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>{d.reason}</div>
            <div className="mute">{tx("กลยุทธ์ที่ดึงมาใช้กับสภาพตลาดนี้:")} {d.candidates?.length ? d.candidates.join(', ') : tx('ไม่มี (ไม่เทรด)')}</div>
            {d.eval && <div style={{ fontSize: 14, display: 'grid', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              {d.eval.results.map((r: any) => <div key={r.text} className="row" style={{ justifyContent: 'space-between' }}><span>{r.text}</span><span className={r.ok ? 'buy' : 'sell'}>{r.ok ? tx('ผ่าน') : tx('ไม่ผ่าน')}</span></div>)}
            </div>}
            {d.kind === 'grid' ? <span className="chip ok">{tx("โปรไฟล์กริดของ EA")}</span> : <span className={'chip ' + (d.pass ? 'ok' : 'no')}>{d.pass ? tx('ผ่านเงื่อนไข') : tx('ไม่เข้าเทรดรอบนี้')}</span>}
          </>)}
          <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <label className="sub" htmlFor="iv">{tx("ให้ AI วิเคราะห์ทุก")}</label>
            <select id="iv" value={iv} onChange={(e) => setIv(Number(e.target.value))}>
              {INTERVALS.map((m) => <option key={m} value={m}>{m >= 60 ? m / 60 + ' ชั่วโมง' : m + ' นาที'}</option>)}
            </select>
            <button className="btn main" disabled={busy} onClick={() => act(() => api('/api/aiconf', { intervalMin: iv }))}>{tx("บันทึก")}</button>
            <span className="mute">{tx("ตอนนี้:")} {data?.ai?.intervalMin ?? data?.settings?.intervalMin ?? 15} {tx("นาที")}{data?.ai?.own ? ' · ยิ่งถี่ยิ่งใช้ token ของคุณมากขึ้น' : ''}</span>
          </div>
          {isAdmin && <div className="row">
            <label className="sub" htmlFor="hold">{tx("หน่วงออเดอร์ก่อนส่งเข้า MT5 เพื่อพูดสรุปตลาด")}</label>
            <select id="hold" value={hold} onChange={(e) => setHold(Number(e.target.value))}>
              {HOLDS.map((m) => <option key={m} value={m}>{m ? m + ' วินาที' : tx('ไม่หน่วง')}</option>)}
            </select>
            <button className="btn main" disabled={busy} onClick={() => act(() => api('/api/settings', { holdSec: hold }))}>{tx("บันทึก")}</button>
            <span className="mute">{tx("ตอนนี้:")} {data?.settings?.holdSec ?? 15} {tx("วินาที (หน่วงเฉพาะตอนเปิดหน้านี้พร้อมเสียงแจ้งเตือนอยู่)")}</span>
          </div>}
          {isAdmin && <div className="row">
            <label className="sub" htmlFor="rsrc">{tx("แหล่งสภาพตลาด")}</label>
            <select id="rsrc" disabled={busy} value={data?.settings?.regimeSource ?? 'ai'} onChange={(e) => act(() => api('/api/settings', { regimeSource: e.target.value }))}>
              <option value="ai">AI {tx("วิเคราะห์เอง")}</option>
              <option value="tradingview">{tx("ดึงแนวโน้มจาก TradingView เอง (ไม่ต้องใช้ Pine / webhook)")}</option>
              <option value="chart">{tx("กราฟจาก EA คำนวณเอง (ไม่เรียก AI ไม่ต้องใช้ TradingView)")}</option>
              <option value="both">Webhook {tx("ก่อน ถ้าไม่มีใช้ AI")}</option>
              <option value="webhook">Webhook {tx("อย่างเดียว (ไม่เรียก AI)")}</option>
            </select>
            <span className="mute">{tx("ใช้กับ EA กริด ·")} "{tx("กราฟจาก EA")}" {tx("ใช้ ADX/EMA จากแท่งเทียนที่ EA ส่งมา (ต้องใช้ EA เวอร์ชันใหม่)")}</span>
          </div>}
          {isAdmin && <button className="btn" disabled={busy} onClick={() => act(() => api('/api/ai/decide', { ...SAMPLE, execute: false }))}>{tx("ทดสอบ AI ด้วยข้อมูลตัวอย่าง (ไม่ส่งคำสั่ง)")}</button>}
        </section>

        <section className="card">
          <h2>{tx("ผู้ให้บริการ AI")}{data?.ai?.own ? ' (ของคุณ)' : ''}</h2>
          {data?.ai?.own && <div className="mute">{tx("คุณใช้ API key ของตัวเอง ค่า token จะถูกเรียกเก็บจากบัญชีผู้ให้บริการ AI ของคุณโดยตรง ไม่ผ่านผู้ดูแล key เก็บแบบเข้ารหัสและไม่ถูกส่งกลับมาแสดง")}</div>}
          {data?.ai?.own && !Object.values(data.ai.keys ?? {}).some(Boolean) && <div className="err" role="alert">{tx("ยังไม่มี API key ของคุณ จึงยังใช้ AI ไม่ได้ (คุยกับ AI, วิเคราะห์ตลาด, ให้ AI จัดสภาพตลาด) เลือกผู้ให้บริการ ใส่ key แล้วกด")} "{tx("บันทึก API key")}"</div>}
          <div className="row">
            {PROVIDERS.map(([id, name]) => (
              <button key={id} className={'btn ' + (provider === id ? 'main' : '')} onClick={() => setProvider(id)}>
                {name}{data?.ai?.keys?.[id] ? '' : ' (ไม่มี key)'}
              </button>
            ))}
          </div>
          <label className="sub" htmlFor="m">{tx("ชื่อโมเดล (เว้นว่างเพื่อใช้ค่าเริ่มต้น)")}</label>
          <input id="m" value={model} onChange={(e) => setModel(e.target.value)} placeholder={tx("เช่น claude-sonnet-5-5")} />
          <button className="btn main" disabled={busy} onClick={() => act(() => api('/api/aiconf', { provider, model: model.trim() }))}>{tx("บันทึก")}</button>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'grid', gap: 8 }}>
            <label className="sub" htmlFor="ak">API key ของ {PROVIDERS.find(([id]) => id === provider)?.[1]}{data?.ai?.keyHints?.[provider] ? ` (ตอนนี้: ${data.ai.keyHints[provider]})` : ''}</label>
            <input id="ak" type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder={provider === 'anthropic' ? 'sk-ant-...' : provider === 'openai' ? 'sk-...' : 'AIza...'} />
            <div className="row">
              <button className="btn main" disabled={busy || !keyDraft.trim()} onClick={() => act(async () => { await api('/api/keys', { provider, key: keyDraft }); setKeyDraft(''); setSaved(tx('บันทึก key แล้ว')); setTimeout(() => setSaved(''), 3000); })}>{tx("บันทึก API key")}</button>
              {data?.ai?.keys?.[provider] && <button className="btn" disabled={busy} onClick={() => act(async () => { await api('/api/keys', { provider, key: '' }); setSaved(tx('ลบ key แล้ว')); setTimeout(() => setSaved(''), 3000); })}>{tx("ลบ key")}</button>}
              {saved && <span className="chip ok" role="status">{saved}</span>}
            </div>
          </div>
          <div className="mute">{tx("ถ้าเจ้าที่เลือกใช้ไม่ได้ ระบบจะลองเจ้าอื่นที่มี key ตามลำดับ และถ้าไม่ได้เลยจะไม่เทรด")}</div>
        </section>
      </div>

      {mapDraft && <section className="card">
        <h2>{tx("กลยุทธ์ตามสภาพตลาด")}</h2>
        <div className="mute">AI {tx("ระบุสภาพตลาดก่อน แล้วระบบดึงกลยุทธ์ที่ติ๊กไว้ในแต่ละสภาพมาตรวจเงื่อนไขเข้าเทรด ถ้าไม่ติ๊กอะไรเลย = ไม่เทรดในสภาพนั้น")}</div>
        {Object.keys(REGIME).map((rg) => (
          <fieldset key={rg} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', margin: 0 }}>
            <legend><b>{REGIME[rg]}</b> <span className="mute">· {REGIME_HINT[rg]}</span></legend>
            {(data?.strategies ?? []).map((st: any) => {
              const on = (mapDraft[rg] ?? []).includes(st.id);
              return (
                <label key={st.id} className="row" style={{ padding: '6px 0', cursor: isAdmin ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={on} disabled={!isAdmin}
                    onChange={() => setMapDraft((m) => { const cur = (m ?? {})[rg] ?? []; return { ...(m ?? {}), [rg]: on ? cur.filter((x) => x !== st.id) : [...cur, st.id] }; })} />
                  <span><b>{st.name}</b> <span className="mute">{st.conds.join(' · ')}</span></span>
                </label>
              );
            })}
          </fieldset>
        ))}
        {isAdmin && <div className="row"><button className="btn main" disabled={busy} onClick={() => act(() => api('/api/settings', { map: mapDraft }))}>{tx("บันทึกกลยุทธ์")}</button></div>}
      </section>}

      {grid && <section className="card">
        <h2>{tx("โปรไฟล์กริดสำหรับ EA กริด")}</h2>
        <div className="mute">AI {tx("ระบุสภาพตลาด แล้ว EA กริด (Terravolteco SmartGold) จะดึงโปรไฟล์ของสภาพนั้นไปตั้งค่าตัวเองอัตโนมัติ ค่าถูกจำกัดเพดานทั้งฝั่งเซิร์ฟเวอร์และใน EA โปรไฟล์ที่ปิดทั้ง Buy/Sell = หยุดเปิดชุดใหม่ (ชุดที่เปิดอยู่ยังจัดการต่อ โดย Max ไม้ที่ต่ำจะหยุดการถัวเพิ่ม)")}</div>
        <div className="row">
          <label className="sub" htmlFor="gscope" style={{ minWidth: 130 }}>{tx("ตั้งค่าสำหรับ")}</label>
          <select id="gscope" value={gscope} onChange={(e) => pickScope(e.target.value)}>
            <option value="">{tx("ทุกคู่ (ค่าร่วม)")}</option>
            {gScopes.map((k) => <option key={k} value={k}>{gName(k)}{symGrid[k] ? ' ★ ตั้งเฉพาะแล้ว' : ' (ใช้ค่าร่วมอยู่)'}</option>)}
          </select>
          {gscope && <span className="mute">{symGrid[gscope] ? `${gName(gscope)} ใช้ชุดของตัวเอง` : `${gName(gscope)} ยังใช้ค่าร่วม แก้แล้วกดบันทึกเพื่อแยกเป็นของคู่นี้`}</span>}
        </div>
        {Object.keys(REGIME).map((rg) => (
          <div key={rg} className="row">
            <label className="sub" htmlFor={'g-' + rg} style={{ minWidth: 130 }}>{REGIME[rg]}</label>
            <select id={'g-' + rg} disabled={!isAdmin} value={grid.map[rg] ?? ''} onChange={(e) => setGrid((g) => g && { ...g, map: { ...g.map, [rg]: e.target.value } })}>
              {Object.values(grid.profiles).map((pf: any) => <option key={pf.id} value={pf.id}>{pf.name}</option>)}
            </select>
          </div>
        ))}
        <div className="tblwrap"><table>
          <thead><tr><th>{tx("โปรไฟล์")}</th><th>Buy</th><th>Sell</th>{GRID_COLS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>
            {Object.values(grid.profiles).map((pf: any) => (
              <tr key={pf.id}>
                <td>{pf.name}</td>
                {(['buy', 'sell'] as const).map((k) => (
                  <td key={k}><input type="checkbox" aria-label={pf.name + ' ' + k} disabled={!isAdmin} checked={!!pf[k]} onChange={() => setGrid((g) => g && { ...g, profiles: { ...g.profiles, [pf.id]: { ...pf, [k]: !pf[k] } } })} /></td>
                ))}
                {GRID_COLS.map(([k, label, st]) => (
                  <td key={k}><input type="number" aria-label={pf.name + ' ' + label} style={{ width: 82 }} step={st} disabled={!isAdmin} value={pf[k]}
                    onChange={(e) => setGrid((g) => g && { ...g, profiles: { ...g.profiles, [pf.id]: { ...pf, [k]: Number(e.target.value) } } })} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table></div>
        {isAdmin && <div className="row"><button className="btn main" disabled={busy} onClick={() => act(() => api('/api/settings', gscope ? { symGrid: { ...symGrid, [gscope]: { profiles: grid.profiles, map: grid.map } } } : { gridProfiles: grid.profiles, gridMap: grid.map }))}>{gscope ? `บันทึกให้ ${gName(gscope)}` : tx('บันทึกโปรไฟล์กริด (ค่าร่วม)')}</button>
          {gscope && symGrid[gscope] && <button className="btn" disabled={busy} onClick={() => { if (!window.confirm(`ลบชุดเฉพาะของ ${gName(gscope)} แล้วกลับไปใช้ค่าร่วม?`)) return; const rest = { ...symGrid }; delete rest[gscope]; act(async () => { await api('/api/settings', { symGrid: rest }); pickScope(''); }); }}>{tx("ลบชุดเฉพาะ ใช้ค่าร่วม")}</button>}
        </div>}
      </section>}

      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{tx("คิวคำสั่งส่งเข้า EA")}</h2>
          <button className="btn" disabled={busy} onClick={() => { if (!window.confirm(tx('ล้างประวัติคำสั่งที่เสร็จ/ล้มเหลว/ถูกบล็อกทั้งหมด? (คำสั่งที่ยังรอส่งหรือกำลังส่งจะไม่ถูกลบ)'))) return; act(async () => { const r = await api('/api/orders', undefined, 'DELETE'); setMMsg(`ล้างประวัติแล้ว ${r.removed} รายการ`); }); }}>🗑 ล้างประวัติ</button>
        </div>
        <div className="tblwrap"><table>
          <thead><tr><th>{tx("เวลา")}</th><th>Symbol</th><th>{tx("ทิศทาง")}</th><th>{tx("ล็อต")}</th><th>{tx("ที่มา")}</th><th>{tx("สถานะ")}</th></tr></thead>
          <tbody>
            {(data?.cmds ?? []).map((c: any) => (
              <tr key={c.id}>
                <td>{new Date(c.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{c.symbol}</td><td className={c.side === 'BUY' ? 'buy' : 'sell'}>{c.side}</td><td>{c.lot}</td>
                <td>{c.source === 'ai' ? 'AI' : c.source === 'manual' ? tx('สั่งเอง') : c.source === 'snipe' ? tx('สไนเปอร์') : 'Webhook'}</td>
                <td>{STATUS[c.status]}{c.note ? <div className="mute">{c.note}</div> : null}</td>
              </tr>
            ))}
            {!data?.cmds?.length && <tr><td colSpan={6} className="mute">{tx("ยังไม่มีคำสั่ง ส่ง webhook ทดสอบตามคู่มือใน README")}</td></tr>}
          </tbody>
        </table></div>
      </section>

      {isAdmin && <section className="card">
        <h2>{tx("ผู้ใช้งาน")}</h2>
        <div className="mute">{tx("ผู้ใช้ 1 คน = บัญชีเทรด MT5 1 บัญชี = EA 1 ตัว ระบบสร้างให้ 2 อย่าง คือ รหัสผ่านเข้าเว็บ และ EA key (ใส่ที่ช่อง AI_EAKey ใน EA) EA key ใช้ได้กับเลขบัญชีที่ผูกไว้เท่านั้น ออเดอร์ ประวัติ และการวิเคราะห์ของแต่ละคนแยกกัน ผู้ใช้เห็นเฉพาะบัญชีของตัวเอง ทั้งสองรหัสแสดงครั้งเดียว (ถ้าหายให้กดรีเซ็ต)")}</div>
        <div className="row">
          <label className="sub" htmlFor="nu">{tx("ชื่อผู้ใช้")}</label>
          <input id="nu" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder={tx("เช่น สมชาย")} />
          <label className="sub" htmlFor="nl">{tx("เลขบัญชี MT5")}</label>
          <input id="nl" inputMode="numeric" value={newLogin} maxLength={12} onChange={(e) => setNewLogin(e.target.value.replace(/\D/g, ''))} placeholder={tx("เช่น 3030514")} />
          <button className="btn main" disabled={busy || !newName.trim() || newLogin.length < 4} onClick={() => userAct({ action: 'create', name: newName, login: newLogin })}>{tx("สร้างบัญชีผู้ใช้")}</button>
        </div>
        {issued && <div className="bubble ai" role="status">
          <div className="mute">{tx("ข้อมูลของ")} {issued.name}{issued.login ? ` (MT5 ${issued.login})` : ''} {tx("แสดงครั้งเดียว")}</div>
          {issued.password && <><div className="mute">{tx("รหัสผ่านเข้าเว็บ")}</div><div style={{ fontFamily: 'monospace', fontSize: 18, margin: '4px 0 8px', wordBreak: 'break-all', userSelect: 'all' }}>{issued.password}</div></>}
          {issued.eaKey && <><div className="mute">EA key (ใส่ที่ AI_EAKey ใน EA)</div><div style={{ fontFamily: 'monospace', fontSize: 16, margin: '4px 0 8px', wordBreak: 'break-all', userSelect: 'all' }}>{issued.eaKey}</div></>}
          <div className="row"><button className="btn main" onClick={copyIssued}>{copied ? tx('คัดลอกแล้ว') : tx('คัดลอกข้อความส่งให้ผู้ใช้')}</button><button className="btn" onClick={() => setIssued(null)}>{tx('ปิดหน้าต่าง')}</button></div>
        </div>}
        <div className="tblwrap"><table>
          <thead><tr><th>{tx("ชื่อ")}</th><th>{tx("บัญชี MT5")}</th><th>{tx("สิทธิ์ใช้ระบบ")}</th><th>EA ส่งข้อมูลล่าสุด</th><th>AI key ของเขา</th><th>{tx("เข้าเว็บล่าสุด")}</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.login || <span className="mute">{tx("ยังไม่ผูก")}</span>}</td>
                <td><select aria-label={`สิทธิ์ใช้ระบบของ ${u.name}`} disabled={busy} value={u.systems?.sg === false ? 'sr' : u.systems?.sr === false ? 'sg' : 'both'} onChange={(e) => userAct({ action: 'systems', id: u.id, sg: e.target.value !== 'sr', sr: e.target.value !== 'sg' })}><option value="both">{tx("ทั้งสองระบบ")}</option><option value="sg">SmartGold เท่านั้น</option><option value="sr">SR Breakout เท่านั้น</option></select></td>
                <td>{u.eaSeen ? new Date(u.eaSeen).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                <td>{u.aiKey ? <span className="chip ok">{tx("ใส่แล้ว")}</span> : <span className="mute">{tx("ยังไม่ใส่")}</span>}</td>
                <td>{u.lastSeen ? new Date(u.lastSeen).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                <td><div className="row">
                  <button className="btn" disabled={busy} onClick={() => userAct({ action: 'reset', id: u.id })}>{tx("รีเซ็ตรหัสเว็บ")}</button>
                  {u.login && <button className="btn" disabled={busy} onClick={() => { if (confirm(`สร้าง EA key ใหม่ให้ ${u.name}? key เดิมจะใช้ไม่ได้ทันที`)) userAct({ action: 'resetKey', id: u.id }); }}>{tx("รีเซ็ต EA key")}</button>}
                  <button className="btn" disabled={busy} onClick={() => { const l = (prompt(`เลขบัญชี MT5 ของ ${u.name}`, u.login || '') || '').replace(/\D/g, ''); if (l.length >= 4) userAct({ action: 'bind', id: u.id, login: l }); }}>{u.login ? tx('เปลี่ยนเลขบัญชี') : tx('ผูกบัญชี')}</button>
                  <button className="btn warn" disabled={busy} onClick={() => { if (confirm(`ลบผู้ใช้ ${u.name}?`)) userAct({ action: 'delete', id: u.id }); }}>{tx("ลบ")}</button>
                </div></td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={7} className="mute">{tx("ยังไม่มีผู้ใช้")}</td></tr>}
          </tbody>
        </table></div>
      </section>}
      {orb === 'page' && <FloatOrb mode={mode} onTap={() => toggleMic()} onClose={closeOrb} />}
    </main>
  );
}

// Fallback orb for browsers without Document Picture-in-Picture: drag it anywhere inside this page, tap it to talk.
function FloatOrb({ mode, onTap, onClose }: { mode: Mode; onTap: () => void; onClose: () => void }) {
  const SIZE = 100;
  const clamp = (p: { x: number; y: number }) => ({ x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - SIZE)), y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - SIZE)) });
  const [pos, setPos] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem('orbpos') || 'null'); if (p && typeof p.x === 'number' && typeof p.y === 'number') return clamp(p); } catch {}
    return clamp({ x: window.innerWidth - SIZE - 28, y: window.innerHeight - SIZE - 48 });
  });
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean; last: { x: number; y: number } } | null>(null);
  useEffect(() => { const f = () => setPos((p) => clamp(p)); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const down = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, moved: false, last: pos }; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true; d.last = clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }); setPos(d.last);
  };
  const up = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    if (d.moved) { try { localStorage.setItem('orbpos', JSON.stringify(d.last)); } catch {} } else onTap();
  };
  return (
    <div className="orb-float" style={{ left: pos.x, top: pos.y }} role="button" tabIndex={0} aria-label={tx("ลูกกลม AI: แตะเพื่อคุย ลากเพื่อย้าย")}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } }}>
      <div className={'orb-wrap ' + mode}><div className="orb-glow" /><div className="orb-wave" /><div className="orb-wave w2" /><div className="orb-ring" /><div className="orb-core" /></div>
      <button className="orb-x" aria-label="ปิดลูกกลมลอย" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>×</button>
    </div>
  );
}

// Spoken market summary for an order, built from the analysis stored with the order (no AI call, so it is instant and never invents numbers).
function orderSpeech(c: any): string {
  const m = c.mkt, i = m?.ind, n = (v: any) => Number(Number(v).toFixed(2));
  const head = c.status === 'pending' ? 'ก่อนเปิดออเดอร์ ' : 'เปิดออเดอร์แล้ว ';
  const order = `${c.side === 'BUY' ? 'ซื้อ' : 'ขาย'} ${c.symbol} ${c.lot} ล็อต${c.source === 'webhook' ? ' ตามสัญญาณ TradingView' : c.source === 'manual' ? ' ตามที่คุณสั่งเอง' : c.source === 'snipe' ? ' แบบสไนเปอร์ ตามแนวรับ/ต้านจาก EA' : ' ตามการวิเคราะห์ของ AI'}`;
  let mk = ' ยังไม่มีข้อมูลวิเคราะห์ตลาดล่าสุดของคู่นี้ประกอบสัญญาณ';
  if (m) {
    const rsi = i ? (i.rsi >= 70 ? ' RSI สูง เริ่มซื้อมากเกินไป' : i.rsi <= 30 ? ' RSI ต่ำ เริ่มขายมากเกินไป' : ` RSI ${Math.round(i.rsi)}`) : '';
    mk = ` สรุปตลาด สภาพตลาด${REGIME[m.regime] ?? m.regime}` + (i ? ` ADX ${Math.round(i.adx)} ${i.ema20 > i.ema50 ? 'EMA20 อยู่เหนือ EMA50' : 'EMA20 อยู่ใต้ EMA50'}${rsi}` : '') + (m.strategy ? ` กลยุทธ์ ${m.strategy}` : '') + (m.reason ? ` ${m.reason}` : '');
  }
  const risk = (c.sl ? ` ตัดขาดทุนที่ ${n(c.sl)}` : ' ไม่ได้ตั้งจุดตัดขาดทุน') + (c.tp ? ` เป้าหมายที่ ${n(c.tp)}` : '');
  return head + order + '.' + mk + '.' + risk;
}
