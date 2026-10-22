import { z } from 'zod';
import { isAdmin, isEA } from '@/lib/auth';
import { decide } from '@/lib/ai';
import { DEFAULT_MAP, STRATEGIES, evaluate, type Strategy } from '@/lib/strategies';
import { addCmd, getJSON, getSettings, setJSON } from '@/lib/store';
import type { Mkt } from '@/lib/types';
import { newsFor, newsText, noteSymbol } from '@/lib/news';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Body = z.object({
  symbol: z.string(), tf: z.string(), price: z.coerce.number(), adx: z.coerce.number(), rsi: z.coerce.number(),
  atr: z.coerce.number().positive(), ema20: z.coerce.number(), ema50: z.coerce.number(),
  execute: z.boolean().optional(), lot: z.coerce.number().optional(),
});
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

// Called by the EA (or from the dashboard for a test run).
// Flow: AI names the market regime -> strategies mapped to that regime are pulled in -> server rules check entry
//       -> risk manager -> queue for the EA.
export async function POST(req: Request) {
  if (!isAdmin(req) && !isEA(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'bad body' }, { status: 400 });
  const ind = { ...p.data, symbol: p.data.symbol.toUpperCase() };
  const settings = await getSettings();

  // EA calls are throttled by the interval set in the dashboard (admin test runs are never throttled).
  const fromEA = !isAdmin(req);
  if (fromEA) {
    const last = await getJSON<number>('lastrun:' + ind.symbol, 0);
    const wait = last + settings.intervalMin * 60_000 - Date.now();
    if (wait > 5_000) return Response.json({ skipped: true, nextInSec: Math.ceil(wait / 1000) });
    await setJSON('lastrun:' + ind.symbol, Date.now());
  }

  await noteSymbol(ind.symbol);
  const nw = await newsFor(ind.symbol, settings);   // strong news near this symbol -> no AI call, regime = news (no strategies mapped = no trade)
  const d = nw.active ? { regime: 'news' as const, confidence: 1, reason: newsText(nw), provider: null as any, model: 'news-guard' } : await decide(ind);

  // Strategies for this regime (an empty list = do not trade in this regime).
  const ids = settings.map?.[d.regime] ?? DEFAULT_MAP[d.regime] ?? [];
  const cands = ids.map((id) => STRATEGIES.find((x) => x.id === id)).filter(Boolean) as Strategy[];
  const evals = cands.map((s) => ({ s, ev: evaluate(s, ind) }));
  const okCount = (e: (typeof evals)[number]) => e.ev.results.filter((r) => r.ok).length;
  const best = evals.find((e) => e.ev.passed) ?? [...evals].sort((a, b) => okCount(b) - okCount(a))[0];
  const s = best?.s;
  const ev = best?.ev ?? null;
  const pass = !!s && !!ev?.passed && d.confidence >= Number(process.env.MIN_CONFIDENCE ?? 0.6);

  const snap = { price: ind.price, adx: ind.adx, rsi: ind.rsi, atr: ind.atr, ema20: ind.ema20, ema50: ind.ema50 };
  let cmdId: string | undefined;
  if (pass && p.data.execute && s) {
    const buy = s.side === 'BUY';
    const cmd = await addCmd({
      symbol: ind.symbol, side: s.side, lot: p.data.lot ?? 0.01, source: 'ai',
      mkt: { regime: d.regime, confidence: d.confidence, strategy: s.name, reason: d.reason, tf: ind.tf, ts: Date.now(), ind: snap } as Mkt,
      sl: r5(ind.price + (buy ? -1.5 : 1.5) * ind.atr), tp: r5(ind.price + (buy ? 2.5 : -2.5) * ind.atr),
    });
    cmdId = cmd.id;
  }
  const out = {
    ...d, symbol: ind.symbol, tf: ind.tf, ts: Date.now(), strategy_id: s?.id ?? 'no_trade', strategy: s?.name ?? 'ไม่เทรด',
    candidates: cands.map((c) => c.name), eval: ev, pass, cmdId, src: fromEA ? 'ea' : 'test', ind: snap, newsGuard: !!nw.active,
  };
  await setJSON('decision', out);
  return Response.json(out);
}
