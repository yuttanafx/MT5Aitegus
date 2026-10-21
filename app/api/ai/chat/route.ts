import { who } from '@/lib/auth';
import { chat, macro, MACRO_RE } from '@/lib/ai';
import { getCmds, getJSON, getSettings } from '@/lib/store';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const me = await who(req);
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  // the real error is shown to the admin only (to find out what is wrong); other users get the generic text
  const detail = (e: any) => (me.role === 'admin' ? `\n[สาเหตุ: ${String(e?.message ?? e).slice(0, 220)}]` : '');
  const { message } = await req.json().catch(() => ({ message: '' }));
  if (!message || typeof message !== 'string') return Response.json({ error: 'bad body' }, { status: 400 });
  const [cmds, decision, settings] = await Promise.all([getCmds(), getJSON<any>('decision', null), getSettings()]);
  const ctx = `ข้อมูลระบบ:\nระบบ${settings.paused ? 'ถูกหยุดชั่วคราว' : 'ทำงานปกติ'}\nการตัดสินใจล่าสุดของ AI: ${decision ? JSON.stringify({ symbol: decision.symbol, regime: decision.regime, strategy: decision.strategy, confidence: decision.confidence, reason: decision.reason, passRules: decision.pass }) : 'ยังไม่มี'}\nคำสั่งล่าสุด: ${JSON.stringify(cmds.slice(0, 5).map((c) => ({ symbol: c.symbol, side: c.side, lot: c.lot, status: c.status, note: c.note })))}`;
  // Economic-trend questions go to the macro analyst (live search when the provider supports it).
  // Everything else is answered exactly as before.
  if (MACRO_RE.test(message)) {
    try {
      const r = await macro(message.slice(0, 500), ctx);
      return Response.json({ text: r.text, provider: r.provider, live: r.live });
    } catch (e) {
      return Response.json({ text: 'วิเคราะห์เศรษฐกิจไม่สำเร็จ ตรวจสอบ API key และชื่อโมเดลในหน้า Dashboard (ส่วนผู้ให้บริการ AI)' + detail(e) });
    }
  }
  try {
    const r = await chat(message.slice(0, 500), ctx);
    return Response.json({ text: r.text, provider: r.provider });
  } catch (e) {
    return Response.json({ text: 'เรียก AI ไม่สำเร็จ ตรวจสอบ API key ในหน้า Dashboard (ส่วนผู้ให้บริการ AI)' + detail(e) });
  }
}
