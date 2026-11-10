// Canvas scene for the landing hero: a candlestick chart that builds up while the market moves sideways, breaks out of the range,
// pulls back to the broken level and then shows the entry / stop / TP1-3 lines the sniper plan would use (same RR idea as the EA).
// Pure drawing code (no React), driven by one clock `t` in ms, so the page can loop it and the layout can follow its phases.
// Prices are made up and the candles come from a fixed seed: it is an illustration, not market data.

export const STEP_SIDE = 275;           // ms per candle while the market is moving sideways
export const STEP_TREND = 400;          // ms per candle after the breakout
export const N_SIDE = 24;
export const N_TREND = 14;
export const N = N_SIDE + N_TREND;
export const T_BREAK = N_SIDE * STEP_SIDE;                       // the breakout candle starts here
const idxStart = (i: number) => (i < N_SIDE ? i * STEP_SIDE : T_BREAK + (i - N_SIDE) * STEP_TREND);
export const T_END = idxStart(N);
// phases: 0 sideways, 1 breakout (EA rule says trend up), 2 AI confirms, 3 Telegram offers the plan, 4 order opened from the button
export const PHASE_AT = [0, T_BREAK + 400, T_BREAK + 1300, idxStart(31), idxStart(34)];
export const FADE_AT = T_END + 2400;
export const SCENE_MS = FADE_AT + 700;
export const phaseOf = (t: number) => { let p = 0; for (let i = 1; i < PHASE_AT.length; i++) if (t >= PHASE_AT[i]) p = i; return p; };

type Candle = { o: number; h: number; l: number; c: number };
export type Colors = { up: string; down: string; text: string; mute: string; line: string; accent: string; warn: string; ai: string; font: string };

const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function build() {
  const r = rng(11);
  const candles: Candle[] = [];
  let prev = 100;
  for (let i = 0; i < N_SIDE; i++) {
    const c = 100 + Math.sin(i * 0.75) * 1.15 + (r() - 0.5) * 0.9;
    const hi = Math.max(prev, c) + 0.15 + r() * 0.45, lo = Math.min(prev, c) - 0.15 - r() * 0.45;
    candles.push({ o: prev, h: hi, l: lo, c }); prev = c;
  }
  const res = Math.max(...candles.map((x) => x.h)) + 0.05, sup = Math.min(...candles.map((x) => x.l)) - 0.05;
  // trend leg, relative to the broken resistance: breakout, run, pullback to the broken level (the retest), run again
  const rel = [0.9, 1.8, 2.7, 2.3, 3.4, 4.3, 3.8, 3.0, 2.2, 1.0, 1.9, 3.0, 4.1, 5.0];
  for (let i = 0; i < N_TREND; i++) {
    const c = res + rel[i], up = c >= prev;
    const hi = Math.max(prev, c) + 0.12 + r() * 0.3 * (up ? 1 : 0.5), lo = Math.min(prev, c) - 0.12 - r() * 0.3 * (up ? 0.5 : 1);
    candles.push({ o: prev, h: hi, l: lo, c }); prev = c;
  }
  const entry = res + 1.0, sl = res - 0.5, risk = entry - sl;       // the retest candle closes at the entry
  const tp = [1, 2, 3].map((k) => entry + k * risk);
  const hiAll = Math.max(...candles.map((x) => x.h), tp[2]);
  return { candles, res, sup, entry, sl, tp, ymin: sup - 1.1, ymax: hiAll + 1.0 };
}
const S = build();

export function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement), g = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return { up: g('--up', '#2DD4BF'), down: g('--down', '#FB7185'), text: g('--text', '#E6EAF0'), mute: g('--mute', '#8B95A3'), line: g('--line', '#232A33'),
    accent: g('--accent', '#2DD4BF'), warn: g('--warn', '#FB923C'), ai: g('--ai', '#A78BFA'), font: getComputedStyle(document.body).fontFamily || 'sans-serif' };
}

// older browsers have no roundRect: square corners are fine
const rrect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);

export function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, col: Colors) {
  ctx.clearRect(0, 0, w, h);
  if (w < 40 || h < 40) return;
  if (!(t >= 0)) t = 0;                                  // never index candles with a negative / NaN clock
  const padL = 12, padR = w < 520 ? 70 : 92, padT = 16, padB = 16;
  const pw = w - padL - padR, ph = h - padT - padB;
  const y = (v: number) => padT + (1 - (v - S.ymin) / (S.ymax - S.ymin)) * ph;
  const slot = pw / (N + 1), bodyW = Math.max(3, slot * 0.58);
  const x = (i: number) => padL + slot * (i + 0.8);
  const fade = t > FADE_AT ? 1 - clamp((t - FADE_AT) / (SCENE_MS - FADE_AT)) : 1;
  ctx.globalAlpha = fade;
  ctx.font = `600 ${w < 520 ? 11 : 12}px ${col.font}`;
  ctx.textBaseline = 'middle';

  // quiet grid
  ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.globalAlpha = 0.55 * fade;
  for (let k = 1; k < 5; k++) { const gy = Math.round(padT + (ph * k) / 5) + 0.5; ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR + 8, gy); ctx.stroke(); }
  ctx.globalAlpha = fade;

  const tagRight = (txt: string, yy: number, color: string, alpha: number) => {
    if (alpha <= 0) return;
    ctx.globalAlpha = fade * alpha;
    const tw = ctx.measureText(txt).width + 12;
    ctx.fillStyle = color; ctx.beginPath(); rrect(ctx, w - padR + 12, yy - 10, tw, 20, 6); ctx.fill();
    ctx.fillStyle = '#0B1220'; ctx.fillText(txt, w - padR + 18, yy + 0.5);
    ctx.globalAlpha = fade;
  };

  // support / resistance appear once the range has formed
  const tSR = 12 * STEP_SIDE, aSR = ease((t - tSR) / 600);
  if (aSR > 0) {
    ctx.setLineDash([6, 5]); ctx.lineWidth = 1.25;
    for (const [v, c, label] of [[S.res, col.down, 'แนวต้าน'], [S.sup, col.up, 'แนวรับ']] as const) {
      ctx.globalAlpha = fade * aSR * 0.85; ctx.strokeStyle = c;
      ctx.beginPath(); ctx.moveTo(x(2), y(v)); ctx.lineTo(w - padR + 8, y(v)); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = fade;
    tagRight('แนวต้าน', y(S.res), col.down, aSR); tagRight('แนวรับ', y(S.sup), col.up, aSR);
  }

  // order plan lines (entry, stop, TP1-3) drawn from the entry candle once the order is opened
  const tPlan = PHASE_AT[4], iEntry = 33;
  const planLines: [number, string, string][] = [[S.tp[2], col.up, 'TP3 1:3'], [S.tp[1], col.up, 'TP2 1:2'], [S.tp[0], col.up, 'TP1 1:1'], [S.entry, col.accent, 'เข้า BUY'], [S.sl, col.down, 'SL']];
  planLines.forEach(([v, c, label], k) => {
    const a = ease((t - tPlan - k * 140) / 450);
    if (a <= 0) return;
    ctx.globalAlpha = fade * a * 0.9; ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash(k === 3 ? [] : [3, 4]);
    ctx.beginPath(); ctx.moveTo(x(iEntry), y(v)); ctx.lineTo(x(iEntry) + (w - padR + 8 - x(iEntry)) * a, y(v)); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = fade;
    tagRight(label, y(v), c, a);
  });

  // candles
  const live = Math.min(N - 1, t < T_BREAK ? Math.floor(t / STEP_SIDE) : N_SIDE + Math.floor((t - T_BREAK) / STEP_TREND));
  for (let i = 0; i <= live; i++) {
    const cd = S.candles[i];
    const f = i === live && t < T_END ? ease((t - idxStart(i)) / (i < N_SIDE ? STEP_SIDE : STEP_TREND)) : 1;   // the newest candle is still forming
    const c = cd.o + (cd.c - cd.o) * f, hi = Math.max(cd.o, c) + (cd.h - Math.max(cd.o, cd.c)) * f, lo = Math.min(cd.o, c) - (Math.min(cd.o, cd.c) - cd.l) * f;
    const color = c >= cd.o ? col.up : col.down, cx = x(i);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx, y(hi)); ctx.lineTo(cx, y(lo)); ctx.stroke();
    const top = y(Math.max(cd.o, c)), hgt = Math.max(1.5, Math.abs(y(cd.o) - y(c)));
    ctx.beginPath(); rrect(ctx, cx - bodyW / 2, top, bodyW, hgt, 1.5); ctx.fill();
  }

  // ring on the breakout candle
  const tRing = idxStart(N_SIDE) + STEP_TREND;
  if (t > tRing) {
    const a = ease((t - tRing) / 500), cx = x(N_SIDE), cy = y(S.candles[N_SIDE].c);
    ctx.globalAlpha = fade * (t < tRing + 1600 ? a : Math.max(0, 1 - (t - tRing - 1600) / 600)); ctx.strokeStyle = col.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 8 + 10 * (1 - a), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = fade;
  }

  // pulse on the latest price
  if (t < T_END) {
    const cd = S.candles[live], cx = x(live), cy = y(cd.c), p = (t % 1200) / 1200;
    ctx.globalAlpha = fade * (1 - p) * 0.6; ctx.fillStyle = cd.c >= cd.o ? col.up : col.down;
    ctx.beginPath(); ctx.arc(cx + bodyW / 2 + 8, cy, 3 + p * 9, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = fade; ctx.beginPath(); ctx.arc(cx + bodyW / 2 + 8, cy, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
