import { generateObject, generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { REGIMES, type Ind } from './strategies';
import { getSettings, getKeys, type Keys } from './store';
import type { Settings } from './types';

type P = Settings['provider'];
const ORDER: P[] = ['anthropic', 'openai', 'google'];
const DEFAULT_MODEL: Record<P, string> = {
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  google: process.env.GOOGLE_MODEL || 'gemini-3.5-flash',
};
function modelFor(p: P, id: string, k: Keys) {
  if (p === 'openai') return createOpenAI({ apiKey: k.openai })(id);
  if (p === 'google') return createGoogleGenerativeAI({ apiKey: k.google })(id);
  return createAnthropic({ apiKey: k.anthropic })(id);
}

// Tries the selected provider first, then the other providers that have a key.
async function withFallback<T>(fn: (m: any, p: P, id: string, k: Keys) => Promise<T>): Promise<T & { provider: P; model: string }> {
  const [s, keys] = await Promise.all([getSettings(), getKeys()]);
  const chain = [s.provider, ...ORDER.filter((p) => p !== s.provider)].filter((p) => !!keys[p]);
  let last: any = new Error('ยังไม่ได้ใส่ API key ของผู้ให้บริการ AI (ใส่ได้ในหน้า Dashboard)');
  for (const p of chain) {
    const id = p === s.provider && s.model ? s.model : DEFAULT_MODEL[p];
    try { return { ...(await fn(modelFor(p, id, keys), p, id, keys)), provider: p, model: id } as any; } catch (e) { last = e; }
  }
  throw last;
}

const Decision = z.object({
  regime: z.enum(REGIMES),
  confidence: z.number().min(0).max(1),
  reason: z.string().describe('เหตุผลสั้น ๆ ภาษาไทย ไม่เกิน 2 ประโยค'),
});

// The AI only classifies the market regime. Which strategies run for that regime is decided by the
// mapping in the dashboard, and entry conditions are checked by the server rules.
export async function decide(ind: Ind) {
  try {
    return await withFallback(async (model) => {
      const { object } = await generateObject({
        model, schema: Decision, temperature: 0,
        prompt: `จัดสภาพตลาดจากข้อมูลอินดิเคเตอร์ให้เป็นหนึ่งในนี้\n- trend_up: แนวโน้มขาขึ้นชัด (ADX สูง, EMA20 > EMA50)\n- trend_down: แนวโน้มขาลงชัด (ADX สูง, EMA20 < EMA50)\n- range: ไซด์เวย์ (ADX ต่ำ, EMA แคบ/พันกัน)\n- volatile: ผันผวนผิดปกติ ไม่มีทิศทางชัด (ATR กว้างเมื่อเทียบราคา)\n- news: สัญญาณว่าอยู่ในช่วงข่าวแรง\nถ้าไม่แน่ใจให้ลดค่า confidence\n\nข้อมูล:\n${JSON.stringify(ind)}`,
      });
      return object;
    });
  } catch (e: any) {
    return { regime: 'volatile' as const, confidence: 0, reason: `AI ใช้งานไม่ได้: ${String(e?.message ?? e).slice(0, 120)}`, provider: null as any, model: '' };
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

// ---------------------------------------------------------------------------------------------
// Economic / macro trend analysis (chat only). Advisory text: it never touches orders, strategies,
// grid profiles or any trading setting. Live web search is used when the provider supports it.
// ---------------------------------------------------------------------------------------------
export const MACRO_RE = /เศรษฐกิจ|เงินเฟ้อ|ดอกเบี้ย|เฟด|ธนาคารกลาง|ถดถอย|ว่างงาน|พันธบัตร|ค่าเงิน|ดอลลาร์|ราคาทอง|ทองคำ|น้ำมัน|ข่าวเศรษฐกิจ|ปัจจัยพื้นฐาน|\b(fed|fomc|cpi|ppi|nfp|gdp|pce|macro|inflation|recession|yield|rate (cut|hike)|dxy|tariff)\b/i;

const NO_LIVE_NOTE = ' (หมายเหตุ: ครั้งนี้ไม่ได้ค้นข้อมูลสด ตัวเลขล่าสุดอาจไม่ครบ แนะนำเช็กปฏิทินเศรษฐกิจอีกครั้ง)';

function macroSystem(context: string, live: boolean) {
  const today = new Date().toLocaleDateString('th-TH', { dateStyle: 'long', timeZone: 'Asia/Bangkok' });
  return [
    `คุณคือนักวิเคราะห์เศรษฐกิจมหภาคของระบบเทรด MT5 วันนี้คือ ${today} ตอบภาษาไทย ไม่ใช้ markdown เพราะจะถูกอ่านออกเสียง`,
    'ตอบ 4-6 ประโยค เรียงตามนี้: ภาพรวมแนวโน้ม → ปัจจัยหลักที่ขับเคลื่อน (เช่น ดอกเบี้ย เงินเฟ้อ ตลาดแรงงาน ค่าเงินดอลลาร์ ราคาพลังงาน) → ผลที่น่าจะมีต่อสินทรัพย์ที่ผู้ใช้ถาม หรือสินทรัพย์ที่ระบบกำลังเทรดอยู่ → สิ่งที่ควรระวัง/ตัวเลขข่าวที่จะออก',
    live ? 'ใช้ข้อมูลล่าสุดจากการค้นหา และบอกช่วงเวลาของข้อมูลที่อ้างถึง' : 'คุณไม่มีข้อมูลเรียลไทม์ ให้พูดถึงแนวโน้มเชิงโครงสร้างและปัจจัยที่ต้องจับตา',
    'ห้ามแต่งตัวเลขหรือวันที่ ถ้าไม่แน่ใจให้บอกว่าไม่แน่ใจ ห้ามรับประกันกำไร ห้ามสั่งให้ซื้อหรือขายตรง ๆ ให้พูดเป็นมุมมองและความเสี่ยง',
    'นี่เป็นการวิเคราะห์เพื่อประกอบการตัดสินใจเท่านั้น ไม่เปลี่ยนคำสั่งหรือการตั้งค่าของระบบเทรด',
    context,
  ].join('\n');
}

// Google: call the REST API directly with the google_search tool (the installed SDK only knows the
// legacy tool name for non-"gemini-2" models, which newer Gemini versions may reject).
async function geminiSearch(key: string, id: string, system: string, message: string) {
  const call = async (search: boolean) => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        ...(search ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: { temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${j?.error?.message ?? 'error'}`);
    const text = (j?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x?.text ?? '').join('').trim();
    if (!text) throw new Error('Gemini ไม่ส่งข้อความกลับมา (อาจถูกตัวกรองความปลอดภัยบล็อก)');
    return text;
  };
  try { return { text: await call(true), live: true }; }
  catch (e) {
    // search tool rejected for this model/key -> answer without live search rather than failing outright
    try { return { text: await call(false), live: false }; } catch { throw e; }
  }
}

export async function macro(message: string, context: string) {
  return withFallback(async (_m, p, id, keys) => {
    if (p === 'google') {
      const g = await geminiSearch(keys.google!, id, macroSystem(context, true), message);
      return g.live ? g : { text: g.text + NO_LIVE_NOTE, live: false };
    }
    if (p === 'openai') {
      const { text } = await generateText({
        model: createOpenAI({ apiKey: keys.openai }).responses(id), temperature: 0.3,
        tools: { web_search_preview: createOpenAI({ apiKey: keys.openai }).tools.webSearchPreview({}) },
        system: macroSystem(context, true), prompt: message,
      });
      return { text, live: true };
    }
    // Anthropic (installed SDK has no web-search tool): answer from the model's own knowledge and say so.
    const { text } = await generateText({ model: _m, temperature: 0.3, system: macroSystem(context, false), prompt: message });
    return { text: text.trim() + NO_LIVE_NOTE, live: false };
  });
}
