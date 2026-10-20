import { generateObject, generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { STRATEGIES, STRATEGY_IDS, type Ind } from './strategies';
import { getSettings, getKeys, type Keys } from './store';
import type { Settings } from './types';

type P = Settings['provider'];
const ORDER: P[] = ['anthropic', 'openai', 'google'];
const DEFAULT_MODEL: Record<P, string> = {
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  google: process.env.GOOGLE_MODEL || 'gemini-2.0-flash',
};
function modelFor(p: P, id: string, k: Keys) {
  if (p === 'openai') return createOpenAI({ apiKey: k.openai })(id);
  if (p === 'google') return createGoogleGenerativeAI({ apiKey: k.google })(id);
  return createAnthropic({ apiKey: k.anthropic })(id);
}

// Tries the selected provider first, then the other providers that have a key.
async function withFallback<T>(fn: (m: any, p: P, id: string) => Promise<T>): Promise<T & { provider: P; model: string }> {
  const [s, keys] = await Promise.all([getSettings(), getKeys()]);
  const chain = [s.provider, ...ORDER.filter((p) => p !== s.provider)].filter((p) => !!keys[p]);
  let last: any = new Error('ยังไม่ได้ใส่ API key ของผู้ให้บริการ AI (ใส่ได้ในหน้า Dashboard)');
  for (const p of chain) {
    const id = p === s.provider && s.model ? s.model : DEFAULT_MODEL[p];
    try { return { ...(await fn(modelFor(p, id, keys), p, id)), provider: p, model: id } as any; } catch (e) { last = e; }
  }
  throw last;
}

const Decision = z.object({
  regime: z.enum(['trend_up', 'trend_down', 'range', 'volatile', 'news']),
  strategy_id: z.enum(STRATEGY_IDS),
  confidence: z.number().min(0).max(1),
  reason: z.string().describe('เหตุผลสั้น ๆ ภาษาไทย ไม่เกิน 2 ประโยค'),
});

export async function decide(ind: Ind) {
  const list = STRATEGIES.map((s) => `- ${s.id}: ใช้เมื่อตลาดเป็น ${s.regimes.join('/')}`).join('\n');
  try {
    return await withFallback(async (model) => {
      const { object } = await generateObject({
        model, schema: Decision, temperature: 0,
        prompt: `จัดสภาพตลาดและเลือกกลยุทธ์จากรายการ หรือ no_trade ถ้าไม่ชัดเจน\nกลยุทธ์:\n${list}\n- no_trade: ไม่เทรด\n\nข้อมูล:\n${JSON.stringify(ind)}`,
      });
      return object;
    });
  } catch (e: any) {
    return { regime: 'volatile' as const, strategy_id: 'no_trade', confidence: 0, reason: `AI ใช้งานไม่ได้: ${String(e?.message ?? e).slice(0, 120)}`, provider: null as any, model: '' };
  }
}

export async function chat(message: string, context: string) {
  return withFallback(async (model) => {
    const { text } = await generateText({
      model, temperature: 0.3,
      system: 'คุณคือ AI Strategist ของระบบเทรด MT5 ตอบภาษาไทย สั้น 1-3 ประโยค ไม่ใช้ markdown เพราะจะถูกอ่านออกเสียง ใช้ข้อมูลระบบด้านล่างเท่านั้น ห้ามแต่งตัวเลข และห้ามรับประกันกำไร\n' + context,
      prompt: message,
    });
    return { text };
  });
}
