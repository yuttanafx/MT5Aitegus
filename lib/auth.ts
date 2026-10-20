import { timingSafeEqual } from 'crypto';
function eq(a: string | null | undefined, b: string | undefined) {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const isAdmin = (r: Request) => eq(r.headers.get('x-admin-key'), process.env.ADMIN_KEY);
export const isEA = (r: Request) => eq(r.headers.get('x-api-key'), process.env.EA_API_KEY);
export const isWebhook = (r: Request) =>
  eq(r.headers.get('x-api-key') ?? new URL(r.url).searchParams.get('key'), process.env.WEBHOOK_SECRET);
