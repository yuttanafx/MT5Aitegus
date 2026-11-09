import { z } from 'zod';
import { eaAuth } from '@/lib/auth';
import { every, setJSON } from '@/lib/store';
import { getSystems, seenKey } from '@/lib/systems';
export const dynamic = 'force-dynamic';

// Heartbeat of the SR Breakout EA. Same authentication as the SmartGold EA (x-api-key + x-account), so a wrong key
// is rejected here (401 / 403) and the dashboard shows the EA online as soon as a ping gets through.
// Reply = plain text lines. `on=1` means the dashboard switch lets this EA open new trades, `on=0` means it must not.
const Body = z.object({
  sys: z.literal('sr'),
  symbol: z.string().max(32).optional(),
  ver: z.string().max(16).optional(),
  bal: z.coerce.number().optional(),
  eq: z.coerce.number().optional(),
  pos: z.coerce.number().int().min(0).max(500).optional(),
});

export async function POST(req: Request) {
  const a = await eaAuth(req);
  if (!a.ok) return new Response(a.msg, { status: a.status });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response('bad body', { status: 400 });
  if (every('seen:sr:' + a.acct, 25_000)) await setJSON(seenKey('sr', a.acct), { ts: Date.now(), symbol: p.data.symbol ?? '', ver: p.data.ver ?? '', eq: p.data.eq ?? null, pos: p.data.pos ?? null });
  const s = await getSystems(a.acct);
  return new Response(['ok=1', `on=${s.sr ? 1 : 0}`, `sg=${s.sg ? 1 : 0}`, `sr=${s.sr ? 1 : 0}`].join('\n'), { headers: { 'content-type': 'text/plain' } });
}
