import { z } from 'zod';
import { isEA } from '@/lib/auth';
import { decide } from '@/lib/ai';
import { DEFAULT_GRID_MAP, DEFAULT_PROFILES } from '@/lib/profiles';
import { getJSON, getSettings, setJSON } from '@/lib/store';
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
  const due = !st || st.ts + settings.intervalMin * 60_000 - Date.now() <= 5_000;
  if (due) {
    const d = await decide(ind);
    const minConf = Number(process.env.MIN_CONFIDENCE ?? 0.6);
    st = { regime: d.regime, confidence: d.confidence, reason: d.reason, hold: d.confidence < minConf, ts: Date.now() };
    await setJSON(key, st);
    const pid = settings.gridMap[d.regime] ?? DEFAULT_GRID_MAP[d.regime] ?? 'defensive';
    const prof = settings.gridProfiles[pid] ?? DEFAULT_PROFILES.defensive;
    await setJSON('decision', {
      regime: d.regime, confidence: d.confidence, reason: d.reason, provider: (d as any).provider ?? null, model: (d as any).model ?? '',
      symbol: ind.symbol, tf: ind.tf, ts: st.ts, kind: 'grid', strategy_id: prof.id, strategy: prof.name,
      candidates: [prof.name], eval: null, pass: false, src: 'ea',
    });
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
