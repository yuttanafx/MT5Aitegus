import { z } from 'zod';
import { isAdmin, isEA } from '@/lib/auth';
import { decide } from '@/lib/ai';
import { STRATEGIES, evaluate } from '@/lib/strategies';
import { addCmd, getJSON, getSettings, setJSON } from '@/lib/store';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Body = z.object({
  symbol: z.string(), tf: z.string(), price: z.coerce.number(), adx: z.coerce.number(), rsi: z.coerce.number(),
  atr: z.coerce.number().positive(), ema20: z.coerce.number(), ema50: z.coerce.number(),
  execute: z.boolean().optional(), lot: z.coerce.number().optional(),
});
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

// Called by the EA on every closed bar (or from the dashboard for a test run).
// Flow: AI picks the strategy -> server rules check entry -> risk manager -> queue for the EA.
export async function POST(req: Request) {
  if (!isAdmin(req) && !isEA(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'bad body' }, { status: 400 });
  const ind = { ...p.data, symbol: p.data.symbol.toUpperCase() };

  // EA calls are throttled by the interval set in the dashboard (admin test runs are never throttled).
  const fromEA = !isAdmin(req);
  if (fromEA) {
    const [{ intervalMin }, last] = await Promise.all([getSettings(), getJSON<number>('lastrun:' + ind.symbol, 0)]);
    const wait = last + intervalMin * 60_000 - Date.now();
    if (wait > 5_000) return Response.json({ skipped: true, nextInSec: Math.ceil(wait / 1000) });
    await setJSON('lastrun:' + ind.symbol, Date.now());
  }

  const d = await decide(ind);
  const s = STRATEGIES.find((x) => x.id === d.strategy_id);
  const ev = s ? evaluate(s, ind) : null;
  const pass = !!s && !!ev?.passed && d.confidence >= Number(process.env.MIN_CONFIDENCE ?? 0.6);

  let cmdId: string | undefined;
  if (pass && p.data.execute && s) {
    const buy = s.side === 'BUY';
    const cmd = await addCmd({
      symbol: ind.symbol, side: s.side, lot: p.data.lot ?? 0.01, source: 'ai',
      sl: r5(ind.price + (buy ? -1.5 : 1.5) * ind.atr), tp: r5(ind.price + (buy ? 2.5 : -2.5) * ind.atr),
    });
    cmdId = cmd.id;
  }
  const out = { ...d, symbol: ind.symbol, tf: ind.tf, ts: Date.now(), strategy: s?.name ?? 'ไม่เทรด', eval: ev, pass, cmdId, src: fromEA ? 'ea' : 'test' };
  await setJSON('decision', out);
  return Response.json(out);
}
