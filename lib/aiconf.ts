import { ak, getJSON, getKeys, getSettings, setJSON, type Keys } from './store';
import { seal, unseal } from './seal';
import type { Settings } from './types';

type P = Settings['provider'];
const PROVIDERS: P[] = ['anthropic', 'openai', 'google'];
export type AiConf = { provider: P; model: string; intervalMin: number; keys: Keys; own: boolean };
type Stored = { provider?: P; model?: string; intervalMin?: number; keys?: Partial<Record<P, string>> };

// Who pays for the AI tokens?
//  - 'main' (the admin's own account): the admin's provider/model/keys (dashboard or Vercel env), as before.
//  - a member's account: ONLY that member's own provider/model/key. The admin's keys are never used for a member,
//    so the member pays their own token cost, and without a key their AI features simply do not run.
export async function getAiConf(acct = 'main'): Promise<AiConf> {
  const s = await getSettings();
  if (acct === 'main') return { provider: s.provider, model: s.model, intervalMin: s.intervalMin, keys: await getKeys(), own: false };
  const c = await getJSON<Stored>(ak('aiconf', acct), {}, 10_000);
  const keys: Keys = {};
  for (const p of PROVIDERS) { const v = c.keys?.[p]; if (v) { const k = unseal(v); if (k) keys[p] = k; } }
  return { provider: c.provider ?? s.provider, model: c.model ?? '', intervalMin: c.intervalMin ?? s.intervalMin, keys, own: true };
}

export async function saveAiConf(acct: string, patch: { provider?: P; model?: string; intervalMin?: number; key?: { provider: P; value: string } }) {
  const c = await getJSON<Stored>(ak('aiconf', acct), {});
  if (patch.provider) c.provider = patch.provider;
  if (patch.model !== undefined) c.model = patch.model;
  if (patch.intervalMin) c.intervalMin = patch.intervalMin;
  if (patch.key) {
    c.keys = { ...(c.keys ?? {}) };
    if (patch.key.value) c.keys[patch.key.provider] = seal(patch.key.value); else delete c.keys[patch.key.provider];
  }
  await setJSON(ak('aiconf', acct), c);
}

export async function hasOwnKey(acct: string): Promise<boolean> {
  const c = await getJSON<Stored>(ak('aiconf', acct), {});
  return PROVIDERS.some((p) => !!c.keys?.[p]);
}
