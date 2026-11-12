import { randomBytes, randomUUID } from 'crypto';
import { getJSON, getUsers, saveUsers, setJSON } from './store';
import type { User } from './types';

// Subscription billing: the admin sets plans (price + days), members pay (manual confirm or webhook), the account is
// extended, and the member who referred them earns a commission (%). Everything lives in the same Redis as the rest of the app.
export const DAY = 86_400_000;
export type Plan = { id: string; name: string; price: number; days: number; active: boolean };
export type BillCfg = {
  enforce: boolean;        // false = nobody is locked out (use while you set things up / migrate existing members)
  currency: string;
  plans: Plan[];
  defaultRefPct: number;   // commission % for referrers (a referrer can have their own % set by the admin)
  refRecurring: boolean;   // true = commission on EVERY payment of the referred member, false = first payment only
  allowSignup: boolean;    // public self-registration page
  trialDays: number;       // free days given to a self-registered member (0 = none)
  payInfo: string;         // how to pay (bank account, PromptPay, USDT address ...) shown to members
  contact: string;         // where to send the slip (LINE / Telegram ...) shown to members
};
export type Payment = {
  id: string; ts: number; userId: string; userName: string; login?: string;
  planId: string; planName: string; amount: number; days: number; currency: string;
  method: 'manual' | 'webhook' | 'admin'; ref: string;           // ref = member's note (slip no. / tx hash) or the gateway's transaction id
  status: 'pending' | 'approved' | 'rejected'; decidedAt?: number;
  refBy?: string; refPct?: number; commission?: number;          // filled when approved and the member was referred
};

export const defaultBill = (): BillCfg => ({
  enforce: false, currency: 'THB', defaultRefPct: 20, refRecurring: true, allowSignup: true, trialDays: 0, payInfo: '', contact: '',
  plans: [{ id: 'm1', name: '1 เดือน', price: 990, days: 30, active: true }, { id: 'm3', name: '3 เดือน', price: 2490, days: 90, active: true }],
});
export const getBillCfg = async (): Promise<BillCfg> => ({ ...defaultBill(), ...(await getJSON<Partial<BillCfg>>('billcfg', {}, 10_000)) });
export const saveBillCfg = (c: BillCfg) => setJSON('billcfg', c);
export const getPayments = () => getJSON<Payment[]>('payments', []);
export const savePayments = (p: Payment[]) => setJSON('payments', p.slice(0, 2000));

export type Sub = { active: boolean; enforced: boolean; free: boolean; expiresAt: number | null; daysLeft: number | null };
export function subOf(u: Pick<User, 'expiresAt' | 'free'>, cfg: Pick<BillCfg, 'enforce'>): Sub {
  const exp = u.expiresAt ?? null;
  const left = exp ? Math.ceil((exp - Date.now()) / DAY) : null;
  return { active: !cfg.enforce || !!u.free || (exp !== null && exp > Date.now()), enforced: cfg.enforce, free: !!u.free, expiresAt: exp, daysLeft: u.free ? null : left };
}
// Is this trading account allowed to use the service right now? 'main' (the admin's own account) always is.
export async function acctActive(acct: string): Promise<boolean> {
  if (acct === 'main') return true;
  const cfg = await getBillCfg();
  if (!cfg.enforce) return true;
  const u = (await getUsers()).find((x) => x.id === acct);
  return !!u && subOf(u, cfg).active;
}
export const EXPIRED_MSG = 'แพ็กเกจหมดอายุ กรุณาต่ออายุที่หน้าเว็บ (subscription expired)';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRefCode = () => Array.from(randomBytes(8), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
// every member gets a referral code (older members get one the first time it is needed)
export function ensureRefCode(users: User[], u: User): boolean {
  if (u.refCode) return false;
  let c = newRefCode();
  while (users.some((x) => x.refCode === c)) c = newRefCode();
  u.refCode = c;
  return true;
}
export const findByCode = (users: User[], code?: string | null) => { const c = (code ?? '').trim().toUpperCase(); return c ? users.find((x) => x.refCode === c) : undefined; };

const money = (n: number) => Math.round(n * 100) / 100;
export const refPctOf = (r: User, cfg: BillCfg) => (typeof r.refPct === 'number' ? r.refPct : cfg.defaultRefPct);

// Approve a payment: extend the member from max(now, current expiry) and credit the referrer's commission.
// (Read-modify-write on Redis without a lock: approvals are admin clicks / single webhook calls, so races are not a practical concern.)
export async function applyPayment(pay: Payment, cfg: BillCfg): Promise<{ ok: true; pay: Payment } | { ok: false; error: string }> {
  const users = await getUsers();
  const u = users.find((x) => x.id === pay.userId);
  if (!u) return { ok: false, error: 'ไม่พบผู้ใช้' };
  const all = await getPayments();
  const first = !all.some((p) => p.userId === u.id && p.status === 'approved' && p.id !== pay.id);
  u.expiresAt = Math.max(Date.now(), u.expiresAt ?? 0) + pay.days * DAY;
  const r = u.refBy && u.refBy !== u.id ? users.find((x) => x.id === u.refBy) : undefined;
  if (r && (cfg.refRecurring || first)) {
    const pct = refPctOf(r, cfg);
    pay.refBy = r.id; pay.refPct = pct; pay.commission = money((pay.amount * pct) / 100);
  }
  pay.status = 'approved'; pay.decidedAt = Date.now();
  await saveUsers(users);
  return { ok: true, pay };
}

export function newPayment(u: User, plan: { id: string; name: string; price: number; days: number }, cfg: BillCfg, method: Payment['method'], ref: string, over?: { amount?: number }): Payment {
  return { id: randomUUID().slice(0, 8), ts: Date.now(), userId: u.id, userName: u.name, login: u.login, planId: plan.id, planName: plan.name, amount: over?.amount ?? plan.price, days: plan.days, currency: cfg.currency, method, ref: ref.slice(0, 200), status: 'pending' };
}

// per-referrer numbers: how many members they brought, how many are paying, commission earned / paid / still owed
export function refStats(users: User[], pays: Payment[], r: User) {
  const mine = users.filter((x) => x.refBy === r.id);
  const earned = money(pays.filter((p) => p.refBy === r.id && p.status === 'approved').reduce((a, p) => a + (p.commission ?? 0), 0));
  const paid = money(r.refPaid ?? 0);
  return { referred: mine.length, paying: mine.filter((x) => pays.some((p) => p.userId === x.id && p.status === 'approved')).length, earned, paid, owed: money(earned - paid) };
}
