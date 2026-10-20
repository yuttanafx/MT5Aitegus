import { z } from 'zod';
import { isWebhook } from '@/lib/auth';
import { addCmd } from '@/lib/store';
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
  const cmd = await addCmd({ ...p.data, symbol: p.data.symbol.toUpperCase(), source: 'webhook' });
  return Response.json({ id: cmd.id, status: cmd.status, note: cmd.note });
}
