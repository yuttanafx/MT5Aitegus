import { pickAcct, who } from '@/lib/auth';
import { analyze, chat, macro, MACRO_RE, MARKET_RE, NEWS_RE } from '@/lib/ai';
import { clock, newsView } from '@/lib/news';
import { ak, getCmds, getJSON, getSettings } from '@/lib/store';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const me = await who(req);
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  // the real error is shown to the admin only (to find out what is wrong); other users get the generic text
  const detail = (e: any) => (me.role === 'admin' ? `\n[สาเหตุ: ${String(e?.message ?? e).slice(0, 220)}]` : '');
  const { message } = await req.json().catch(() => ({ message: '' }));
  if (!message || typeof message !== 'string') return Response.json({ error: 'bad body' }, { status: 400 });
  const acct = await pickAcct(req, me);
  const [cmds, decision, settings] = await Promise.all([getCmds(acct), getJSON<any>(ak('decision', acct), null), getSettings()]);
  let newsCtx = '';
  try { // upcoming events + guard status, so every answer (market, macro, news) can take the news into account
    const syms = await getJSON<string[]>('symbols', []);
    const nv = await newsView(settings, syms.length ? syms : [decision?.symbol ?? 'XAUUSD']);
    const act = nv.groups.find((g) => g.active);
    newsCtx = `\nข่าวสำคัญที่กำลังจะมา (เวลาไทย): ${JSON.stringify(nv.upcoming.slice(0, 5).map((e) => ({ สกุลเงิน: e.cur, ข่าว: e.title, เวลา: clock(e.ts), ค่าคาดการณ์: e.forecast, ค่าก่อนหน้า: e.previous })))}` +
      `\nระบบหยุดเปิดออเดอร์ช่วงข่าว: ${act ? 'กำลังหยุดอยู่เพราะ ' + act.active!.title : nv.enabled ? 'ปกติ' : 'ปิดอยู่'} (หยุดก่อนข่าว ${nv.before} นาที หลังข่าว ${nv.after} นาที) สถานะปฏิทินข่าว: ${nv.status}`;
  } catch {}
  const ctx = `ข้อมูลระบบ:\nระบบ${settings.paused ? 'ถูกหยุดชั่วคราว' : 'ทำงานปกติ'}\nการตัดสินใจล่าสุดของ AI: ${decision ? JSON.stringify({ symbol: decision.symbol, regime: decision.regime, strategy: decision.strategy, confidence: decision.confidence, reason: decision.reason, passRules: decision.pass, tf: decision.tf, dataSource: decision.src === 'test' ? 'ตัวอย่างจากปุ่มทดสอบ (ไม่ใช่ตลาดจริง)' : decision.src === 'ea' ? 'EA' : decision.src, ageMin: decision.ts ? Math.round((Date.now() - decision.ts) / 60_000) : null, indicators: decision.ind ?? 'ยังไม่มี' }) : 'ยังไม่มี'}\nคำสั่งล่าสุด: ${JSON.stringify(cmds.slice(0, 5).map((c) => ({ symbol: c.symbol, side: c.side, lot: c.lot, status: c.status, note: c.note })))}` + newsCtx;
  // Economic-trend questions go to the macro analyst (live search when the provider supports it).
  // Everything else is answered exactly as before.
  if (MACRO_RE.test(message) || NEWS_RE.test(message)) {
    try {
      const r = await macro(message.slice(0, 500), ctx, { tech: MARKET_RE.test(message), news: NEWS_RE.test(message) }); // "analyse the market + economy" = technical read first
      return Response.json({ text: r.text, provider: r.provider, live: r.live });
    } catch (e) {
      return Response.json({ text: 'วิเคราะห์เศรษฐกิจไม่สำเร็จ ตรวจสอบ API key และชื่อโมเดลในหน้า Dashboard (ส่วนผู้ให้บริการ AI)' + detail(e) });
    }
  }
  if (MARKET_RE.test(message)) {
    try {
      const r = await analyze(message.slice(0, 500), ctx);
      return Response.json({ text: r.text, provider: r.provider });
    } catch (e) {
      return Response.json({ text: 'วิเคราะห์ตลาดไม่สำเร็จ ตรวจสอบ API key และชื่อโมเดลในหน้า Dashboard (ส่วนผู้ให้บริการ AI)' + detail(e) });
    }
  }
  try {
    const r = await chat(message.slice(0, 500), ctx);
    return Response.json({ text: r.text, provider: r.provider });
  } catch (e) {
    return Response.json({ text: 'เรียก AI ไม่สำเร็จ ตรวจสอบ API key ในหน้า Dashboard (ส่วนผู้ให้บริการ AI)' + detail(e) });
  }
}
