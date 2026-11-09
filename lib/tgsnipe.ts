import { addCmd, getJSON, setJSON } from './store';
import { getSnipe, listSnipe, SNIPE_FRESH_MS, type Plan, type SnipeRow } from './snipe';
import { esc, tgEdit, tgSend, type BtnStyle, type Kb, type TgLink } from './telegram';

// "Sniper" screens of the Telegram bot: pick a pair the EA reports, see its support / resistance and the SL + TP1-3 (with the RR of each),
// choose BUY or SELL + which TP + lot, confirm, and ONE order is queued for the EA with that SL / TP. The EA opens it with its own
// sniper magic number, so the grid never touches it. Same queue, MAX_LOT, news guard and pause as every other order (addCmd).
type Me = TgLink;
const B = (text: string, callback_data: string, style?: BtnStyle) => ({ text, callback_data, ...(style ? { style } : {}) });
const MAX_LOT = Number(process.env.MAX_LOT ?? 0.1);
const LOTS = (process.env.TELEGRAM_LOTS || '0.01,0.02,0.05,0.1').split(',').map(Number).filter((v) => v > 0 && v <= MAX_LOT);
const PEND_MS = 120_000;
const put = (chatId: string, mid: number | undefined, text: string, kb?: Kb) => (mid ? tgEdit(chatId, mid, text, kb, true) : tgSend(chatId, text, kb, true));
const hms = () => new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false });
const ago = (ts: number) => { const s = Math.floor((Date.now() - ts) / 1000); return s < 90 ? `${s} วิที่แล้ว` : `${Math.floor(s / 60)} นาทีที่แล้ว`; };
const fresh = (r: SnipeRow) => Date.now() - r.ts < SNIPE_FRESH_MS;
const f = (r: SnipeRow, v: number) => v.toFixed(r.digits);
const pts = (r: SnipeRow, d: number) => Math.round(d / r.point).toLocaleString('en-US');
const rrOf = (p: Plan, tp: number) => (Math.abs(tp - p.e) / p.risk);

// BUY needs SL under the bid and TP over the ask (SELL the opposite), and both farther than the broker's minimum distance
function check(r: SnipeRow, side: 'BUY' | 'SELL', p: Plan, tp: number): string | null {
  const min = (r.stopLevel ?? 0) + 2 * r.point;
  if (side === 'BUY') {
    if (!(p.sl < r.bid - min)) return 'SL อยู่ใกล้หรือสูงกว่าราคาปัจจุบัน (ราคาวิ่งผ่านแนวไปแล้ว)';
    if (!(tp > r.ask + min)) return 'TP อยู่ใกล้หรือต่ำกว่าราคาปัจจุบัน';
  } else {
    if (!(p.sl > r.ask + min)) return 'SL อยู่ใกล้หรือต่ำกว่าราคาปัจจุบัน (ราคาวิ่งผ่านแนวไปแล้ว)';
    if (!(tp < r.bid - min)) return 'TP อยู่ใกล้หรือสูงกว่าราคาปัจจุบัน';
  }
  return null;
}

/* ---------- 1) pair list ---------- */
export async function showSnipe(chatId: string, me: Me, mid?: number) {
  const rows = await listSnipe(me.acct);
  const back = [B('🔄 รีเฟรช', 'sn'), B('‹ เมนูหลัก', 'mn')];
  if (!rows.length) return put(chatId, mid, `🎯 <b>สไนเปอร์ (แนวรับ/แนวต้าน)</b>\nยังไม่มีข้อมูลจาก EA\nต้องใช้ EA เวอร์ชันที่มีโมดูล SniperSR และเปิดทิ้งไว้ (EA ส่งทุกประมาณ 1 นาที)\n<i>อัปเดต ${hms()}</i>`, [back]);
  const kb: Kb = rows.map((r) => [B(`${fresh(r) ? '' : '💤 '}${r.symbol} · ${f(r, r.bid)}`, `sn:v:${r.key}`)]);
  return put(chatId, mid, `🎯 <b>สไนเปอร์ (แนวรับ/แนวต้าน)</b>\nเลือกคู่เงินที่ EA ส่งมา\n${rows.map((r) => `${fresh(r) ? '🟢' : '💤'} ${esc(r.symbol)} ${esc(r.tf)} · ${ago(r.ts)}`).join('\n')}\n<i>💤 = EA เงียบเกิน 4 นาที สั่งออเดอร์ไม่ได้ · อัปเดต ${hms()}</i>`, [...kb, back]);
}

/* ---------- 2) one pair: levels + BUY / SELL plans ---------- */
function planLine(r: SnipeRow, side: 'BUY' | 'SELL', p?: Plan) {
  const ic = side === 'BUY' ? '🟢' : '🔴';
  if (!p) return `${ic} <b>${side}</b>: ไม่พบแนว${side === 'BUY' ? 'รับ' : 'ต้าน'}สำหรับวาง SL`;
  return `${ic} <b>${side}</b> เข้า ~${f(r, p.e)}\n   SL <b>${f(r, p.sl)}</b> (−${pts(r, p.risk)} pts)\n` +
    p.tp.map((t, i) => `   TP${i + 1} <b>${f(r, t)}</b> (+${pts(r, Math.abs(t - p.e))} pts) · <b>RR 1:${rrOf(p, t).toFixed(1)}</b>`).join('\n');
}
export async function showSnipePair(chatId: string, me: Me, mid: number | undefined, key: string) {
  const r = await getSnipe(me.acct, key);
  if (!r) return showSnipe(chatId, me, mid);
  const ok = fresh(r);
  const text = `🎯 <b>${esc(r.symbol)} ${esc(r.tf)}</b> · ราคา <b>${f(r, r.bid)}</b>\n` +
    `แนวรับ <b>${r.sup ? f(r, r.sup) : '-'}</b> · แนวต้าน <b>${r.res ? f(r, r.res) : '-'}</b>\n\n${planLine(r, 'BUY', r.buy)}\n\n${planLine(r, 'SELL', r.sell)}\n\n` +
    (ok ? `<i>ข้อมูลจาก EA ${ago(r.ts)} · SL/TP ตามค่านี้ ราคาเข้าจริงเป็นราคาตลาดตอน EA ส่งออเดอร์ · ${hms()}</i>` : `⚠️ <b>ข้อมูลเก่า (${ago(r.ts)})</b> EA ไม่ได้ส่งมาแล้ว สั่งออเดอร์ไม่ได้จนกว่าจะอัปเดต`);
  const kb: Kb = [];
  if (ok && r.buy) kb.push(r.buy.tp.map((t, i) => B(`🟢 BUY TP${i + 1} · 1:${rrOf(r.buy!, t).toFixed(1)}`, `sn:p:${r.key}:B:${i + 1}`, 'success')));
  if (ok && r.sell) kb.push(r.sell.tp.map((t, i) => B(`🔴 SELL TP${i + 1} · 1:${rrOf(r.sell!, t).toFixed(1)}`, `sn:p:${r.key}:S:${i + 1}`, 'danger')));
  kb.push([B('🔄 รีเฟรช', `sn:v:${r.key}`), B('‹ รายการคู่เงิน', 'sn')]);
  return put(chatId, mid, text, kb);
}

/* ---------- 3) lot, 4) confirm, 5) send ---------- */
type Pend = { sym: string; key: string; side: 'BUY' | 'SELL'; lot: number; sl: number; tp: number; n: number; rr: number; exp: number };
const pk = (chatId: string) => `tg:snp:${chatId}`;

async function pickLot(chatId: string, mid: number, key: string, s: string, n: number, me: Me) {
  const r = await getSnipe(me.acct, key);
  if (!r || !fresh(r)) return put(chatId, mid, '⚠️ ข้อมูลจาก EA เก่าเกินไป กดรีเฟรชเพื่อดูค่าล่าสุดก่อน', [[B('🔄 รีเฟรช', `sn:v:${key}`), B('‹ กลับ', 'sn')]]);
  const side = s === 'B' ? 'BUY' : 'SELL', p = s === 'B' ? r.buy : r.sell;
  if (!p || !(n >= 1 && n <= 3) || !LOTS.length) return showSnipePair(chatId, me, mid, key);
  const bad = check(r, side, p, p.tp[n - 1]);
  if (bad) return put(chatId, mid, `⛔ ${bad}\nรอแนวใหม่จาก EA แล้วกดรีเฟรช`, [[B('🔄 รีเฟรช', `sn:v:${key}`), B('‹ กลับ', 'sn')]]);
  const ic = side === 'BUY' ? '🟢' : '🔴';
  return put(chatId, mid, `${ic} <b>${side} ${esc(r.symbol)}</b> → TP${n} (RR 1:${rrOf(p, p.tp[n - 1]).toFixed(1)})\nSL <b>${f(r, p.sl)}</b> · TP <b>${f(r, p.tp[n - 1])}</b>\nเลือกขนาด lot`,
    [LOTS.map((l) => B(String(l), `sn:l:${key}:${s}:${n}:${l}`, side === 'BUY' ? 'success' : 'danger')), [B('❌ ยกเลิก', `sn:v:${key}`)]]);
}

async function confirmCard(chatId: string, mid: number, key: string, s: string, n: number, lot: number, me: Me) {
  const r = await getSnipe(me.acct, key);
  if (!r || !fresh(r)) return put(chatId, mid, '⚠️ ข้อมูลจาก EA เก่าเกินไป กดรีเฟรชแล้วเลือกใหม่', [[B('🔄 รีเฟรช', `sn:v:${key}`), B('‹ กลับ', 'sn')]]);
  const side = s === 'B' ? 'BUY' : 'SELL', p = s === 'B' ? r.buy : r.sell;
  if (!p || !(n >= 1 && n <= 3)) return showSnipePair(chatId, me, mid, key);
  if (!(lot > 0) || lot > MAX_LOT) return put(chatId, mid, `lot ต้องอยู่ระหว่าง 0 ถึง ${MAX_LOT}`, [[B('‹ กลับ', `sn:v:${key}`)]]);
  const tp = p.tp[n - 1], bad = check(r, side, p, tp);
  if (bad) return put(chatId, mid, `⛔ ${bad}\nรอแนวใหม่จาก EA แล้วกดรีเฟรช`, [[B('🔄 รีเฟรช', `sn:v:${key}`), B('‹ กลับ', 'sn')]]);
  const rr = Math.round(rrOf(p, tp) * 10) / 10;
  await setJSON(pk(chatId), { sym: r.symbol, key: r.key, side, lot, sl: p.sl, tp, n, rr, exp: Date.now() + PEND_MS } satisfies Pend);
  const ic = side === 'BUY' ? '🟢' : '🔴';
  return put(chatId, mid, `⚠️ <b>ยืนยันออเดอร์สไนเปอร์</b>\n${ic} <b>${side}</b> ${esc(r.symbol)} · lot <b>${lot}</b>\nเข้าราคาตลาด (~${f(r, side === 'BUY' ? r.ask : r.bid)})\nSL <b>${f(r, p.sl)}</b> (−${pts(r, p.risk)} pts)\nTP${n} <b>${f(r, tp)}</b> (+${pts(r, Math.abs(tp - p.e))} pts) · <b>RR 1:${rr.toFixed(1)}</b>\n<i>ไม้เดียว กริดไม่แตะ · กดยืนยันภายใน 2 นาที</i>`,
    [[B('✅ ยืนยัน ส่งออเดอร์', 'sn:y', 'success'), B('❌ ยกเลิก', 'sn:x', 'danger')]]);
}

async function send(chatId: string, mid: number, me: Me) {
  const p = await getJSON<Pend | null>(pk(chatId), null);
  if (!p || p.exp < Date.now()) return put(chatId, mid, 'ไม่มีออเดอร์ที่รอยืนยัน (หรือหมดเวลาแล้ว)', [[B('🎯 สไนเปอร์', 'sn')]]);
  await setJSON(pk(chatId), null);   // one-shot: a second tap can never send the same order twice
  const r = await getSnipe(me.acct, p.key);
  const plan = r && (p.side === 'BUY' ? r.buy : r.sell);
  if (!r || !fresh(r) || !plan || Math.abs(plan.sl - p.sl) > r.point || Math.abs(plan.tp[p.n - 1] - p.tp) > r.point)   // the EA's levels moved while the card was open
    return put(chatId, mid, '⚠️ แนวจาก EA เปลี่ยนไปแล้ว (หรือข้อมูลเก่า) ยังไม่ได้ส่งออเดอร์ กดรีเฟรชแล้วเลือกใหม่', [[B('🔄 รีเฟรช', `sn:v:${p.key}`), B('‹ กลับ', 'sn')]]);
  const c = await addCmd({ symbol: p.sym, side: p.side, lot: p.lot, sl: p.sl, tp: p.tp, rr: p.rr, source: 'snipe', mode: 'snipe', noHold: true }, me.acct);
  if (c.status === 'blocked') return put(chatId, mid, `⛔ ออเดอร์ถูกบล็อก: ${esc(c.note ?? '')}`, [[B('‹ กลับ', 'sn')]]);   // addCmd also pushed the reason
  return put(chatId, mid, `📥 ส่งคำสั่งเข้าคิวแล้ว (id ${c.id})\n${p.side === 'BUY' ? '🟢' : '🔴'} <b>${p.side}</b> ${esc(p.sym)} · lot ${p.lot} · SL ${p.sl.toFixed(r.digits)} · TP${p.n} ${p.tp.toFixed(r.digits)} · RR 1:${p.rr.toFixed(1)}\nEA จะเปิดภายในไม่กี่วินาที แล้วบอทแจ้งผลให้`, [[B('🎯 สไนเปอร์', 'sn'), B('‹ เมนูหลัก', 'mn')]]);
}

/* ---------- button router: sn | sn:v:KEY | sn:p:KEY:B|S:1-3 | sn:l:KEY:B|S:1-3:LOT | sn:y | sn:x ---------- */
export async function onSnipeButton(chatId: string, me: Me, mid: number, a: string[]) {
  const [x, key, s, n, lot] = a;
  if (!x) return showSnipe(chatId, me, mid);
  if (x === 'x') { await setJSON(pk(chatId), null); return showSnipe(chatId, me, mid); }
  if (x === 'y') return send(chatId, mid, me);
  if (!/^[A-Z0-9]{3,6}$/.test(key ?? '')) return showSnipe(chatId, me, mid);
  if (x === 'v') return showSnipePair(chatId, me, mid, key);
  if (s !== 'B' && s !== 'S') return showSnipePair(chatId, me, mid, key);
  if (x === 'p') return pickLot(chatId, mid, key, s, Number(n), me);
  if (x === 'l') return confirmCard(chatId, mid, key, s, Number(n), Number(lot), me);
}
