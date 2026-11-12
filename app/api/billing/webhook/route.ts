import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { getUsers } from '@/lib/store';
import { applyPayment, getBillCfg, getPayments, newPayment, savePayments } from '@/lib/billing';
export const dynamic = 'force-dynamic';

// Automatic confirmation for a payment gateway / bank-slip bot / your own script. POST with ?key=BILLING_SECRET (or header x-api-key):
//   { "login": "3030514", "planId": "m1", "txid": "ABC123" }          pays that plan's price and days
//   { "userId": "ab12cd34", "amount": 990, "days": 30, "txid": "..." }  custom amount / days
// txid makes the call idempotent: sending the same txid twice never extends the member twice.
// BILLING_SECRET falls back to WEBHOOK_SECRET when it is not set.
const Body = z.object({
  login: z.string().trim().optional(), userId: z.string().trim().optional(), planId: z.string().trim().optional(),
  amount: z.coerce.number().positive().optional(), days: z.coerce.number().int().min(1).max(3650).optional(),
  txid: z.string().trim().min(3).max(120),
});
const same = (a: string, b?: string) => !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: Request) {
  const key = (req.headers.get('x-api-key') ?? new URL(req.url).searchParams.get('key') ?? '').trim();
  if (!key || !same(key, process.env.BILLING_SECRET || process.env.WEBHOOK_SECRET)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: p.error.issues[0]?.message || 'bad body' }, { status: 400 });
  const b = p.data;
  const cfg = await getBillCfg();
  const users = await getUsers();
  const u = users.find((x) => (b.userId && x.id === b.userId) || (b.login && x.login === b.login.replace(/\D/g, '')));
  if (!u) return Response.json({ error: 'user not found' }, { status: 404 });
  const pays = await getPayments();
  const dup = pays.find((x) => x.method === 'webhook' && x.ref === b.txid);
  if (dup) return Response.json({ ok: true, duplicate: true, id: dup.id, status: dup.status });
  const plan = b.planId ? cfg.plans.find((x) => x.id === b.planId) : undefined;
  if (b.planId && !plan) return Response.json({ error: 'plan not found' }, { status: 404 });
  const days = b.days ?? plan?.days, amount = b.amount ?? plan?.price;
  if (!days || amount === undefined) return Response.json({ error: 'give planId, or amount + days' }, { status: 400 });
  const pay = newPayment(u, { id: plan?.id ?? 'custom', name: plan?.name ?? `${days} วัน`, price: amount, days }, cfg, 'webhook', b.txid, { amount });
  const r = await applyPayment(pay, cfg);
  if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
  await savePayments([pay, ...pays]);
  const exp = (await getUsers()).find((x) => x.id === u.id)?.expiresAt;
  return Response.json({ ok: true, id: pay.id, expiresAt: exp, commission: pay.commission ?? 0 });
}
