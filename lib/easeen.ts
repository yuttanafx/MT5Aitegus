import { ak, every, getJSON, setJSON } from './store';
import { symKey } from './regime';
import type { Cmd } from './types';

// EA liveness for the web order queue. The poll route stamps "an EA asked for orders on <symbol> just now" at most once a minute
// (one small write), so when an order is queued the web can tell at once whether anybody is there to take it.
export async function markPoll(acct: string, keys: string[]) {
  for (const k of keys) if (every('pollAt:' + acct + ':' + k, 60_000)) await setJSON(ak('pollAt:' + k, acct), Date.now());
}
export async function pollAgeSec(acct: string, symbol: string): Promise<number | null> {
  const ts = await getJSON<number>(ak('pollAt:' + symKey(symbol), acct), 0);
  return ts ? Math.max(0, Math.round((Date.now() - ts) / 1000)) : null;
}
// note for an order that has nobody to take it (age = seconds since this symbol's EA last polled, null = never seen)
export const offlineNote = (age: number | null) => (age === null ? 'ea:never' : `ea:offline:${Math.max(1, Math.round(age / 60))}`);

// Orders that stay "pending" with no EA polling, or "sent" with no report back, are closed as failed with the reason, and the account is told.
// Called when a dashboard refreshes, when the Telegram order list is opened and when a new order is queued, so a dead EA never leaves an order waiting silently.
export async function sweepStale(cmds: Cmd[], acct: string): Promise<Cmd[]> {
  const now = Date.now();
  const hit = cmds.filter((c) => (c.status === 'pending' && now - c.ts > 150_000 && (!c.holdUntil || now > c.holdUntil + 30_000)) || (c.status === 'sent' && now - c.ts > 180_000));
  if (!hit.length) return [];
  const ages = new Map<string, number | null>();
  for (const c of hit) {
    if (c.status === 'sent') { c.status = 'failed'; c.note = 'exp:noreport'; continue; }
    const k = symKey(c.symbol);
    if (!ages.has(k)) ages.set(k, await pollAgeSec(acct, c.symbol));
    c.status = 'failed'; c.note = offlineNote(ages.get(k) ?? null);
  }
  const { saveCmds } = await import('./store');
  await saveCmds(cmds, acct);
  try { const { notifyCmd } = await import('./telegram'); for (const c of hit) await notifyCmd(c, acct); } catch {}
  return hit;
}
