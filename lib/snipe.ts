import { ak, getJSON, getMany, setJSON } from './store';
import { symKey } from './regime';

// Support / resistance + RR plan that the SmartGold EA computes on its chart (same numbers as its "S/R + RR" button).
// One row per symbol per account. The Telegram "สไนเปอร์" screen reads it; nothing here sends an order.
export type Plan = { e: number; sl: number; tp: number[]; risk: number };   // entry (ask for BUY / bid for SELL), stop loss, TP1..TP3, risk distance (price units)
export type SnipeRow = {
  symbol: string; key: string; ts: number; tf: string; digits: number; point: number;
  bid: number; ask: number; sup: number; res: number; rr: number[];            // rr = the R multiples used for TP1..TP3
  buy?: Plan; sell?: Plan;                                                      // missing = the EA found no level to put the stop behind
  stopLevel?: number;                                                           // broker minimum SL/TP distance, in price units
};

const lastRow = ((globalThis as any).__hubsnipe ??= new Map<string, { sig: string; ts: number }>()) as Map<string, { sig: string; ts: number }>;
const knownIdx = ((globalThis as any).__hubsnipeidx ??= new Set<string>()) as Set<string>;

// The EA pushes about once a minute and the row carries the price, so it is written on every push (~43,000 Redis commands a month per pair
// at the default 60 s; raise Sn_PushSec in the EA to 120 on the free Upstash plan). Only pushes that come faster than 50 s are skipped
// when nothing changed. The EA re-checks the live price before it opens anything, so a few seconds of price age here is not a risk.
export async function saveSnipe(acct: string, r: Omit<SnipeRow, 'key' | 'ts'>) {
  const key = symKey(r.symbol);
  if (!key) return;
  const id = acct + ':' + key, sig = JSON.stringify([r.sup, r.res, r.buy, r.sell, r.tf]), prev = lastRow.get(id);
  if (!(prev && prev.sig === sig && Date.now() - prev.ts < 50_000)) {
    await setJSON(ak('snipe:' + key, acct), { ...r, key, ts: Date.now() });
    if (lastRow.size > 500) lastRow.clear();
    lastRow.set(id, { sig, ts: Date.now() });
  }
  if (!knownIdx.has(id)) {
    const idx = await getJSON<string[]>(ak('snipeidx', acct), []);
    if (!idx.includes(key)) await setJSON(ak('snipeidx', acct), [...idx, key].slice(-30));
    knownIdx.add(id);
  }
}

export const getSnipe = (acct: string, key: string) => getJSON<SnipeRow | null>(ak('snipe:' + symKey(key), acct), null);

export async function listSnipe(acct: string): Promise<SnipeRow[]> {
  const idx = await getJSON<string[]>(ak('snipeidx', acct), []);
  if (!idx.length) return [];
  const rows = await getMany<SnipeRow>(idx.map((k) => ak('snipe:' + k, acct)));
  return rows.filter((x): x is SnipeRow => !!x).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export const SNIPE_FRESH_MS = 4 * 60_000;   // older than this = the EA is not sending any more: do not trade on old levels
