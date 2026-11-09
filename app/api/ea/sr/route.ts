import { z } from 'zod';
import { eaAuth } from '@/lib/auth';
import { saveSnipe } from '@/lib/snipe';
export const dynamic = 'force-dynamic';

// The SmartGold EA sends the support / resistance + RR plan it computes for its chart symbol (about once a minute).
// Both sides are sent, so the Telegram sniper screen can offer BUY and SELL with their own SL / TP1-3.
const Plan = z.object({ e: z.coerce.number(), sl: z.coerce.number(), tp: z.array(z.coerce.number()).length(3), risk: z.coerce.number().positive() });
const Body = z.object({
  symbol: z.string().min(3).max(32), tf: z.string().max(8),
  digits: z.coerce.number().int().min(0).max(8), point: z.coerce.number().positive(),
  bid: z.coerce.number().positive(), ask: z.coerce.number().positive(),
  sup: z.coerce.number().min(0), res: z.coerce.number().min(0),
  rr: z.array(z.coerce.number().positive()).length(3),
  buy: Plan.optional(), sell: Plan.optional(),
  stopLevel: z.coerce.number().min(0).optional(),
});

export async function POST(req: Request) {
  const a = await eaAuth(req);
  if (!a.ok) return new Response(a.msg, { status: a.status });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response('bad body', { status: 400 });
  await saveSnipe(a.acct, { ...p.data, symbol: p.data.symbol.toUpperCase() });
  return new Response('ok=1', { headers: { 'content-type': 'text/plain' } });
}
