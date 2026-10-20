'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const SAMPLE = { symbol: 'XAUUSD', tf: 'M15', price: 2411.9, adx: 31, rsi: 58, atr: 4.2, ema20: 2412.5, ema50: 2405.1 };
const STATUS: Record<string, string> = { pending: 'รอ EA รับ', sent: 'ส่งให้ EA แล้ว', done: 'เข้าออเดอร์แล้ว', failed: 'ไม่สำเร็จ', blocked: 'ถูก Risk บล็อก' };
const PROVIDERS = [['anthropic', 'Claude'], ['openai', 'GPT'], ['google', 'Gemini']];
const REGIME: Record<string, string> = { trend_up: 'แนวโน้มขาขึ้น', trend_down: 'แนวโน้มขาลง', range: 'ไซด์เวย์', volatile: 'ผันผวน', news: 'ช่วงข่าว' };
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
  const [iv, setIv] = useState(15);
  const [autoVoice, setAutoVoice] = useState(false);
  const lastSeen = useRef<string | null>(null);
  const modeRef = useRef<Mode>('idle');
  const recRef = useRef<any>(null);
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };

  useEffect(() => {
    setKey(sessionStorage.getItem('hubkey') || '');
    setAutoVoice(localStorage.getItem('autovoice') === '1');
    // browsers only allow speech after a user gesture: unlock it on the first click/tap
    const unlock = () => { try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {} };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const api = useCallback(async (path: string, body?: any) => {
    const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-admin-key': key }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(r.status === 401 ? 'ADMIN_KEY ไม่ถูกต้อง' : 'เกิดข้อผิดพลาด ' + r.status);
    return r.json();
  }, [key]);

  const load = useCallback(() => api('/api/state').then((d) => {
    setData(d); setErr('');
    setProvider((p) => (data ? p : d.settings.provider)); setModel((m) => (data ? m : d.settings.model || '')); setIv((v) => (data ? v : d.settings.intervalMin || 15));
  }).catch((e) => setErr(e.message)), [api, data]);

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
      (dd.strategy_id === 'no_trade' ? 'ยังไม่เข้าเทรด ' : `AI เลือกกลยุทธ์ ${dd.strategy}${dd.pass ? ' และผ่านเงื่อนไขเข้าเทรด' : ' แต่ยังไม่ผ่านเงื่อนไข'} `) + (dd.reason || '');
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
  const paused = !!data?.settings?.paused;

  if (!key) {
    return (
      <main className="shell" style={{ maxWidth: 420, marginTop: 80 }}>
        <div className="card">
          <h1>MT5 Signal Hub</h1>
          <label className="sub" htmlFor="k">ADMIN_KEY (ตั้งไว้ใน Environment Variables)</label>
          <input id="k" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn main" onClick={() => { sessionStorage.setItem('hubkey', draft); setKey(draft); }}>เข้าสู่ระบบ</button>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="top">
        <div><h1>MT5 Signal Hub</h1><div className="sub">AI เลือกกลยุทธ์ · เซิร์ฟเวอร์ตรวจเงื่อนไข · EA ส่งคำสั่ง</div></div>
        <div className="row">
          <span className={'chip ' + (paused ? 'no' : 'ok')}>{paused ? 'ระบบหยุดอยู่' : 'ระบบทำงาน'}</span>
          <button className={'btn ' + (paused ? 'main' : 'warn')} disabled={busy} onClick={() => act(() => api('/api/settings', { paused: !paused }))}>
            {paused ? 'เปิดระบบ' : 'หยุดส่งคำสั่งทั้งหมด'}
          </button>
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
            <div className="row"><span className="chip ok">{d.regime}</span><b style={{ fontSize: 19 }}>{d.strategy}</b></div>
            <div><div className="bar"><i style={{ width: Math.round(d.confidence * 100) + '%' }} /></div><div className="mute" style={{ marginTop: 6 }}>ความมั่นใจ {Math.round(d.confidence * 100)}% · {d.provider ?? '-'} {d.model}</div></div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>{d.reason}</div>
            {d.eval && <div style={{ fontSize: 14, display: 'grid', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              {d.eval.results.map((r: any) => <div key={r.text} className="row" style={{ justifyContent: 'space-between' }}><span>{r.text}</span><span className={r.ok ? 'buy' : 'sell'}>{r.ok ? 'ผ่าน' : 'ไม่ผ่าน'}</span></div>)}
            </div>}
            <span className={'chip ' + (d.pass ? 'ok' : 'no')}>{d.pass ? 'ผ่านเงื่อนไข' : 'ไม่เข้าเทรดรอบนี้'}</span>
          </>)}
          <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <label className="sub" htmlFor="iv">ให้ AI วิเคราะห์ทุก</label>
            <select id="iv" value={iv} onChange={(e) => setIv(Number(e.target.value))}>
              {INTERVALS.map((m) => <option key={m} value={m}>{m >= 60 ? m / 60 + ' ชั่วโมง' : m + ' นาที'}</option>)}
            </select>
            <button className="btn main" disabled={busy} onClick={() => act(() => api('/api/settings', { intervalMin: iv }))}>บันทึก</button>
            <span className="mute">ตอนนี้: {data?.settings?.intervalMin ?? 15} นาที</span>
          </div>
          <button className="btn" disabled={busy} onClick={() => act(() => api('/api/ai/decide', { ...SAMPLE, execute: false }))}>ทดสอบ AI ด้วยข้อมูลตัวอย่าง (ไม่ส่งคำสั่ง)</button>
        </section>

        <section className="card">
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
        </section>
      </div>

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
    </main>
  );
}
