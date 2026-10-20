import { isAdmin } from '@/lib/auth';
import { getCmds, getJSON, getSettings } from '@/lib/store';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const [cmds, decision, settings] = await Promise.all([getCmds(), getJSON<any>('decision', null), getSettings()]);
  const keys = { anthropic: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY, google: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY };
  return Response.json({ cmds: cmds.slice(0, 15), decision, settings, keys });
}
