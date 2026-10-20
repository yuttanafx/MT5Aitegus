import { isEA } from '@/lib/auth';
import { getCmds, saveCmds } from '@/lib/store';
export const dynamic = 'force-dynamic';

// EA reports back as plain text: id|status|ticket|price|note   (status = done | failed)
export async function POST(req: Request) {
  if (!isEA(req)) return new Response('unauthorized', { status: 401 });
  const [id, status, ticket, price, note] = (await req.text()).trim().split('|');
  const cmds = await getCmds();
  const c = cmds.find((x) => x.id === id);
  if (!c) return new Response('not found', { status: 404 });
  c.status = status === 'done' ? 'done' : 'failed';
  c.ticket = Number(ticket) || undefined;
  c.price = Number(price) || undefined;
  c.note = note || c.note;
  await saveCmds(cmds);
  return new Response('ok');
}
