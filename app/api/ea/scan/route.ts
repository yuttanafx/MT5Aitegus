import { eaAuth, pickAcct, who } from '@/lib/auth';
import { decideMany } from '@/lib/ai';
import { getAiConf } from '@/lib/aiconf';
import { symKey } from '@/lib/regime';
import { aiPayload, getScan, saveScan, ScanBody, type ScanAi, type ScanSnap } from '@/lib/scan';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// SR Breakout EA (v2.18+) Market Scan. One request = every pair the EA watches (price + all filter indicators + the EA's own
// trend / sideways verdict). The EA flags the pairs it wants analysed (Scan_AIAnalyze / Scan_AISymbols); those go to the AI
// in ONE call, at most once per interval set in the dashboard (the same "AI check interval" the other EAs use).
// A failed AI call never fails the push: the data is stored anyway and the dashboard keeps showing the EA's rule verdict.
const AI_BUDGET_MS = 14_000;      // the EA waits up to 20 s for the reply
const AI_RETRY_AFTER_ERROR = 5 * 60_000;

export async function POST(req: Request) {
  const a = await eaAuth(req);
  if (!a.ok) return new Response(a.msg, { status: a.status });
  const p = ScanBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response('bad body: ' + p.error.issues.slice(0, 3).map((i) => i.path.join('.') + ' ' + i.message).join('; '), { status: 400 });
  const body = p.data, acct = a.acct, now = Date.now();

  // one row per pair (the broker may repeat a symbol under another suffix; the last one wins)
  const byKey = new Map(body.items.map((it) => [symKey(it.symbol), it]));
  const items = [...byKey.values()];
  const want = items.filter((it) => it.ai);

  const [prev, conf] = await Promise.all([getScan(acct), getAiConf(acct)]);
  let ai: ScanAi | undefined;
  if (want.length) {
    const syms = want.map((it) => symKey(it.symbol)).sort();
    const old = prev?.ai;
    const sameSet = !!old && old.syms.join() === syms.join();
    const fresh = !!old && sameSet && now - old.ts < (old.error ? AI_RETRY_AFTER_ERROR : conf.intervalMin * 48_000);
    if (fresh) ai = old;
    else {
      try {
        const r = await decideMany(want.map((it) => aiPayload(it, body.tf)), acct, now + AI_BUDGET_MS);
        const res: ScanAi['res'] = {};
        for (const x of r.pairs) {
          const k = symKey(x.symbol);
          if (syms.includes(k)) res[k] = { regime: x.regime, confidence: x.confidence, reason: x.reason.slice(0, 300) };
        }
        ai = { ts: now, syms, res, summary: r.summary.slice(0, 600), provider: r.provider, model: r.model };
      } catch (e: any) {
        ai = { ts: now, syms, res: {}, error: String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 360) };
      }
    }
  }

  const snap: ScanSnap = { ts: now, tf: body.tf, ver: body.ver, bal: body.bal, eq: body.eq, cfg: body.cfg, items, ai };
  await saveScan(acct, snap);
  return new Response(['ok=1', `n=${items.length}`, `ai=${ai && !ai.error ? Object.keys(ai.res).length : 0}`].join('\n'), { headers: { 'content-type': 'text/plain' } });
}

// Dashboard / admin: the latest snapshot of the account being viewed (login with the same x-admin-key as the other dashboard calls).
export async function GET(req: Request) {
  const me = await who(req);
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const acct = await pickAcct(req, me);
  const snap = await getScan(acct);
  return Response.json({ scan: snap, ageSec: snap ? Math.round((Date.now() - snap.ts) / 1000) : null });
}
