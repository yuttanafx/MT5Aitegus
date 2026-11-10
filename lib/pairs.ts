import { ak, delKey, getJSON } from './store';
import { listSymRows, removeSymRow } from './regime';
import { listSnipe, removeSnipe } from './snipe';
import { getScan, removeScanItem } from './scan';

// Delete a pair from everything the dashboard and the Telegram menus list: trend row, sniper row and the Market Scan snapshot.
// Nothing is blocked: if an EA still reports the pair it reappears with its next push, so the way to retire a pair for good is to take it out of the EA's list.
export async function removePair(acct: string, key: string) {
  await Promise.all([removeSymRow(acct, key), removeSnipe(acct, key), removeScanItem(acct, key)]);
}

// Delete every pair whose data is older than maxAgeMs (the EA is no longer sending it).
export async function removeStale(acct: string, maxAgeMs: number): Promise<number> {
  const now = Date.now();
  const [rows, snipes, scan] = await Promise.all([listSymRows(acct), listSnipe(acct), getScan(acct)]);
  const stale = new Set<string>();
  for (const r of rows) if (now - r.ts > maxAgeMs) stale.add(r.key);
  for (const r of snipes) if (now - r.ts > maxAgeMs) stale.add(r.key);
  if (scan && now - scan.ts > maxAgeMs) { await delKey(ak('scan', acct)); for (const it of scan.items) stale.add(it.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); }
  for (const k of stale) await removePair(acct, k);
  return stale.size;
}
