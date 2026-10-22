import { decide } from './ai';
import { getJSON, setJSON } from './store';
import type { Ind } from './strategies';

type D = Awaited<ReturnType<typeof decide>>;

// The market regime belongs to the market, not to an account: one AI call is shared by every account that asks about
// the same symbol and timeframe within ~80% of the interval, so more users do not mean more AI cost.
export async function regimeFor(ind: Ind & { symbol: string; tf: string }, intervalMin: number): Promise<D> {
  const k = `regime:${ind.symbol}:${ind.tf}`;
  const c = await getJSON<{ ts: number; d: D } | null>(k, null);
  if (c && Date.now() - c.ts < intervalMin * 48_000) return c.d;
  const d = await decide(ind);
  if (d.confidence > 0) await setJSON(k, { ts: Date.now(), d });
  return d;
}
