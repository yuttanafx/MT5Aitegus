import { z } from 'zod';
import { isWebhook } from '@/lib/auth';
import { addCmd, getJSON } from '@/lib/store';
export const dynamic = 'force-dynamic';

const Body = z.object({
  symbol: z.string().min(3).max(20),
  side: z.string().transform((s) => s.toUpperCase()).pipe(z.enum(['BUY', 'SELL'])),
  lot: z.coerce.number().positive(),
  sl: z.coerce.number().optional(),
  tp: z.coerce.number().optional(),
});

// TradingView: POST https://YOUR-APP.vercel.app/api/webhook?key=WEBHOOK_SECRET
export async function POST(req: Request) {
  if (!isWebhook(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'bad body', issues: p.error.issues }, { status: 400 });
  const symbol = p.data.symbol.toUpperCase();
  const dec = await getJSON<any>('decision', null); // latest AI analysis, attached only if it is the same symbol and fresh
  const mkt = dec && dec.symbol === symbol && dec.ind && Date.now() - dec.ts < 30 * 60_000
    ? { regime: dec.regime, confidence: dec.confidence, strategy: dec.strategy, reason: dec.reason, tf: dec.tf, ts: dec.ts, ind: dec.ind } : undefined;
  const cmd = await addCmd({ ...p.data, symbol, source: 'webhook', mkt });
  return Response.json({ id: cmd.id, status: cmd.status, note: cmd.note });
}
