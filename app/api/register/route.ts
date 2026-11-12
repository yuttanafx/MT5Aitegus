import { z } from 'zod';
import { randomBytes, randomUUID } from 'crypto';
import { hashPw } from '@/lib/auth';
import { getJSON, getUsers, saveUsers, setJSON } from '@/lib/store';
import { DAY, ensureRefCode, findByCode, getBillCfg } from '@/lib/billing';
import type { User } from '@/lib/types';
export const dynamic = 'force-dynamic';

// Public self-registration (the page a referral link opens). One member = one MT5 account number = one EA key, exactly like
// the accounts the admin creates by hand. Password + EA key are shown ONCE. The admin can switch registration off (billing settings).
const Body = z.object({
  name: z.string().trim().min(1).max(40),
  login: z.string().trim().regex(/^\d{4,12}$/, 'เลขบัญชี MT5 ต้องเป็นตัวเลข 4-12 หลัก'),
  ref: z.string().trim().max(20).optional(),
});

export async function GET(req: Request) {
  const cfg = await getBillCfg();
  const code = new URL(req.url).searchParams.get('ref');
  const r = code ? findByCode(await getUsers(), code) : undefined;
  return Response.json({ allow: cfg.allowSignup, trialDays: cfg.trialDays, refValid: !!r });
}

export async function POST(req: Request) {
  const cfg = await getBillCfg();
  if (!cfg.allowSignup) return Response.json({ error: 'ปิดรับสมัครสมาชิกใหม่ชั่วคราว' }, { status: 403 });
  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const fk = 'regfail:' + ip; // 5 registrations per IP per hour
  const f = await getJSON<{ n: number; ts: number }>(fk, { n: 0, ts: 0 });
  const live = Date.now() - f.ts < 3600_000;
  if (live && f.n >= 5) return Response.json({ error: 'สมัครบ่อยเกินไป รอสักครู่แล้วลองใหม่' }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: p.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  const users = await getUsers();
  if (users.length >= 500) return Response.json({ error: 'ผู้ใช้เต็มแล้ว ติดต่อผู้ดูแล' }, { status: 400 });
  if (users.some((x) => x.login === p.data.login)) return Response.json({ error: 'เลขบัญชีนี้ลงทะเบียนแล้ว' }, { status: 400 });
  await setJSON(fk, { n: live ? f.n + 1 : 1, ts: live ? f.ts : Date.now() });
  const referrer = findByCode(users, p.data.ref);   // an unknown / mistyped code is simply ignored
  const password = randomBytes(12).toString('base64url'), eaKey = 'ea_' + randomBytes(18).toString('base64url');
  const u: User = { id: randomUUID().slice(0, 8), name: p.data.name, hash: hashPw(password), createdAt: Date.now(), login: p.data.login, keyHash: hashPw(eaKey) };
  if (referrer) u.refBy = referrer.id;
  if (cfg.trialDays > 0) u.expiresAt = Date.now() + cfg.trialDays * DAY;
  ensureRefCode(users, u);
  users.push(u);
  await saveUsers(users);
  return Response.json({ name: u.name, login: u.login, password, eaKey, trialDays: cfg.trialDays, referredBy: !!referrer });
}
