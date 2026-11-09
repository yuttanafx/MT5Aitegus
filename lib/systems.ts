import { ak, getJSON, getUsers, setJSON } from './store';

// Which trading systems (EAs) are allowed to open NEW trades for one account.
//   sg = SmartGold Grid (the EA that already talks to /api/ea/grid and /api/ea/poll)
//   sr = SR Breakout (the second EA; it reports with /api/ea/ping)
// Both default to ON, so an account that never touched the switch behaves exactly as before.
export type SysState = { sg: boolean; sr: boolean };
export type SysId = 'sg' | 'sr';
export const SYS_NAME: Record<SysId, string> = { sg: 'SmartGold Grid', sr: 'SR Breakout' };

const sysKey = (acct: string) => ak('systems', acct);
// "last seen" of each EA. sg keeps the key the grid route already writes; sr has its own.
export const seenKey = (sys: SysId, acct: string) => (sys === 'sg' ? ak('seen', acct) : ak('seen:sr', acct));

export function normSystems(v: any): SysState {
  return { sg: v?.sg !== false, sr: v?.sr !== false };
}

// What the ADMIN allows this account to use (set per member in the users table). The main (admin) account may use both.
// A member created before this existed has no grant stored = both systems allowed.
export async function getAllowed(acct: string): Promise<SysState> {
  if (acct === 'main') return { sg: true, sr: true };
  const u = (await getUsers()).find((x) => x.id === acct);
  return normSystems(u?.systems);
}

// What the EAs obey = admin grant AND the switch on the dashboard. ttlMs: the EAs ask every few seconds, so a few
// seconds of in-instance cache keeps Redis usage low.
export async function getSystems(acct: string, ttlMs = 5000): Promise<SysState> {
  const [sw, al] = await Promise.all([getJSON<any>(sysKey(acct), null, ttlMs), getAllowed(acct)]);
  const s = normSystems(sw);
  return { sg: s.sg && al.sg, sr: s.sr && al.sr };
}

export async function saveSystems(acct: string, s: SysState) {
  await setJSON(sysKey(acct), { sg: !!s.sg, sr: !!s.sr, ts: Date.now() });
}

export { sysKey };
