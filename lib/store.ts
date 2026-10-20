import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';
import type { Cmd, Settings } from './types';
import { riskCheck } from './risk';

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const mem: Record<string, any> = ((globalThis as any).__hubmem ??= {});

export async function getJSON<T>(k: string, d: T): Promise<T> {
  if (redis) return ((await redis.get<T>(k)) ?? d) as T;
  return (mem[k] as T) ?? d;
}
export async function setJSON(k: string, v: any) {
  if (redis) await redis.set(k, v); else mem[k] = v;
}

export const defaultSettings = (): Settings => ({
  provider: (process.env.AI_PROVIDER as Settings['provider']) || 'anthropic', model: '', paused: false, intervalMin: 15,
});
export const getSettings = async () => ({ ...defaultSettings(), ...(await getJSON<Partial<Settings>>('settings', {})) });
export const getCmds = () => getJSON<Cmd[]>('cmds', []);
export const saveCmds = (c: Cmd[]) => setJSON('cmds', c.slice(0, 200));

// Adds a command to the queue after risk checks. Blocked commands are kept for the log.
export async function addCmd(p: Pick<Cmd, 'symbol' | 'side' | 'lot' | 'sl' | 'tp' | 'source'>): Promise<Cmd> {
  const cmds = await getCmds();
  const settings = await getSettings();
  let reason: string | null = settings.paused ? 'ระบบถูกหยุดชั่วคราว' : riskCheck(p, cmds);
  if (!reason && p.source === 'ai') {
    const dup = cmds.find((c) => c.symbol === p.symbol && c.side === p.side && Date.now() - c.ts < Math.max(10, settings.intervalMin) * 60_000 && c.status !== 'blocked' && c.status !== 'failed');
    if (dup) reason = 'มีคำสั่งเดียวกันในช่วงเวลาที่กันซ้ำ';
  }
  const cmd: Cmd = { id: randomUUID().slice(0, 8), ts: Date.now(), status: reason ? 'blocked' : 'pending', note: reason ?? undefined, ...p };
  await saveCmds([cmd, ...cmds]);
  return cmd;
}

// AI provider keys entered from the dashboard. Env vars are used as a fallback.
export type Keys = Partial<Record<Settings['provider'], string>>;
const ENV_KEY: Record<Settings['provider'], string | undefined> = {
  get anthropic() { return process.env.ANTHROPIC_API_KEY; },
  get openai() { return process.env.OPENAI_API_KEY; },
  get google() { return process.env.GOOGLE_GENERATIVE_AI_API_KEY; },
};
export const getStoredKeys = () => getJSON<Keys>('apikeys', {});
export async function getKeys(): Promise<Keys> {
  const saved = await getStoredKeys();
  return { anthropic: saved.anthropic || ENV_KEY.anthropic, openai: saved.openai || ENV_KEY.openai, google: saved.google || ENV_KEY.google };
}

import type { User } from './types';
export const getUsers = () => getJSON<User[]>('users', []);
export const saveUsers = (u: User[]) => setJSON('users', u);
