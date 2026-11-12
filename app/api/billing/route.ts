import { z } from 'zod';
import { who } from '@/lib/auth';
import { getUsers, saveUsers } from '@/lib/store';
import { DAY, applyPayment, ensureRefCode, getBillCfg, getPayments, newPayment, refStats, saveBillCfg, savePayments, subOf, type BillCfg, type Payment } from '@/lib/billing';
export const dynamic = 'force-dynamic';

const PlanZ = z.object({ id: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/), name: z.string().trim().min(1).max(40), price: z.coerce.number().min(0).max(10_000_000), days: z.coerce.number().int().min(1).max(3650), active: z.boolean() });
const CfgZ = z.object({
  enforce: z.boolean(), currency: z.string().trim().min(1).max(8), plans: z.array(PlanZ).max(12),
  defaultRefPct: z.coerce.number().min(0).max(100), refRecurring: z.boolean(), allowSignup: z.boolean(),
  trialDays: z.coerce.number().int().min(0).max(365), payInfo: z.string().max(2000), contact: z.string().max(300),
});
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pay'), planId: z.string(), ref: z.string().max(200).optional() }),                       // member: "I paid" (waits for the admin)
  z.object({ action: z.literal('saveCfg'), cfg: CfgZ }),                                                                  // admin
  z.object({ action: z.literal('approve'), id: z.string() }),
  z.object({ action: z.literal('reject'), id: z.string() }),
  z.object({ action: z.literal('grant'), userId: z.string(), days: z.coerce.number().int().min(-3650).max(3650) }),       // admin: add (or remove) days by hand
  z.object({ action: z.literal('grantAll'), days: z.coerce.number().int().min(1).max(3650) }),                           // admin: give every member N days (migration)
  z.object({ action: z.literal('setUser'), userId: z.string(), free: z.boolean().optional(), refPct: z.coerce.number().min(0).max(100).nullable().optional() }),
  z.object({ action: z.literal('payout'), userId: z.string(), amount: z.coerce.number().positive().max(100_000_000) }),   // admin: commission paid to a referrer
]);

const siteOrigin = (req: Request) => { const h = req.headers; const host = h.get('x-forwarded-host') || h.get('host') || ''; const proto = h.get('x-forwarded-proto') || 'https'; return host ? `${proto}://${host}` : new URL(req.url).origin; };

async function view(req: Request, me: NonNullable<Awaited<ReturnType<typeof who>>>) {
  const [cfg, pays, users] = await Promise.all([getBillCfg(), getPayments(), getUsers()]);
  const pub = { currency: cfg.currency, plans: cfg.plans.filter((p) => p.active), payInfo: cfg.payInfo, contact: cfg.contact, enforce: cfg.enforce, allowSignup: cfg.allowSignup, defaultRefPct: cfg.defaultRefPct, refRecurring: cfg.refRecurring };
  if (me.role === 'admin') return { role: 'admin', cfg, pending: pays.filter((p) => p.status === 'pending'), recent: pays.filter((p) => p.status !== 'pending').slice(0, 30), revenue: Math.round(pays.filter((p) => p.status === 'approved').reduce((a, p) => a + p.amount, 0) * 100) / 100, origin: siteOrigin(req) };
  const u = users.find((x) => x.id === me.id);
  if (!u) return { role: 'user', ...pub };
  if (ensureRefCode(users, u)) await saveUsers(users);
  const mine = users.filter((x) => x.refBy === u.id).map((x) => ({ name: x.name.slice(0, 1) + '***', ts: x.createdAt, paying: pays.some((p) => p.userId === x.id && p.status === 'approved') })).sort((a, b) => b.ts - a.ts).slice(0, 50);
  return { role: 'user', ...pub, sub: subOf(u, cfg), refCode: u.refCode, refPct: typeof u.refPct === 'number' ? u.refPct : cfg.defaultRefPct, refStats: refStats(users, pays, u), referred: mine, origin: siteOrigin(req), payments: pays.filter((p) => p.userId === u.id).slice(0, 20), earnings: pays.filter((p) => p.refBy === u.id && p.status === 'approved').slice(0, 20).map((p) => ({ ts: p.ts, amount: p.commission ?? 0, who: p.userName.slice(0, 1) + '***' })) };
}

export async function GET(req: Request) {
  const me = await who(req);
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (me.role === 'user' && !me.id) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json(await view(req, me));
}

export async function POST(req: Request) {
  const me = await who(req);
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: p.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  const b = p.data;
  const cfg = await getBillCfg();

  if (b.action === 'pay') {
    if (me.role !== 'user' || !me.id) return Response.json({ error: 'เฉพาะสมาชิก' }, { status: 400 });
    const plan = cfg.plans.find((x) => x.id === b.planId && x.active);
    if (!plan) return Response.json({ error: 'ไม่พบแพ็กเกจ' }, { status: 400 });
    const u = (await getUsers()).find((x) => x.id === me.id);
    if (!u) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const pays = await getPayments();
    if (pays.filter((x) => x.userId === u.id && x.status === 'pending').length >= 3) return Response.json({ error: 'มีรายการรอตรวจสอบหลายรายการแล้ว รอผู้ดูแลยืนยันก่อน' }, { status: 400 });
    await savePayments([newPayment(u, plan, cfg, 'manual', b.ref ?? ''), ...pays]);
    return Response.json(await view(req, me));
  }

  if (me.role !== 'admin') return Response.json({ error: 'unauthorized' }, { status: 401 });

  if (b.action === 'saveCfg') {
    const ids = b.cfg.plans.map((x) => x.id);
    if (new Set(ids).size !== ids.length) return Response.json({ error: 'รหัสแพ็กเกจซ้ำกัน' }, { status: 400 });
    await saveBillCfg({ ...cfg, ...b.cfg } as BillCfg);
    return Response.json(await view(req, me));
  }
  if (b.action === 'approve' || b.action === 'reject') {
    const pays = await getPayments();
    const pay = pays.find((x) => x.id === b.id);
    if (!pay || pay.status !== 'pending') return Response.json({ error: 'ไม่พบรายการที่รออยู่' }, { status: 404 });
    if (b.action === 'reject') { pay.status = 'rejected'; pay.decidedAt = Date.now(); }
    else { const r = await applyPayment(pay, cfg); if (!r.ok) return Response.json({ error: r.error }, { status: 404 }); }
    await savePayments(pays);
    return Response.json(await view(req, me));
  }
  const users = await getUsers();
  if (b.action === 'grantAll') {
    for (const u of users) u.expiresAt = Math.max(Date.now(), u.expiresAt ?? 0) + b.days * DAY;
    await saveUsers(users);
    return Response.json({ ...(await view(req, me)), changed: users.length });
  }
  const u = users.find((x) => x.id === b.userId);
  if (!u) return Response.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
  if (b.action === 'grant') {
    // adding days starts from max(now, current expiry); removing days subtracts from the current expiry (can lock the member at once)
    u.expiresAt = b.days >= 0 ? Math.max(Date.now(), u.expiresAt ?? 0) + b.days * DAY : Math.max(0, (u.expiresAt ?? Date.now()) + b.days * DAY);
    await saveUsers(users);
  } else if (b.action === 'setUser') {
    if (b.free !== undefined) u.free = b.free;
    if (b.refPct !== undefined) u.refPct = b.refPct;
    await saveUsers(users);
  } else if (b.action === 'payout') {
    const st = refStats(users, await getPayments(), u);
    if (b.amount > st.owed + 0.005) return Response.json({ error: `จ่ายเกินยอดค้างจ่าย (ค้างจ่าย ${st.owed})` }, { status: 400 });
    u.refPaid = Math.round(((u.refPaid ?? 0) + b.amount) * 100) / 100;
    await saveUsers(users);
  }
  return Response.json(await view(req, me));
}
