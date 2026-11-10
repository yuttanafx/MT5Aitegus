import { z } from 'zod';
import { ak, delKey, getJSON, setJSON } from './store';
import { symKey, type SymRow } from './regime';
import type { Ind } from './strategies';

// ---------------------------------------------------------------------------------------------
// Market Scan: the SR Breakout EA (v2.18+) sends EVERY pair it watches in one request (/api/ea/scan):
// price, every indicator used for filtering, and its own rule-based verdict (trend up / trend down / sideways / volatile).
// The whole snapshot is ONE Redis value per account (1 write per push, no per-pair writes), and the dashboard reads it
// together with the other keys it already fetches.
// ---------------------------------------------------------------------------------------------
const num = z.coerce.number().finite();
const Plan = z.object({ e: num, sl: num, tp: z.array(num).length(3), risk: num.positive() });   // sniper plan of one side (same shape as /api/ea/sr)
export const ScanItem = z.object({
  symbol: z.string().min(3).max(32),
  ai: z.boolean().optional(),                       // the EA's Scan_AISymbols chose this pair for AI analysis
  bid: num.positive(), ask: num.positive(), spr: num.optional(), digits: num.optional(), point: num.optional(), close: num.optional(),
  regime: z.enum(['trend_up', 'trend_down', 'range', 'volatile']),
  conf: num.min(0).max(1),
  since: num.optional(),
  sv: num.int().min(0).max(6), up: num.int().min(0).max(5), dn: num.int().min(0).max(5),
  adx: num, pdi: num.optional(), mdi: num.optional(), atr: num.positive(), atrRatio: num,
  emaFast: num.optional(), emaSlow: num.optional(), emaTrend: num.optional(), ema20: num, ema50: num, rsi: num,
  gap: num.optional(), rng: num.optional(), slope: num.optional(), chop: num.optional(),
  htf: num.optional(), sup: num.optional(), res: num.optional(),
  // Sniper levels + SL/TP1-3 plans computed by the EA with its normal Sn_* rules (same RR as before), so every scanned pair is tradable from Telegram
  snTf: z.string().max(8).optional(), snSup: num.optional(), snRes: num.optional(), rr: z.array(num.positive()).length(3).optional(), stopLevel: num.min(0).optional(),
  buy: Plan.optional(), sell: Plan.optional(),
  note: z.string().max(500).optional(),
});
export const ScanBody = z.object({
  sys: z.literal('sr').optional(), ver: z.string().max(16).optional(),
  tf: z.string().min(1).max(8),
  bal: num.optional(), eq: num.optional(),
  cfg: z.object({ adxTrend: num, adxSide: num, sideNeed: num, trendNeed: num }).partial().optional(),
  items: z.array(ScanItem).min(1).max(40),
});
export type ScanItemT = z.infer<typeof ScanItem>;

export type ScanAiRes = { regime: string; confidence: number; reason: string };
export type ScanAi = { ts: number; syms: string[]; res: Record<string, ScanAiRes>; summary?: string; provider?: string; model?: string; error?: string };
export type ScanSnap = {
  ts: number; tf: string; ver?: string; bal?: number; eq?: number;
  cfg?: { adxTrend?: number; adxSide?: number; sideNeed?: number; trendNeed?: number };
  items: ScanItemT[]; ai?: ScanAi;
};

export const getScan = (acct: string) => getJSON<ScanSnap | null>(ak('scan', acct), null);
export const saveScan = (acct: string, s: ScanSnap) => setJSON(ak('scan', acct), s);
// Take one pair out of the stored snapshot (it comes back with the EA's next push if the EA still scans it).
export async function removeScanItem(acct: string, key: string) {
  const snap = await getScan(acct);
  if (!snap) return;
  const items = snap.items.filter((it) => symKey(it.symbol) !== key);
  if (items.length === snap.items.length) return;
  if (!items.length) await delKey(ak('scan', acct)); else await saveScan(acct, { ...snap, items });
}

export const REGIME_TH: Record<string, string> = { trend_up: 'เทรนขึ้น', trend_down: 'เทรนลง', range: 'ไซด์เวย์', volatile: 'ผันผวน', news: 'ช่วงข่าว' };

// What the AI receives for one pair: the same fields /api/ai/decide takes, plus the extra filtering data and the EA's own verdict.
export const toInd = (it: ScanItemT, tf: string): Ind => ({ symbol: it.symbol.toUpperCase(), tf, price: it.bid, adx: it.adx, rsi: it.rsi, atr: it.atr, ema20: it.ema20, ema50: it.ema50 });

export function aiPayload(it: ScanItemT, tf: string) {
  const r3 = (n?: number) => (n === undefined ? undefined : Math.round(n * 1000) / 1000);
  return {
    symbol: it.symbol.toUpperCase(), tf, price: it.bid, spreadPts: it.spr,
    adx: r3(it.adx), diPlus: r3(it.pdi), diMinus: r3(it.mdi), rsi: r3(it.rsi),
    atr: it.atr, atrVsAvg: r3(it.atrRatio),                       // 1.0 = normal volatility, <0.75 quiet, >1.8 spike
    ema20: it.ema20, ema50: it.ema50, emaFast: it.emaFast, emaSlow: it.emaSlow, ema200: it.emaTrend,
    emaGapInATR: r3(it.gap),                                      // distance between fast and slow EMA, in ATR
    rangeInATR: r3(it.rng),                                       // high-low range of the last bars, in ATR
    slowEmaSlopeInATR: r3(it.slope),                              // +up / -down
    emaCrossesRecent: it.chop,                                    // how many times price crossed the slow EMA recently (choppy = many)
    higherTfVsEma200: it.htf === 1 ? 'above' : it.htf === -1 ? 'below' : 'unknown',
    nearestSupport: it.sup || undefined, nearestResistance: it.res || undefined,
    eaRuleVerdict: { regime: it.regime, sidewaysVotesOf6: it.sv, upVotesOf5: it.up, downVotesOf5: it.dn },
  };
}

// Rows for the dashboard's pair table, built from the snapshot. When the AI analysed the pair its verdict is shown (and the EA's rule verdict is kept in the text).
export function scanRows(snap: ScanSnap | null): SymRow[] {
  if (!snap) return [];
  return snap.items.map((it) => {
    const k = symKey(it.symbol), r = snap.ai?.res[k], useAi = !!r && r.confidence > 0;
    return {
      symbol: it.symbol.toUpperCase(), key: k, tf: snap.tf, ts: snap.ts,
      regime: useAi ? r!.regime : it.regime, confidence: useAi ? r!.confidence : it.conf,
      reason: useAi ? `AI: ${r!.reason} · กติกา EA: ${REGIME_TH[it.regime]} (${it.note ?? ''})` : `กติกา EA: ${it.note ?? REGIME_TH[it.regime]}`,
      price: it.bid, src: useAi ? 'ai' : 'ea', eaRegime: it.regime, adx: it.adx, atrRatio: it.atrRatio, sv: it.sv, up: it.up, dn: it.dn,
    } as SymRow;
  });
}

// Pairs another EA already reports keep their row (profile / hold ...) and just get the scan numbers added; every other scanned pair becomes a row.
export function mergeScan(rows: SymRow[], snap: ScanSnap | null): SymRow[] {
  const sr = scanRows(snap);
  if (!sr.length) return rows;
  const by = new Map(sr.map((s) => [s.key, s]));
  const have = new Set(rows.map((r) => r.key));
  const out = rows.map((r) => { const s = by.get(r.key); return s ? { ...r, adx: s.adx, atrRatio: s.atrRatio, sv: s.sv, up: s.up, dn: s.dn, eaRegime: s.eaRegime, src: r.src ?? s.src } : r; });
  for (const s of sr) if (!have.has(s.key)) out.push(s);
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}
