'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Api = (path: string, body?: any, method?: string) => Promise<any>;
const fmt = (n: number, cur = '') => `${Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })}${cur ? ' ' + cur : ''}`;
const dt = (ts?: number | null) => (ts ? new Date(ts).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-');
const PAY: Record<string, [string, string]> = { pending: ['รอตรวจสอบ', 'Pending'], approved: ['อนุมัติแล้ว', 'Approved'], rejected: ['ไม่อนุมัติ', 'Rejected'] };

function useCopy() {
  const [c, setC] = useState('');
  return [c, async (text: string, id: string) => { try { await navigator.clipboard.writeText(text); setC(id); setTimeout(() => setC(''), 2000); } catch {} }] as const;
}

// ───────────── Member: my subscription, plans, how to pay, referral link ─────────────
export function MemberBilling({ api }: { api: Api }) {
  const { t } = useLang();
  const [d, setD] = useState<any>(null);
  const [plan, setPlan] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, copy] = useCopy();
  const load = useCallback(() => api('/api/billing').then((r) => { setD(r); setPlan((p) => p || r.plans?.[0]?.id || ''); }).catch(() => {}), [api]);
  useEffect(() => { load(); const i = setInterval(load, 30_000); return () => clearInterval(i); }, [load]);
  if (!d || d.role !== 'user') return null;
  const s = d.sub, link = `${d.origin}/?ref=${d.refCode}`;
  const pay = async () => {
    setBusy(true); setMsg('');
    try { setD(await api('/api/billing', { action: 'pay', planId: plan, ref: note })); setNote(''); setMsg(t('ส่งแจ้งชำระเงินแล้ว รอผู้ดูแลตรวจสอบและเปิดใช้งาน', 'Payment notice sent. The admin will verify it and activate your plan.')); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  const chosen = d.plans.find((p: any) => p.id === plan);
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>{t('แพ็กเกจของฉัน', 'My subscription')}</h2>
        {!s.enforced ? <span className="chip ok">{t('ยังไม่เก็บค่าบริการ', 'Billing not enforced yet')}</span>
          : s.free ? <span className="chip ok">{t('ใช้ฟรีตลอด', 'Free (exempt)')}</span>
          : s.active ? <span className="chip ok">{t('ใช้งานได้ · เหลือ', 'Active · ')} {s.daysLeft} {t('วัน', 'day(s) left')}</span>
          : <span className="chip no">{t('หมดอายุ · EA ถูกล็อก', 'Expired · EA locked')}</span>}
      </div>
      {s.enforced && !s.free && <div className="mute">{s.expiresAt ? `${t('หมดอายุ', 'Expires')}: ${dt(s.expiresAt)}` : t('ยังไม่เคยชำระ', 'No payment yet')}{!s.active && ' — ' + t('EA จะไม่รับคำสั่งและไม่เชื่อมต่อเว็บจนกว่าจะต่ออายุ (ออเดอร์ที่เปิดค้างอยู่ EA ยังจัดการปิดตามปกติ)', 'the EA gets no orders / AI profile until you renew (positions already open are still managed and closed).')}</div>}

      {d.plans.length > 0 && <>
        <h2 style={{ fontSize: 16 }}>{t('ต่ออายุ / ชำระเงิน', 'Renew / pay')}</h2>
        <div className="row" role="radiogroup" aria-label={t('เลือกแพ็กเกจ', 'Choose a plan')}>
          {d.plans.map((p: any) => (
            <button key={p.id} role="radio" aria-checked={plan === p.id} className={'btn' + (plan === p.id ? ' main' : '')} onClick={() => setPlan(p.id)}>{p.name} · {fmt(p.price, d.currency)} · {p.days} {t('วัน', 'days')}</button>
          ))}
        </div>
        {d.payInfo && <div className="bubble ai" style={{ whiteSpace: 'pre-wrap' }}>{d.payInfo}</div>}
        {d.contact && <div className="mute">{t('ส่งสลิป/ติดต่อ', 'Send slip / contact')}: {d.contact}</div>}
        <div className="row">
          <input aria-label={t('เลขอ้างอิงโอน / TXID', 'Transfer ref / TXID')} style={{ flex: '1 1 220px' }} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('เลขอ้างอิง / เวลาโอน / TXID (ไม่บังคับ)', 'Transfer ref / time / TXID (optional)')} />
          <button className="btn main" disabled={busy || !chosen} onClick={pay}>{t('แจ้งชำระเงิน', 'I have paid')}{chosen ? ` ${fmt(chosen.price, d.currency)}` : ''}</button>
        </div>
        {msg && <div className="mute" role="status">{msg}</div>}
      </>}
      {d.payments?.length > 0 && <div className="tblwrap"><table>
        <thead><tr><th>{t('เวลา', 'Time')}</th><th>{t('แพ็กเกจ', 'Plan')}</th><th>{t('ยอด', 'Amount')}</th><th>{t('สถานะ', 'Status')}</th></tr></thead>
        <tbody>{d.payments.map((p: any) => <tr key={p.id}><td>{dt(p.ts)}</td><td>{p.planName}</td><td>{fmt(p.amount, p.currency)}</td><td>{t(...PAY[p.status])}</td></tr>)}</tbody>
      </table></div>}

      <h2 style={{ fontSize: 16, marginTop: 8 }}>{t('ลิงก์แนะนำเพื่อน', 'Your referral link')}</h2>
      <div className="mute">{t(`ชวนเพื่อนสมัครผ่านลิงก์นี้ คุณได้ค่าแนะนำ ${d.refPct}% ของยอดที่เขาชำระ`, `Friends who sign up with this link earn you ${d.refPct}% of what they pay`)}{d.refRecurring ? t(' (ทุกครั้งที่ต่ออายุ)', ' (on every renewal)') : t(' (เฉพาะครั้งแรก)', ' (first payment only)')}</div>
      <div className="row">
        <input readOnly aria-label={t('ลิงก์แนะนำ', 'Referral link')} style={{ flex: '1 1 260px', fontFamily: 'monospace' }} value={link} onFocus={(e) => e.currentTarget.select()} />
        <button className="btn main" onClick={() => copy(link, 'link')}>{copied === 'link' ? t('คัดลอกแล้ว', 'Copied') : t('คัดลอกลิงก์', 'Copy link')}</button>
      </div>
      <div className="row">
        <span className="chip">{t('ชวนแล้ว', 'Referred')} {d.refStats.referred}</span>
        <span className="chip">{t('จ่ายแล้ว', 'Paying')} {d.refStats.paying}</span>
        <span className="chip ok">{t('ค่าแนะนำสะสม', 'Earned')} {fmt(d.refStats.earned, d.currency)}</span>
        <span className="chip">{t('รับแล้ว', 'Paid out')} {fmt(d.refStats.paid, d.currency)}</span>
        <span className="chip no">{t('ค้างจ่าย', 'Owed to you')} {fmt(d.refStats.owed, d.currency)}</span>
      </div>
      {d.referred?.length > 0 && <div className="mute">{t('คนที่คุณชวน', 'People you referred')}: {d.referred.map((r: any) => `${r.name}${r.paying ? ' ✓' : ''}`).join(', ')}</div>}
    </section>
  );
}

// ───────────── Admin: prices / days / referral %, pending payments, members ─────────────
export function AdminBilling({ api }: { api: Api }) {
  const { t } = useLang();
  const [d, setD] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, copy] = useCopy();
  const load = useCallback(async () => {
    const [r, u] = await Promise.all([api('/api/billing'), api('/api/users')]);
    setD(r); setUsers(u.users); setCfg((c: any) => c ?? r.cfg);
  }, [api]);
  useEffect(() => { load().catch(() => {}); const i = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 30_000); return () => clearInterval(i); }, [load]);
  const run = async (body: any, ok?: string) => {
    setBusy(true); setMsg('');
    try { const r = await api('/api/billing', body); setD(r); if (body.action === 'saveCfg') setCfg(r.cfg); setUsers((await api('/api/users')).users); setMsg(ok ?? ''); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  if (!d || d.role !== 'admin' || !cfg) return null;
  const set = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }));
  const setPlan = (i: number, k: string, v: any) => setCfg((c: any) => ({ ...c, plans: c.plans.map((p: any, j: number) => (j === i ? { ...p, [k]: v } : p)) }));
  const cur = cfg.currency;
  const dirty = JSON.stringify(cfg) !== JSON.stringify(d.cfg);
  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>{t('ระบบสมาชิก · ค่าบริการ · ค่าแนะนำ', 'Subscriptions · pricing · referrals')}</h2>
        <span className="chip">{t('รายได้ที่อนุมัติแล้ว', 'Revenue')} {fmt(d.revenue, cur)}</span>
      </div>
      <div className="mute">{t('เปิด "บังคับชำระเงิน" แล้วสมาชิกที่หมดอายุจะถูกล็อก: EA ได้ HTTP 402 ทุกคำขอ (ไม่ได้ออเดอร์ ไม่ได้โปรไฟล์ AI) และ EA เองก็หยุดเปิดออเดอร์ใหม่ ส่วนบัญชีหลัก (Admin) ไม่ถูกจำกัด ก่อนเปิดให้กด "ให้ทุกคน +วัน" เพื่อไม่ตัดสมาชิกเดิมทันที', 'With "Enforce payment" on, expired members are locked: the EA gets HTTP 402 on every request (no orders, no AI profile) and stops opening new trades. The main (admin) account is never limited. Before turning it on, use "Give everyone +days" so existing members are not cut off at once.')}</div>

      <div className="row">
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={cfg.enforce} onChange={(e) => set('enforce', e.target.checked)} /> <b>{t('บังคับชำระเงิน (ล็อก EA เมื่อหมดอายุ)', 'Enforce payment (lock EA when expired)')}</b></label>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={cfg.allowSignup} onChange={(e) => set('allowSignup', e.target.checked)} /> {t('เปิดรับสมัครเอง (หน้าลิงก์แนะนำ)', 'Open self-registration (referral page)')}</label>
      </div>
      <div className="row">
        <label className="sub" htmlFor="b-cur">{t('สกุลเงิน', 'Currency')}</label>
        <input id="b-cur" style={{ width: 80 }} maxLength={8} value={cfg.currency} onChange={(e) => set('currency', e.target.value)} />
        <label className="sub" htmlFor="b-ref">{t('ค่าแนะนำมาตรฐาน %', 'Default referral %')}</label>
        <input id="b-ref" style={{ width: 80 }} inputMode="decimal" value={cfg.defaultRefPct} onChange={(e) => set('defaultRefPct', num(e.target.value))} />
        <label className="sub" htmlFor="b-tr">{t('ทดลองใช้ฟรี (วัน) สำหรับคนสมัครเอง', 'Free trial days (self-registered)')}</label>
        <input id="b-tr" style={{ width: 80 }} inputMode="numeric" value={cfg.trialDays} onChange={(e) => set('trialDays', num(e.target.value))} />
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={cfg.refRecurring} onChange={(e) => set('refRecurring', e.target.checked)} /> {t('ให้ค่าแนะนำทุกครั้งที่ต่ออายุ (ไม่ติ๊ก = เฉพาะครั้งแรก)', 'Pay commission on every renewal (unchecked = first payment only)')}</label>
      </div>

      <h2 style={{ fontSize: 16 }}>{t('แพ็กเกจ (ราคา / จำนวนวัน)', 'Plans (price / days)')}</h2>
      <div className="tblwrap"><table>
        <thead><tr><th>ID</th><th>{t('ชื่อ', 'Name')}</th><th>{t('ราคา', 'Price')} ({cur})</th><th>{t('วัน', 'Days')}</th><th>{t('แสดง', 'Show')}</th><th></th></tr></thead>
        <tbody>
          {cfg.plans.map((p: any, i: number) => (
            <tr key={i}>
              <td><input aria-label="plan id" style={{ width: 70 }} maxLength={20} value={p.id} onChange={(e) => setPlan(i, 'id', e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))} /></td>
              <td><input aria-label="plan name" maxLength={40} value={p.name} onChange={(e) => setPlan(i, 'name', e.target.value)} /></td>
              <td><input aria-label="price" style={{ width: 100 }} inputMode="decimal" value={p.price} onChange={(e) => setPlan(i, 'price', num(e.target.value))} /></td>
              <td><input aria-label="days" style={{ width: 70 }} inputMode="numeric" value={p.days} onChange={(e) => setPlan(i, 'days', Math.round(num(e.target.value)))} /></td>
              <td><input type="checkbox" aria-label="active" checked={p.active} onChange={(e) => setPlan(i, 'active', e.target.checked)} /></td>
              <td><button className="btn warn" onClick={() => setCfg((c: any) => ({ ...c, plans: c.plans.filter((_: any, j: number) => j !== i) }))}>{t('ลบ', 'Delete')}</button></td>
            </tr>
          ))}
          {!cfg.plans.length && <tr><td colSpan={6} className="mute">{t('ยังไม่มีแพ็กเกจ', 'No plans yet')}</td></tr>}
        </tbody>
      </table></div>
      <div className="row"><button className="btn" onClick={() => setCfg((c: any) => ({ ...c, plans: [...c.plans, { id: 'p' + (c.plans.length + 1), name: t('แพ็กเกจใหม่', 'New plan'), price: 0, days: 30, active: true }] }))}>{t('+ เพิ่มแพ็กเกจ', '+ Add plan')}</button></div>

      <label className="sub" htmlFor="b-pi">{t('วิธีชำระเงิน (แสดงให้สมาชิกเห็น เช่น เลขบัญชี / PromptPay / USDT)', 'How to pay (shown to members: bank / PromptPay / USDT ...)')}</label>
      <textarea id="b-pi" rows={4} maxLength={2000} value={cfg.payInfo} onChange={(e) => set('payInfo', e.target.value)} />
      <label className="sub" htmlFor="b-ct">{t('ช่องทางส่งสลิป (LINE / Telegram)', 'Where to send the slip (LINE / Telegram)')}</label>
      <input id="b-ct" maxLength={300} value={cfg.contact} onChange={(e) => set('contact', e.target.value)} />
      <div className="row">
        <button className="btn main" disabled={busy || !dirty} onClick={() => run({ action: 'saveCfg', cfg }, t('บันทึกแล้ว', 'Saved'))}>{t('บันทึกการตั้งค่า', 'Save settings')}</button>
        <button className="btn" disabled={busy} onClick={() => { const n = Number(prompt(t('ให้สมาชิกทุกคน + กี่วัน?', 'Give every member how many days?'), '30')); if (n > 0) run({ action: 'grantAll', days: Math.round(n) }, t('เพิ่มวันให้ทุกคนแล้ว', 'Days added to everyone')); }}>{t('ให้ทุกคน +วัน', 'Give everyone +days')}</button>
        {msg && <span className="mute" role="status">{msg}</span>}
      </div>
      <div className="mute">Webhook (auto-confirm): <code>POST {d.origin}/api/billing/webhook?key=BILLING_SECRET</code> {`{"login":"3030514","planId":"${cfg.plans[0]?.id ?? 'm1'}","txid":"..."}`}</div>

      <h2 style={{ fontSize: 16 }}>{t('รายการแจ้งชำระเงินที่รออนุมัติ', 'Payments waiting for approval')} ({d.pending.length})</h2>
      <div className="tblwrap"><table>
        <thead><tr><th>{t('เวลา', 'Time')}</th><th>{t('สมาชิก', 'Member')}</th><th>{t('แพ็กเกจ', 'Plan')}</th><th>{t('ยอด', 'Amount')}</th><th>{t('อ้างอิง', 'Ref')}</th><th></th></tr></thead>
        <tbody>
          {d.pending.map((p: any) => (
            <tr key={p.id}><td>{dt(p.ts)}</td><td>{p.userName}{p.login ? ` (${p.login})` : ''}</td><td>{p.planName} · {p.days}d</td><td>{fmt(p.amount, p.currency)}</td><td style={{ wordBreak: 'break-all' }}>{p.ref || '-'}</td>
              <td><div className="row"><button className="btn main" disabled={busy} onClick={() => run({ action: 'approve', id: p.id }, t('อนุมัติแล้ว ต่ออายุให้สมาชิกเรียบร้อย', 'Approved, member extended'))}>{t('อนุมัติ', 'Approve')}</button><button className="btn warn" disabled={busy} onClick={() => run({ action: 'reject', id: p.id })}>{t('ไม่อนุมัติ', 'Reject')}</button></div></td></tr>
          ))}
          {!d.pending.length && <tr><td colSpan={6} className="mute">{t('ไม่มีรายการค้าง', 'Nothing waiting')}</td></tr>}
        </tbody>
      </table></div>

      <h2 style={{ fontSize: 16 }}>{t('สมาชิก · วันหมดอายุ · ค่าแนะนำ', 'Members · expiry · commission')}</h2>
      <div className="tblwrap"><table style={{ minWidth: 900 }}>
        <thead><tr><th>{t('ชื่อ', 'Name')}</th><th>{t('สถานะ', 'Status')}</th><th>{t('หมดอายุ', 'Expires')}</th><th>{t('ใช้ฟรี', 'Free')}</th><th>{t('โค้ดแนะนำ', 'Code')}</th><th>{t('ค่าแนะนำ %', 'Comm. %')}</th><th>{t('ชวน/จ่าย', 'Ref/paid')}</th><th>{t('ค้างจ่าย', 'Owed')}</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}{u.refBy && <div className="mute">{t('แนะนำโดย', 'via')} {u.refBy}</div>}</td>
              <td>{!u.sub.enforced ? <span className="mute">-</span> : u.sub.active ? <span className="chip ok">{u.sub.free ? t('ฟรี', 'Free') : `${u.sub.daysLeft} ${t('วัน', 'd')}`}</span> : <span className="chip no">{t('หมดอายุ', 'Expired')}</span>}</td>
              <td>{u.free ? '-' : dt(u.sub.expiresAt)}</td>
              <td><input type="checkbox" aria-label={`free ${u.name}`} checked={u.free} disabled={busy} onChange={(e) => run({ action: 'setUser', userId: u.id, free: e.target.checked })} /></td>
              <td>{u.refCode ? <button className="btn" style={{ minHeight: 34, padding: '0 10px', fontFamily: 'monospace' }} onClick={() => copy(`${d.origin}/?ref=${u.refCode}`, u.id)}>{copied === u.id ? t('คัดลอกแล้ว', 'Copied') : u.refCode}</button> : <span className="mute">-</span>}</td>
              <td><input aria-label={`ref pct ${u.name}`} style={{ width: 64 }} inputMode="decimal" placeholder={String(cfg.defaultRefPct)} defaultValue={u.refPct ?? ''} key={u.id + ':' + (u.refPct ?? '')} onBlur={(e) => { const v = e.target.value.trim(); const n = v === '' ? null : Number(v); if ((n === null || (n >= 0 && n <= 100)) && n !== u.refPct) run({ action: 'setUser', userId: u.id, refPct: n }); }} /></td>
              <td>{u.ref.referred}/{u.ref.paying}</td>
              <td>{fmt(u.ref.owed, cur)}</td>
              <td><div className="row">
                {[30, 90, -30].map((n) => <button key={n} className="btn" style={{ minHeight: 34, padding: '0 10px' }} disabled={busy} onClick={() => run({ action: 'grant', userId: u.id, days: n })}>{n > 0 ? '+' : ''}{n}{t('ว', 'd')}</button>)}
                <button className="btn" style={{ minHeight: 34, padding: '0 10px' }} disabled={busy} onClick={() => { const n = Number(prompt(t('เพิ่มกี่วัน (ใส่ติดลบเพื่อลด)', 'Days to add (negative to remove)'), '7')); if (n && Number.isFinite(n)) run({ action: 'grant', userId: u.id, days: Math.round(n) }); }}>{t('วัน…', 'days…')}</button>
                {u.ref.owed > 0 && <button className="btn main" style={{ minHeight: 34, padding: '0 10px' }} disabled={busy} onClick={() => { const n = Number(prompt(t(`จ่ายค่าแนะนำให้ ${u.name} เท่าไร (ค้าง ${u.ref.owed})`, `Pay out to ${u.name} (owed ${u.ref.owed})`), String(u.ref.owed))); if (n > 0) run({ action: 'payout', userId: u.id, amount: n }, t('บันทึกการจ่ายแล้ว', 'Payout recorded')); }}>{t('จ่ายค่าแนะนำ', 'Pay out')}</button>}
              </div></td>
            </tr>
          ))}
          {!users.length && <tr><td colSpan={9} className="mute">{t('ยังไม่มีสมาชิก', 'No members yet')}</td></tr>}
        </tbody>
      </table></div>
      {d.recent.length > 0 && <div className="mute">{t('ล่าสุด', 'Recent')}: {d.recent.slice(0, 8).map((p: any) => `${p.userName} ${fmt(p.amount, p.currency)} (${t(...PAY[p.status])}${p.commission ? ` · ${t('ค่าแนะนำ', 'comm')} ${fmt(p.commission)}` : ''})`).join(' · ')}</div>}
    </section>
  );
}

// ───────────── Public: register (the page a referral link opens) ─────────────
export function RegisterCard({ onLogin }: { onLogin: (pw: string) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<{ allow: boolean; trialDays: number; refValid: boolean } | null>(null);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<any>(null);
  const [copied, copy] = useCopy();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let code = '';
    try { const q = new URLSearchParams(location.search).get('ref'); if (q) localStorage.setItem('ref', q.slice(0, 20).toUpperCase()); code = localStorage.getItem('ref') || ''; } catch {}
    setRef(code);
    fetch('/api/register' + (code ? '?ref=' + encodeURIComponent(code) : '')).then((r) => r.json()).then((j) => { setInfo(j); if (code && j.allow) { setOpen(true); setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400); } }).catch(() => {});
  }, []);
  if (!info?.allow) return null;
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, login, ref }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || t('สมัครไม่สำเร็จ', 'Registration failed')); else { setDone(j); try { localStorage.removeItem('ref'); } catch {} }
    } catch { setErr(t('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'Cannot reach the server')); }
    setBusy(false);
  };
  const all = done ? [`MT5 Signal Hub`, `${t('รหัสผ่านเข้าเว็บ', 'Web password')}: ${done.password}`, `AI_Url: ${location.origin}`, `AI_EAKey: ${done.eaKey}`, `${t('ใช้ได้กับบัญชี MT5 เลข', 'Works only on MT5 account')} ${done.login}`].join('\n') : '';
  return (
    <div className="card" ref={box} style={{ marginTop: 14 }}>
      <button className="btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t('สมัครสมาชิกใหม่', 'Create an account')}{info.refValid ? ' ✓ ' + t('มีผู้แนะนำ', 'referred') : ''}</button>
      {open && (done ? (
        <div className="bubble ai" role="status">
          <div className="mute">{t('สมัครสำเร็จ! ข้อมูลนี้แสดงครั้งเดียว จดหรือคัดลอกไว้ก่อนปิด', 'Registered! This is shown once: copy it before closing.')}{done.trialDays > 0 ? ' ' + t(`ทดลองใช้ฟรี ${done.trialDays} วัน`, `${done.trialDays} free trial days`) : ''}</div>
          <div className="mute" style={{ marginTop: 8 }}>{t('รหัสผ่านเข้าเว็บ', 'Web password')}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 18, wordBreak: 'break-all', userSelect: 'all' }}>{done.password}</div>
          <div className="mute" style={{ marginTop: 8 }}>EA key ({t('ใส่ที่ AI_EAKey ใน EA', 'goes in the EA\'s AI_EAKey')})</div>
          <div style={{ fontFamily: 'monospace', fontSize: 16, wordBreak: 'break-all', userSelect: 'all' }}>{done.eaKey}</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => copy(all, 'all')}>{copied === 'all' ? t('คัดลอกแล้ว', 'Copied') : t('คัดลอกทั้งหมด', 'Copy all')}</button>
            <button className="btn main" onClick={() => onLogin(done.password)}>{t('เข้าสู่ระบบด้วยรหัสนี้', 'Log in with this password')}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="mute">{t('1 บัญชีสมาชิก = 1 เลขบัญชี MT5 ระบบจะออกรหัสผ่านและ EA key ให้ทันที', '1 member = 1 MT5 account number. A password and an EA key are issued right away.')}{info.trialDays > 0 ? ' ' + t(`ทดลองใช้ฟรี ${info.trialDays} วัน`, `${info.trialDays} free trial days.`) : ''}</div>
          <label className="sub" htmlFor="rg-n">{t('ชื่อ', 'Name')}</label>
          <input id="rg-n" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <label className="sub" htmlFor="rg-l">{t('เลขบัญชี MT5', 'MT5 account number')}</label>
          <input id="rg-l" inputMode="numeric" maxLength={12} value={login} onChange={(e) => setLogin(e.target.value.replace(/\D/g, ''))} />
          <label className="sub" htmlFor="rg-r">{t('โค้ดผู้แนะนำ (ถ้ามี)', 'Referral code (optional)')}</label>
          <input id="rg-r" maxLength={20} value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} />
          {err && <div className="err" role="alert">{err}</div>}
          <button className="btn main" disabled={busy || !name.trim() || login.length < 4} onClick={submit}>{t('สมัครสมาชิก', 'Register')}</button>
        </div>
      ))}
    </div>
  );
}
