import { z } from 'zod';
import { isEA } from '@/lib/auth';
import { decide } from '@/lib/ai';
import { DEFAULT_GRID_MAP, DEFAULT_PROFILES } from '@/lib/profiles';
import { getJSON, getSettings, setJSON } from '@/lib/store';
import { evKey, newsFor, newsText, noteSymbol } from '@/lib/news';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Body = z.object({
  symbol: z.string(), tf: z.string(), price: z.coerce.number(), adx: z.coerce.number(), rsi: z.coerce.number(),
  atr: z.coerce.number().positive(), ema20: z.coerce.number(), ema50: z.coerce.number(),
});

// The grid EA calls this. The AI only names the market regime; the grid profile for that regime
// (set in the dashboard) is sent back as plain key=value lines. Throttled by the dashboard interval.
export async function POST(req: Request) {
  if (!isEA(req)) return new Response('unauthorized', { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response('bad body', { status: 400 });
  const ind = { ...p.data, symbol: p.data.symbol.toUpperCase() };
  const settings = await getSettings();
  const key = 'gridstate:' + ind.symbol;

  let st = await getJSON<any>(key, null);
  await noteSymbol(ind.symbol);
  const nw = await newsFor(ind.symbol, settings);   // cheap (cached calendar) and checked on every call, so the switch happens within one EA push
  const writeDecision = async (r: { regime: string; confidence: number; reason: string; provider?: any; model?: string; ts: number }) => {
    const pid0 = settings.gridMap[r.regime] ?? DEFAULT_GRID_MAP[r.regime] ?? 'defensive';
    const prof = settings.gridProfiles[pid0] ?? DEFAULT_PROFILES.defensive;
    await setJSON('decision', {
      regime: r.regime, confidence: r.confidence, reason: r.reason, provider: r.provider ?? null, model: r.model ?? '',
      symbol: ind.symbol, tf: ind.tf, ts: r.ts, kind: 'grid', strategy_id: prof.id, strategy: prof.name,
      candidates: [prof.name], eval: null, pass: false, src: 'ea', newsGuard: r.regime === 'news' && !!nw.active,
      ind: { price: ind.price, adx: ind.adx, rsi: ind.rsi, atr: ind.atr, ema20: ind.ema20, ema50: ind.ema50 },
    });
  };
  if (nw.active) {
    const id = evKey(nw.active);
    if (st?.newsId !== id) { // news window just started: switch to the news profile now
      st = { regime: 'news', confidence: 1, reason: newsText(nw), hold: false, ts: Date.now(), newsId: id };
      await setJSON(key, st);
      await writeDecision({ ...st, model: 'news-guard' });
    }
  } else if (!st || st.newsId || st.ts + settings.intervalMin * 60_000 - Date.now() <= 5_000) { // normal AI run (also right after a news window ends)
    const d = await decide(ind);
    const minConf = Number(process.env.MIN_CONFIDENCE ?? 0.6);
    st = { regime: d.regime, confidence: d.confidence, reason: d.reason, hold: d.confidence < minConf, ts: Date.now() };
    await setJSON(key, st);
    await writeDecision({ regime: d.regime, confidence: d.confidence, reason: d.reason, provider: (d as any).provider, model: (d as any).model, ts: st.ts });
  }

  const pid = settings.gridMap[st.regime] ?? DEFAULT_GRID_MAP[st.regime] ?? 'defensive';
  const f = settings.gridProfiles[pid] ?? DEFAULT_PROFILES.defensive;
  const sig = [f.id, +f.buy, +f.sell, f.lot, f.lotMult, f.step, f.stepW, f.stepA, f.max, f.tpN, f.tpO, f.recMult].join('|'); // EA re-applies only when this changes
  const lines = [
    'ok=1', `hold=${st.hold ? 1 : 0}`, `regime=${st.regime}`, `conf=${Number(st.confidence).toFixed(2)}`, `profile=${f.id}`, `sig=${sig}`,
    `buy=${+f.buy}`, `sell=${+f.sell}`, `lot=${f.lot}`, `lotMult=${f.lotMult}`, `step=${f.step}`, `stepW=${f.stepW}`, `stepA=${f.stepA}`,
    `max=${f.max}`, `tpN=${f.tpN}`, `tpO=${f.tpO}`, `recMult=${f.recMult}`,
  ];
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
