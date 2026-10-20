import { z } from 'zod';
import { isAdmin } from '@/lib/auth';
import { getStoredKeys, setJSON } from '@/lib/store';
export const dynamic = 'force-dynamic';

const Body = z.object({ provider: z.enum(['anthropic', 'openai', 'google']), key: z.string().trim().max(300) });

// Save (or clear, with an empty string) an AI provider key. Keys are never sent back to the browser.
export async function POST(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'bad body' }, { status: 400 });
  if (p.data.key && /\s/.test(p.data.key)) return Response.json({ error: 'key ห้ามมีช่องว่าง' }, { status: 400 });
  const saved = await getStoredKeys();
  if (p.data.key) saved[p.data.provider] = p.data.key; else delete saved[p.data.provider];
  await setJSON('apikeys', saved);
  return Response.json({ ok: true });
}
