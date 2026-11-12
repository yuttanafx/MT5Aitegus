import { eaAuth } from '@/lib/auth';
import { getUsers } from '@/lib/store';
import { EXPIRED_MSG, getBillCfg, subOf } from '@/lib/billing';
export const dynamic = 'force-dynamic';

// The EA asks "am I licensed?" (at start and every few minutes). Plain text lines:
//   ok=1|0   days=<whole days left, -1 = no expiry>   expires=<unix seconds, 0 = none>   now=<server unix seconds>   msg=<reason when ok=0>
// The EA stops opening NEW orders when ok=0 (open baskets are still managed and closed). Expired members also get 402 on every other
// EA route (see eaAuth), so the server side is locked even if someone edits the EA.
export async function GET(req: Request) {
  const a = await eaAuth(req, { allowExpired: true });
  if (!a.ok) return new Response(a.msg, { status: a.status });
  const now = Math.floor(Date.now() / 1000);
  if (a.acct === 'main') return new Response(['ok=1', 'days=-1', 'expires=0', `now=${now}`].join('\n'), { headers: { 'content-type': 'text/plain' } });
  const u = (await getUsers()).find((x) => x.id === a.acct);
  const s = u ? subOf(u, await getBillCfg()) : null;
  const ok = !!s?.active;
  const lines = [`ok=${ok ? 1 : 0}`, `days=${!s || s.free || !s.enforced || s.expiresAt === null ? -1 : Math.max(0, s.daysLeft ?? 0)}`, `expires=${s?.expiresAt && !s.free ? Math.floor(s.expiresAt / 1000) : 0}`, `now=${now}`];
  if (!ok) lines.push('msg=' + EXPIRED_MSG);
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain' } });
}
