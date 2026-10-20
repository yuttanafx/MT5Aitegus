import { createHash, timingSafeEqual } from 'crypto';
import { getUsers } from './store';
function eq(a: string | null | undefined, b: string | undefined) {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const isAdmin = (r: Request) => eq(r.headers.get('x-admin-key'), process.env.ADMIN_KEY);
export const isEA = (r: Request) => eq(r.headers.get('x-api-key'), process.env.EA_API_KEY);
export const isWebhook = (r: Request) =>
  eq(r.headers.get('x-api-key') ?? new URL(r.url).searchParams.get('key'), process.env.WEBHOOK_SECRET);

export const hashPw = (p: string) => createHash('sha256').update(p).digest('hex');
export type Who = { role: 'admin' | 'user'; name: string; id?: string };
// Admin = ADMIN_KEY. User = a password the admin generated (stored only as a hash; passwords are long and random).
export async function whoami(pw?: string | null): Promise<Who | null> {
  if (!pw) return null;
  if (eq(pw, process.env.ADMIN_KEY)) return { role: 'admin', name: 'Admin' };
  const h = hashPw(pw);
  const u = (await getUsers()).find((x) => eq(x.hash, h));
  return u ? { role: 'user', name: u.name, id: u.id } : null;
}
export const who = (r: Request) => whoami(r.headers.get('x-admin-key'));
