import { STRATEGIES } from '@/lib/strategies';
import { who } from '@/lib/auth';
import { getCmds, getJSON, getSettings, getStoredKeys } from '@/lib/store';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const me = await who(req);
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const [cmds, decision, settings, saved] = await Promise.all([getCmds(), getJSON<any>('decision', null), getSettings(), getStoredKeys()]);
  const mask = (v?: string) => (v ? '••••' + v.slice(-4) : '');
  const env = { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY, google: process.env.GOOGLE_GENERATIVE_AI_API_KEY };
  const keys = Object.fromEntries((['anthropic', 'openai', 'google'] as const).map((p) => [p, !!(saved[p] || env[p])]));
  const keyHints = Object.fromEntries((['anthropic', 'openai', 'google'] as const).map((p) => [p, saved[p] ? mask(saved[p]) : env[p] ? 'จาก Vercel' : '']));
  const admin = me.role === 'admin';
  return Response.json({ cmds: cmds.slice(0, 15), decision, settings, me, strategies: STRATEGIES.map((s) => ({ id: s.id, name: s.name, side: s.side, conds: s.conds.map((c) => c.text) })), keys: admin ? keys : {}, keyHints: admin ? keyHints : {} });
}
