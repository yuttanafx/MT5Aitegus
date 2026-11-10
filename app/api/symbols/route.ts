import { z } from 'zod';
import { pickAcct, who } from '@/lib/auth';
import { removePair, removeStale } from '@/lib/pairs';
export const dynamic = 'force-dynamic';

// Delete an old pair from the dashboard list (trend row + sniper row + scan snapshot), or every pair that has gone quiet.
// Body: { key: "XAUUSD" } or { stale: true }. Members only touch their own account (pickAcct), the admin can pick one with x-acct.
const Body = z.object({ key: z.string().regex(/^[A-Za-z0-9]{3,6}$/).optional(), stale: z.boolean().optional(), minutes: z.coerce.number().min(5).max(1440).optional() });

export async function DELETE(req: Request) {
  const me = await who(req);
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success || (!p.data.key && !p.data.stale)) return Response.json({ error: 'bad body' }, { status: 400 });
  const acct = await pickAcct(req, me);
  if (p.data.key) { await removePair(acct, p.data.key.toUpperCase()); return Response.json({ ok: true, removed: 1 }); }
  return Response.json({ ok: true, removed: await removeStale(acct, (p.data.minutes ?? 30) * 60_000) });
}
