'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const SAMPLE = { symbol: 'XAUUSD', tf: 'M15', price: 2411.9, adx: 31, rsi: 58, atr: 4.2, ema20: 2412.5, ema50: 2405.1 };
const STATUS: Record<string, string> = { pending: 'รอ EA รับ', sent: 'ส่งให้ EA แล้ว', done: 'เข้าออเดอร์แล้ว', failed: 'ไม่สำเร็จ', blocked: 'ถูก Risk บล็อก' };
const PROVIDERS = [['anthropic', 'Claude'], ['openai', 'GPT'], ['google', 'Gemini']];
const REGIME: Record<string, string> = { trend_up: 'แนวโน้มขาขึ้น', trend_down: 'แนวโน้มขาลง', range: 'ไซด์เวย์', volatile: 'ผันผวน', news: 'ช่วงข่าว' };
const REGIME_HINT: Record<string, string> = {
  trend_up: 'ADX สูง และ EMA20 อยู่เหนือ EMA50', trend_down: 'ADX สูง และ EMA20 อยู่ใต้ EMA50',
  range: 'ADX ต่ำ ราคาแกว่งในกรอบ', volatile: 'ผันผวนผิดปกติ ไม่มีทิศทางชัด', news: 'ช่วงข่าวแรง',
};
const GRID_COLS: [string, string, number][] = [['lot', 'Lot เริ่ม', 0.01], ['lotMult', 'Lot x', 0.1], ['step', 'Step (pts)', 50], ['stepW', 'Step W', 0.1], ['stepA', 'Step A', 0.1], ['max', 'Max ไม้', 1], ['tpN', 'TP ปกติ $', 0.5], ['tpO', 'TP เก่า $', 0.5], ['recMult', 'Rec x', 0.1]];
const INTERVALS = [1, 3, 5, 10, 15, 30, 60, 120];
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
  const [loginErr, setLoginErr] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [iv, setIv] = useState(15);
  const [grid, setGrid] = useState<{ profiles: Record<string, any>; map: Record<string, string> } | null>(null);
  const [mapDraft, setMapDraft] = useState<Record<string, string[]> | null>(null);
  const [autoVoice, setAutoVoice] = useState(false);
  const lastSeen = useRef<string | null>(null);
  const modeRef = useRef<Mode>('idle');
  const recRef = useRef<any>(null);
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };

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
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t); document.documentElement.dataset.theme = t;
    try { localStorage.setItem('theme', t); } catch {}
  };
  const logout = () => { sessionStorage.removeItem('hubkey'); setKey(''); setData(null); setUsers([]); setIssued(null); lastSeen.current = null; };
  const login = async () => {
    setLoginErr('');
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: draft }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setLoginErr(j.error || 'เข้าสู่ระบบไม่สำเร็จ'); return; }
    const pw = draft.trim(); sessionStorage.setItem('hubkey', pw); setKey(pw); setDraft('');
  };
  const ThemeBtn = () => <button className="btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'สลับเป็นโหมดกลางวัน' : 'สลับเป็นโหมดกลางคืน'}>{theme === 'dark' ? '☀️ กลางวัน' : '🌙 กลางคืน'}</button>;

  const api = useCallback(async (path: string, body?: any) => {
    const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-admin-key': key }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(r.status === 401 ? 'รหัสผ่านไม่ถูกต้อง' : 'เกิดข้อผิดพลาด ' + r.status);
    return r.json();
  }, [key]);

  const load = useCallback(() => api('/api/state').then((d) => {
    setData(d); setErr('');
    setProvider((p) => (data ? p : d.settings.provider)); setModel((m) => (data ? m : d.settings.model || '')); setIv((v) => (data ? v : d.settings.intervalMin || 15)); setMapDraft((m) => (data ? m : d.settings.map || {})); setGrid((g) => (data ? g : { profiles: d.settings.gridProfiles || {}, map: d.settings.gridMap || {} }));
  }).catch((e) => { if (e.message === 'รหัสผ่านไม่ถูกต้อง') logout(); else setErr(e.message); }), [api, data]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!key) return; load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [key, load]);

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

  const toggleAutoVoice = () => {
    const v = !autoVoice; setAutoVoice(v); localStorage.setItem('autovoice', v ? '1' : '0');
    if (v) { setReply('เปิดเสียงแจ้งเตือนอัตโนมัติแล้ว จะพูดเมื่อตลาดมีแนวโน้มใหม่'); speak('เปิดเสียงแจ้งเตือนอัตโนมัติแล้ว'); setMode('speaking'); }
  };

  const toggleMic = () => {
    if (modeRef.current !== 'idle') { try { recRef.current?.stop(); speechSynthesis.cancel(); } catch {} setMode('idle'); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setReply('เบราว์เซอร์นี้ไม่รองรับการฟังเสียง ใช้ปุ่มคำถามแทนได้'); return; }
    const r = new SR(); r.lang = 'th-TH';
    r.onresult = (e: any) => ask(e.results[0][0].transcript);
    r.onerror = () => { setReply('ไม่ได้รับเสียงจากไมค์ ตรวจสอบสิทธิ์ไมโครโฟน'); setMode('idle'); };
    r.onend = () => { if (modeRef.current === 'listening') setMode('idle'); };
    recRef.current = r; setMode('listening'); r.start();
  };

  const act = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); await load(); } catch (e: any) { setErr(e.message); } setBusy(false); };
  const d = data?.decision;
  const isAdmin = data?.me?.role === 'admin';
  useEffect(() => { if (isAdmin) api('/api/users').then((r) => setUsers(r.users)).catch(() => {}); }, [isAdmin, api]);
  const userAct = (body: any) => act(async () => {
    const r = await api('/api/users', body);
    setUsers(r.users);
    if (r.password) { setIssued({ name: r.name, password: r.password }); setCopied(false); }
    if (body.action === 'create') setNewName('');
  });
  const copyIssued = async () => {
    if (!issued) return;
    try { await navigator.clipboard.writeText(`MT5 Signal Hub\nลิงก์: ${location.origin}\nรหัสผ่าน: ${issued.password}`); setCopied(true); } catch { setErr('คัดลอกไม่สำเร็จ ให้ลากคลุมข้อความแล้วคัดลอกเอง'); }
  };
  const paused = !!data?.settings?.paused;

  if (!key) {
    return (
      <main className="shell" style={{ maxWidth: 420, marginTop: 80 }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}><h1>MT5 Signal Hub</h1><ThemeBtn /></div>
          <label className="sub" htmlFor="k">รหัสผ่าน (ผู้ดูแลหรือผู้ใช้ที่ได้รับรหัสจากผู้ดูแล)</label>
          <input id="k" type="password" autoComplete="current-password" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') login(); }} />
          {loginErr && <div className="err" role="alert">{loginErr}</div>}
          <button className="btn main" onClick={login}>เข้าสู่ระบบ</button>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="top">
        <div><h1>MT5 Signal Hub</h1><div className="sub">AI เลือกกลยุทธ์ · เซิร์ฟเวอร์ตรวจเงื่อนไข · EA ส่งคำสั่ง</div></div>
        <div className="row">
          <span className="mute">{data?.me ? `${data.me.name} (${isAdmin ? 'ผู้ดูแล' : 'ผู้ใช้'})` : ''}</span>
          <span className={'chip ' + (paused ? 'no' : 'ok')}>{paused ? 'ระบบหยุดอยู่' : 'ระบบทำงาน'}</span>
          {isAdmin && <button className={'btn ' + (paused ? 'main' : 'warn')} disabled={busy} onClick={() => act(() => api('/api/settings', { paused: !paused }))}>
            {paused ? 'เปิดระบบ' : 'หยุดส่งคำสั่งทั้งหมด'}
          </button>}
          <ThemeBtn />
          <button className="btn" onClick={logout}>ออกจากระบบ</button>
        </div>
      </div>
      {err && <div className="err" role="alert">{err}</div>}

      <section className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
        <div className="orbbox"><div className={'orb-wrap ' + mode}>
          <div className="orb-glow" /><div className="orb-wave" /><div className="orb-wave w2" /><div className="orb-ring" /><div className="orb-core" />
        </div></div>
        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><h2>คุยกับ AI Strategist</h2>
            <div aria-live="polite" style={{ color: 'var(--accent)', fontSize: 14, marginTop: 4 }}>{mode === 'listening' ? 'กำลังฟัง…' : mode === 'speaking' ? 'กำลังตอบ…' : 'พร้อมคุย · กดปุ่มเพื่อเริ่ม'}</div></div>
          <div className="bubble"><div className="mute">คุณ</div>{heard || 'ลองถามว่า "ตอนนี้ใช้กลยุทธ์อะไร"'}</div>
          <div className="bubble ai"><div className="mute">AI</div>{reply || 'AI จะตอบที่นี่'}</div>
          <div className="row">
            <button className="btn main" onClick={toggleMic}>{mode === 'idle' ? 'คุยกับ AI' : 'หยุด'}</button>
            <button className="btn" onClick={() => ask('ตอนนี้ใช้กลยุทธ์อะไร')}>ตอนนี้ใช้กลยุทธ์อะไร</button>
            <button className="btn" onClick={() => ask('สรุปคำสั่งล่าสุด')}>สรุปคำสั่งล่าสุด</button>
            <button className={'btn ' + (autoVoice ? 'main' : '')} aria-pressed={autoVoice} onClick={toggleAutoVoice}>{autoVoice ? '🔔 เสียงแจ้งเตือน: เปิด' : '🔕 เสียงแจ้งเตือน: ปิด'}</button>
          </div>
        </div>
      </section>

      <div className="grid">
        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}><h2>การตัดสินใจล่าสุดของ AI</h2><span className="mute">{d ? `${d.symbol} · ${d.tf} · ${new Date(d.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>
          {!d ? <div className="mute">ยังไม่มีข้อมูล รอ EA ส่งแท่งเทียน หรือกดทดสอบด้านล่าง</div> : (<>
            <div className="row"><span className="chip ok">{REGIME[d.regime] ?? d.regime}</span><b style={{ fontSize: 19 }}>{d.strategy}</b></div>
            <div><div className="bar"><i style={{ width: Math.round(d.confidence * 100) + '%' }} /></div><div className="mute" style={{ marginTop: 6 }}>ความมั่นใจ {Math.round(d.confidence * 100)}% · {d.provider ?? '-'} {d.model}</div></div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>{d.reason}</div>
            <div className="mute">กลยุทธ์ที่ดึงมาใช้กับสภาพตลาดนี้: {d.candidates?.length ? d.candidates.join(', ') : 'ไม่มี (ไม่เทรด)'}</div>
            {d.eval && <div style={{ fontSize: 14, display: 'grid', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              {d.eval.results.map((r: any) => <div key={r.text} className="row" style={{ justifyContent: 'space-between' }}><span>{r.text}</span><span className={r.ok ? 'buy' : 'sell'}>{r.ok ? 'ผ่าน' : 'ไม่ผ่าน'}</span></div>)}
            </div>}
            {d.kind === 'grid' ? <span className="chip ok">โปรไฟล์กริดของ EA</span> : <span className={'chip ' + (d.pass ? 'ok' : 'no')}>{d.pass ? 'ผ่านเงื่อนไข' : 'ไม่เข้าเทรดรอบนี้'}</span>}
          </>)}
          {isAdmin && <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <label className="sub" htmlFor="iv">ให้ AI วิเคราะห์ทุก</label>
            <select id="iv" value={iv} onChange={(e) => setIv(Number(e.target.value))}>
              {INTERVALS.map((m) => <option key={m} value={m}>{m >= 60 ? m / 60 + ' ชั่วโมง' : m + ' นาที'}</option>)}
            </select>
            <button className="btn main" disabled={busy} onClick={() => act(() => api('/api/settings', { intervalMin: iv }))}>บันทึก</button>
            <span className="mute">ตอนนี้: {data?.settings?.intervalMin ?? 15} นาที</span>
          </div>}
          {!isAdmin && <div className="mute">AI วิเคราะห์ทุก {data?.settings?.intervalMin ?? 15} นาที</div>}
          {isAdmin && <button className="btn" disabled={busy} onClick={() => act(() => api('/api/ai/decide', { ...SAMPLE, execute: false }))}>ทดสอบ AI ด้วยข้อมูลตัวอย่าง (ไม่ส่งคำสั่ง)</button>}
        </section>

        {isAdmin && <section className="card">
          <h2>ผู้ให้บริการ AI</h2>
          <div className="row">
            {PROVIDERS.map(([id, name]) => (
              <button key={id} className={'btn ' + (provider === id ? 'main' : '')} onClick={() => setProvider(id)}>
                {name}{data?.keys?.[id] ? '' : ' (ไม่มี key)'}
              </button>
            ))}
          </div>
          <label className="sub" htmlFor="m">ชื่อโมเดล (เว้นว่างเพื่อใช้ค่าเริ่มต้น)</label>
          <input id="m" value={model} onChange={(e) => setModel(e.target.value)} placeholder="เช่น claude-sonnet-5-5" />
          <button className="btn main" disabled={busy} onClick={() => act(() => api('/api/settings', { provider, model }))}>บันทึก</button>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'grid', gap: 8 }}>
            <label className="sub" htmlFor="ak">API key ของ {PROVIDERS.find(([id]) => id === provider)?.[1]}{data?.keyHints?.[provider] ? ` (ตอนนี้: ${data.keyHints[provider]})` : ''}</label>
            <input id="ak" type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder={provider === 'anthropic' ? 'sk-ant-...' : provider === 'openai' ? 'sk-...' : 'AIza...'} />
            <div className="row">
              <button className="btn main" disabled={busy || !keyDraft.trim()} onClick={() => act(async () => { await api('/api/keys', { provider, key: keyDraft }); setKeyDraft(''); setSaved('บันทึก key แล้ว'); setTimeout(() => setSaved(''), 3000); })}>บันทึก API key</button>
              {data?.keys?.[provider] && <button className="btn" disabled={busy} onClick={() => act(async () => { await api('/api/keys', { provider, key: '' }); setSaved('ลบ key แล้ว'); setTimeout(() => setSaved(''), 3000); })}>ลบ key</button>}
              {saved && <span className="chip ok" role="status">{saved}</span>}
            </div>
          </div>
          <div className="mute">ถ้าเจ้าที่เลือกใช้ไม่ได้ ระบบจะลองเจ้าอื่นที่มี key ตามลำดับ และถ้าไม่ได้เลยจะไม่เทรด</div>
        </section>}
      </div>

      {mapDraft && <section className="card">
        <h2>กลยุทธ์ตามสภาพตลาด</h2>
        <div className="mute">AI ระบุสภาพตลาดก่อน แล้วระบบดึงกลยุทธ์ที่ติ๊กไว้ในแต่ละสภาพมาตรวจเงื่อนไขเข้าเทรด ถ้าไม่ติ๊กอะไรเลย = ไม่เทรดในสภาพนั้น</div>
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
        {isAdmin && <div className="row"><button className="btn main" disabled={busy} onClick={() => act(() => api('/api/settings', { map: mapDraft }))}>บันทึกกลยุทธ์</button></div>}
      </section>}

      {grid && <section className="card">
        <h2>โปรไฟล์กริดสำหรับ EA กริด</h2>
        <div className="mute">AI ระบุสภาพตลาด แล้ว EA กริด (Terravolteco SmartGold) จะดึงโปรไฟล์ของสภาพนั้นไปตั้งค่าตัวเองอัตโนมัติ ค่าถูกจำกัดเพดานทั้งฝั่งเซิร์ฟเวอร์และใน EA โปรไฟล์ที่ปิดทั้ง Buy/Sell = หยุดเปิดชุดใหม่ (ชุดที่เปิดอยู่ยังจัดการต่อ โดย Max ไม้ที่ต่ำจะหยุดการถัวเพิ่ม)</div>
        {Object.keys(REGIME).map((rg) => (
          <div key={rg} className="row">
            <label className="sub" htmlFor={'g-' + rg} style={{ minWidth: 130 }}>{REGIME[rg]}</label>
            <select id={'g-' + rg} disabled={!isAdmin} value={grid.map[rg] ?? ''} onChange={(e) => setGrid((g) => g && { ...g, map: { ...g.map, [rg]: e.target.value } })}>
              {Object.values(grid.profiles).map((pf: any) => <option key={pf.id} value={pf.id}>{pf.name}</option>)}
            </select>
          </div>
        ))}
        <div className="tblwrap"><table>
          <thead><tr><th>โปรไฟล์</th><th>Buy</th><th>Sell</th>{GRID_COLS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
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
        {isAdmin && <div className="row"><button className="btn main" disabled={busy} onClick={() => act(() => api('/api/settings', { gridProfiles: grid.profiles, gridMap: grid.map }))}>บันทึกโปรไฟล์กริด</button></div>}
      </section>}

      <section className="card">
        <h2>คิวคำสั่งส่งเข้า EA</h2>
        <div className="tblwrap"><table>
          <thead><tr><th>เวลา</th><th>Symbol</th><th>ทิศทาง</th><th>ล็อต</th><th>ที่มา</th><th>สถานะ</th></tr></thead>
          <tbody>
            {(data?.cmds ?? []).map((c: any) => (
              <tr key={c.id}>
                <td>{new Date(c.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{c.symbol}</td><td className={c.side === 'BUY' ? 'buy' : 'sell'}>{c.side}</td><td>{c.lot}</td>
                <td>{c.source === 'ai' ? 'AI' : 'Webhook'}</td>
                <td>{STATUS[c.status]}{c.note ? <div className="mute">{c.note}</div> : null}</td>
              </tr>
            ))}
            {!data?.cmds?.length && <tr><td colSpan={6} className="mute">ยังไม่มีคำสั่ง ส่ง webhook ทดสอบตามคู่มือใน README</td></tr>}
          </tbody>
        </table></div>
      </section>

      {isAdmin && <section className="card">
        <h2>ผู้ใช้งาน</h2>
        <div className="mute">สร้างรหัสผ่านแล้วส่งให้ผู้ใช้ ผู้ใช้ดูข้อมูลและคุยกับ AI ได้ แต่ตั้งค่า หยุดระบบ หรือจัดการ key ไม่ได้ รหัสจะแสดงครั้งเดียว (ถ้าหายให้กด "รีเซ็ตรหัส")</div>
        <div className="row">
          <label className="sub" htmlFor="nu">ชื่อผู้ใช้</label>
          <input id="nu" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder="เช่น สมชาย" />
          <button className="btn main" disabled={busy || !newName.trim()} onClick={() => userAct({ action: 'create', name: newName })}>สร้างรหัสผ่าน</button>
        </div>
        {issued && <div className="bubble ai" role="status">
          <div className="mute">รหัสผ่านของ {issued.name} (แสดงครั้งเดียว)</div>
          <div style={{ fontFamily: 'monospace', fontSize: 18, margin: '8px 0', wordBreak: 'break-all', userSelect: 'all' }}>{issued.password}</div>
          <div className="row"><button className="btn main" onClick={copyIssued}>{copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์ + รหัส'}</button><button className="btn" onClick={() => setIssued(null)}>ปิด</button></div>
        </div>}
        <div className="tblwrap"><table>
          <thead><tr><th>ชื่อ</th><th>สร้างเมื่อ</th><th>เข้าใช้ล่าสุด</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{new Date(u.createdAt).toLocaleDateString('th-TH')}</td>
                <td>{u.lastSeen ? new Date(u.lastSeen).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                <td><div className="row">
                  <button className="btn" disabled={busy} onClick={() => userAct({ action: 'reset', id: u.id })}>รีเซ็ตรหัส</button>
                  <button className="btn warn" disabled={busy} onClick={() => { if (confirm(`ลบผู้ใช้ ${u.name}?`)) userAct({ action: 'delete', id: u.id }); }}>ลบ</button>
                </div></td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={4} className="mute">ยังไม่มีผู้ใช้</td></tr>}
          </tbody>
        </table></div>
      </section>}
    </main>
  );
}
