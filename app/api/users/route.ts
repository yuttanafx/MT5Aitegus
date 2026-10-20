import { z } from 'zod';
import { randomBytes, randomUUID } from 'crypto';
import { hashPw, who } from '@/lib/auth';
import { getUsers, saveUsers } from '@/lib/store';
export const dynamic = 'force-dynamic';

const Body = z.object({ action: z.enum(['create', 'reset', 'delete']), name: z.string().trim().min(1).max(40).optional(), id: z.string().optional() });
const newPassword = () => randomBytes(12).toString('base64url'); // 16 chars, shown to the admin once

const pub = (u: { id: string; name: string; createdAt: number; lastSeen?: number }) => ({ id: u.id, name: u.name, createdAt: u.createdAt, lastSeen: u.lastSeen });

export async function GET(req: Request) {
  if ((await who(req))?.role !== 'admin') return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json({ users: (await getUsers()).map(pub) });
}

export async function POST(req: Request) {
  if ((await who(req))?.role !== 'admin') return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'bad body' }, { status: 400 });
  const users = await getUsers();
  const { action, name, id } = p.data;

  if (action === 'create') {
    if (!name) return Response.json({ error: 'ต้องใส่ชื่อผู้ใช้' }, { status: 400 });
    if (users.length >= 50) return Response.json({ error: 'ผู้ใช้เต็ม 50 คนแล้ว' }, { status: 400 });
    const password = newPassword();
    users.push({ id: randomUUID().slice(0, 8), name, hash: hashPw(password), createdAt: Date.now() });
    await saveUsers(users);
    return Response.json({ name, password, users: users.map(pub) });
  }
  const u = users.find((x) => x.id === id);
  if (!u) return Response.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
  if (action === 'reset') {
    const password = newPassword();
    u.hash = hashPw(password);
    await saveUsers(users);
    return Response.json({ name: u.name, password, users: users.map(pub) });
  }
  const rest = users.filter((x) => x.id !== id);
  await saveUsers(rest);
  return Response.json({ users: rest.map(pub) });
}
