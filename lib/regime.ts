import { decide } from './ai';
import { ak, getJSON, setJSON } from './store';
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

// ---- Market regime reported from outside (TradingView alert -> /api/webhook) ----
// Broker symbols differ (XAUUSD, XAUUSDm, XAUUSD.a ...), so both sides are reduced to the first 6 letters/digits.
export const symKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export type ExtRegime = { regime: string; confidence: number; ts: number; ttl: number };
const extKey = (symbol: string, acct?: string) => ak('xregime:' + symKey(symbol), acct ?? 'all');

// scope: one account, or every account when `acct` is omitted
export async function saveExternalRegime(symbol: string, r: ExtRegime, acct?: string) {
  await setJSON(extKey(symbol, acct), r);
}

// newest still-valid regime for this account (its own signal wins over the all-accounts one when newer)
export async function externalRegime(symbol: string, acct: string): Promise<ExtRegime | null> {
  const [own, all] = await Promise.all([getJSON<ExtRegime | null>(extKey(symbol, acct), null), getJSON<ExtRegime | null>(extKey(symbol), null)]);
  const ok = [own, all].filter((x): x is ExtRegime => !!x && Date.now() - x.ts < x.ttl);
  return ok.sort((a, b) => b.ts - a.ts)[0] ?? null;
}
