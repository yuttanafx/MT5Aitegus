import { z } from 'zod';
import { isWebhook, resolveAcct } from '@/lib/auth';
import { addCmd, ak, getJSON } from '@/lib/store';
export const dynamic = 'force-dynamic';

const Body = z.object({
  symbol: z.string().min(3).max(20),
  side: z.string().transform((s) => s.toUpperCase()).pipe(z.enum(['BUY', 'SELL'])),
  lot: z.coerce.number().positive(),
  sl: z.coerce.number().optional(),
  tp: z.coerce.number().optional(),
  account: z.union([z.string(), z.number()]).optional(), // MT5 account number (or user id) the order is for; missing = main account
});

// TradingView: POST https://YOUR-APP.vercel.app/api/webhook?key=WEBHOOK_SECRET
export async function POST(req: Request) {
  if (!isWebhook(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'bad body', issues: p.error.issues }, { status: 400 });
  const { account, ...order } = p.data;
  const acct = await resolveAcct(account == null ? '' : String(account));
  if (!acct) return Response.json({ error: 'ไม่พบบัญชีนี้ในระบบ' }, { status: 404 });
  const symbol = order.symbol.toUpperCase();
  const dec = await getJSON<any>(ak('decision', acct), null); // latest AI analysis, attached only if it is the same symbol and fresh
  const mkt = dec && dec.symbol === symbol && dec.ind && Date.now() - dec.ts < 30 * 60_000
    ? { regime: dec.regime, confidence: dec.confidence, strategy: dec.strategy, reason: dec.reason, tf: dec.tf, ts: dec.ts, ind: dec.ind } : undefined;
  const cmd = await addCmd({ ...order, symbol, source: 'webhook', mkt }, acct);
  return Response.json({ id: cmd.id, status: cmd.status, note: cmd.note });
}
