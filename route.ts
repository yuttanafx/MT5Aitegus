import { eaAuth } from '@/lib/auth';
import { getCmds, getSettings, saveCmds } from '@/lib/store';
import { symKey } from '@/lib/regime';
import { markPoll } from '@/lib/easeen';
import { notifyCmd } from '@/lib/telegram';
import { getSystems } from '@/lib/systems';
export const dynamic = 'force-dynamic';

// The EA calls this every few seconds. Plain text, one command per line: id|symbol|side|lot|sl|tp
export async function GET(req: Request) {
  const a = await eaAuth(req);
  if (!a.ok) return new Response(a.msg, { status: a.status });
  // First line "#sys|<SmartGold 0/1>|<SR Breakout 0/1>" tells the EA whether the dashboard switch lets it open new trades.
  // It has only 3 fields, so an EA that does not know it skips it like any other malformed line (orders have 6 fields).
  const sysLine = '#sys|' + ((s) => `${s.sg ? 1 : 0}|${s.sr ? 1 : 0}`)(await getSystems(a.acct));
  if ((await getSettings()).paused) return new Response(sysLine, { headers: { 'content-type': 'text/plain' } });
  const want = new URL(req.url).searchParams.get('symbol');   // optional: only orders for this symbol; the SR Breakout EA sends all pairs it handles, comma separated (A,B,C)
  const wantKeys = want ? want.split(',').map((x) => symKey(x)).filter(Boolean) : null;
  const only = new URL(req.url).searchParams.get('only');     // optional: only=snipe = this EA takes sniper orders only (other commands stay for the EA that handles them)
  if (wantKeys?.length) await markPoll(a.acct, wantKeys);   // "an EA is polling for this symbol" (one small write per minute at most)
  const cmds = await getCmds(a.acct);
  const now = Date.now();
  const out: string[] = [sysLine];
  const expired: typeof cmds = [];
  let changed = false;
  for (const c of cmds) {
    if (c.status === 'sent' && now - c.ts > 180_000) { c.status = 'failed'; c.note = 'exp:noreport'; changed = true; expired.push(c); continue; }
    if (c.status !== 'pending') continue;
    if (c.holdUntil && now < c.holdUntil) continue; // still being announced on the dashboard
    if (only === 'snipe' && c.mode !== 'snipe') { if (now - c.ts > 120_000) { c.status = 'failed'; c.note = 'exp:nopoll'; changed = true; expired.push(c); } continue; }   // not a sniper order: do not hand it to this EA, but still expire it like before
    if (wantKeys && !wantKeys.includes(symKey(c.symbol))) { if (now - c.ts > 120_000) { c.status = 'failed'; c.note = 'exp:symbol'; changed = true; expired.push(c); } continue; }
    changed = true;
    if (now - c.ts > 120_000) { c.status = 'failed'; c.note = 'exp:late'; expired.push(c); continue; }
    c.status = 'sent';
    out.push([c.id, c.symbol, c.side, c.lot, c.sl ?? 0, c.tp ?? 0, c.mode === 'snipe' ? 'snipe' : ''].join('|'));
  }
  if (changed) await saveCmds(cmds, a.acct);
  for (const c of expired) await notifyCmd(c, a.acct);
  return new Response(out.join('\n'), { headers: { 'content-type': 'text/plain' } });
}
