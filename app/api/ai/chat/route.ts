import { pickAcct, who } from '@/lib/auth';
import { answerChat } from '@/lib/chatcore';
import { acctActive, EXPIRED_MSG } from '@/lib/billing';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const me = await who(req);
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { message } = await req.json().catch(() => ({ message: '' }));
  if (!message || typeof message !== 'string') return Response.json({ error: 'bad body' }, { status: 400 });
  const acct = await pickAcct(req, me);
  if (!(await acctActive(acct))) return Response.json({ error: EXPIRED_MSG }, { status: 402 }); // AI chat costs money: members only while subscribed
  return Response.json(await answerChat(message, acct));
}
