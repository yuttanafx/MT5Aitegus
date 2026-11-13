import { z } from 'zod';
import { pickAcct, who } from '@/lib/auth';
import { getMany } from '@/lib/store';
import { getAllowed, saveSystems, seenKey, sysKey, normSystems } from '@/lib/systems';
export const dynamic = 'force-dynamic';

// The dashboard switch: which EA(s) may open new trades. Admin can set any account (x-acct), a member only their own.
// `multi` = allow several sniper orders on the same pair (own switch; can be sent alone).
const Body = z.object({ sg: z.boolean().optional(), sr: z.boolean().optional(), multi: z.boolean().optional() });

async function view(acct: string) {
  const [sys, seenSg, seenSr] = await getMany<any>([sysKey(acct), seenKey('sg', acct), seenKey('sr', acct)]);
  const allowed = await getAllowed(acct);
  const sw = normSystems(sys);
  return { systems: { sg: sw.sg && allowed.sg, sr: sw.sr && allowed.sr, multi: sys?.multi === true }, allowed, seen: { sg: seenSg?.ts ?? null, sr: seenSr?.ts ?? null }, srInfo: seenSr ? { symbol: seenSr.symbol ?? '', ver: seenSr.ver ?? '', eq: seenSr.eq ?? null, pos: seenSr.pos ?? null } : null };
}

export async function GET(req: Request) {
  const me = await who(req);
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json(await view(await pickAcct(req, me)));
}

export async function POST(req: Request) {
  const me = await who(req);
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'bad body' }, { status: 400 });
  const touchSys = p.data.sg !== undefined || p.data.sr !== undefined;
  if (touchSys && !p.data.sg && !p.data.sr) return Response.json({ error: 'ต้องเปิดอย่างน้อย 1 ระบบ (ถ้าต้องการหยุดทั้งหมดให้ใช้ปุ่มหยุดชั่วคราวของ AI)' }, { status: 400 });
  const acct = await pickAcct(req, me);
  const al = await getAllowed(acct);
  if (touchSys && ((p.data.sg && !al.sg) || (p.data.sr && !al.sr))) return Response.json({ error: 'บัญชีนี้ไม่ได้รับสิทธิ์ใช้ระบบนั้น (ผู้ดูแลเป็นผู้กำหนดสิทธิ์)' }, { status: 403 });
  await saveSystems(acct, p.data);
  return Response.json(await view(acct));
}
