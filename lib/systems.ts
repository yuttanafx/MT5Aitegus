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

// "Several sniper orders on one pair" switch: off (default) = the EA keeps its own per-pair limit (Sn_MaxOpen),
// on = the EA may stack up to Sn_MultiMax sniper positions on the same pair. Stored in the same record as the system switch.
export async function getMulti(acct: string, ttlMs = 5000): Promise<boolean> {
  return (await getJSON<any>(sysKey(acct), null, ttlMs))?.multi === true;
}

// Partial update: whatever is not given keeps its current value (so changing the pair switch never drops `multi`, and vice versa).
export async function saveSystems(acct: string, s: Partial<SysState> & { multi?: boolean }) {
  const cur = await getJSON<any>(sysKey(acct), null);
  const sw = normSystems(cur);
  await setJSON(sysKey(acct), { sg: s.sg ?? sw.sg, sr: s.sr ?? sw.sr, multi: s.multi ?? (cur?.multi === true), ts: Date.now() });
}

export { sysKey };
