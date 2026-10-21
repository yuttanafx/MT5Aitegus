import { z } from 'zod';
import { REGIMES, STRATEGIES } from '@/lib/strategies';
import { who } from '@/lib/auth';
import { getSettings, setJSON } from '@/lib/store';
export const dynamic = 'force-dynamic';

const IDS = STRATEGIES.map((s) => s.id) as [string, ...string[]];
const Body = z.object({ provider: z.enum(['anthropic', 'openai', 'google']).optional(), model: z.string().max(80).optional(), paused: z.boolean().optional(), intervalMin: z.number().int().min(1).max(240).optional(), map: z.record(z.enum(REGIMES), z.array(z.enum(IDS))).optional() });

export async function POST(req: Request) {
  if ((await who(req))?.role !== 'admin') return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'bad body' }, { status: 400 });
  const next = { ...(await getSettings()), ...p.data };
  await setJSON('settings', next);
  return Response.json(next);
}
