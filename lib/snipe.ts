import { ak, delKey, getJSON, getMany, setJSON } from './store';
import { symKey } from './regime';
import { getScan, type ScanSnap } from './scan';

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

// Rows built from the EA's Market Scan snapshot: every pair the EA scans carries its sniper plans (same SL / TP / RR rules), in ONE Redis value.
export function scanSnipeRows(snap: ScanSnap | null): SnipeRow[] {
  if (!snap) return [];
  const out: SnipeRow[] = [];
  for (const it of snap.items) {
    if (!it.rr || it.digits === undefined || !it.point) continue;   // an EA without the sniper part sends no plans
    out.push({
      symbol: it.symbol.toUpperCase(), key: symKey(it.symbol), ts: snap.ts, tf: it.snTf ?? snap.tf, digits: it.digits, point: it.point,
      bid: it.bid, ask: it.ask, sup: it.snSup ?? 0, res: it.snRes ?? 0, rr: it.rr, buy: it.buy, sell: it.sell, stopLevel: it.stopLevel,
    });
  }
  return out;
}

// the newer of the pair's own row (chart push) and the scan row wins
export async function getSnipe(acct: string, key: string): Promise<SnipeRow | null> {
  const k = symKey(key);
  const [own, scan] = await Promise.all([getJSON<SnipeRow | null>(ak('snipe:' + k, acct), null), getScan(acct)]);
  const sc = scanSnipeRows(scan).find((r) => r.key === k) ?? null;
  return own && sc ? (sc.ts >= own.ts ? sc : own) : own ?? sc;
}

export async function removeSnipe(acct: string, key: string) {
  const id = acct + ':' + key;
  const idx = await getJSON<string[]>(ak('snipeidx', acct), []);
  if (idx.includes(key)) await setJSON(ak('snipeidx', acct), idx.filter((k) => k !== key));
  await delKey(ak('snipe:' + key, acct));
  knownIdx.delete(id); lastRow.delete(id);
}

export async function listSnipe(acct: string): Promise<SnipeRow[]> {
  const [idx, scan] = await Promise.all([getJSON<string[]>(ak('snipeidx', acct), []), getScan(acct)]);
  const own = idx.length ? (await getMany<SnipeRow>(idx.map((k) => ak('snipe:' + k, acct)))).filter((x): x is SnipeRow => !!x) : [];
  const by = new Map(own.map((r) => [r.key, r]));
  for (const r of scanSnipeRows(scan)) { const o = by.get(r.key); if (!o || r.ts >= o.ts) by.set(r.key, r); }
  return [...by.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export const SNIPE_FRESH_MS = 4 * 60_000;   // older than this = the EA is not sending any more: do not trade on old levels
