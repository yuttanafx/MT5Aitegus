'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LangBtn, useLang } from '@/lib/i18n';
import { PHASE_AT, SCENE_MS, drawScene, phaseOf, readColors } from '@/lib/heroScene';

// Landing page shown before login. The login card (and "forgot password") is passed in as children so the sign-in logic stays in page.tsx.
// EA download: direct-download link of the file on Google Drive. Set NEXT_PUBLIC_EA_DOWNLOAD_URL to point somewhere else.
const DRIVE_ID = '1VMsHQE5ZGgIUrXVmXWwQ96kxv-jGj8Yj';
const EA_URL = process.env.NEXT_PUBLIC_EA_DOWNLOAD_URL || `https://drive.google.com/uc?export=download&id=${DRIVE_ID}`;
const EA_VIEW = `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`;

const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const TG_URL = 'https://t.me/Hub_signal_propfirmth_bot';
const LINE_URL = 'https://lin.ee/W3nixLK';
const LINE_ICON = 'M21 11.5C21 7.4 16.97 4 12 4S3 7.4 3 11.5c0 3.6 3.2 6.6 7.5 7.4l-.3 2.1 4.3-2.6C18.7 17.5 21 14.8 21 11.5Z';
const PLANE = 'M21.5 3.5 2.8 10.7c-.9.4-.9 1.2 0 1.5l4.6 1.4 1.8 5.5c.2.6.9.7 1.3.3l2.6-2.4 4.7 3.5c.7.5 1.4.2 1.6-.7l3.1-15.2c.2-1-.4-1.5-1-1.1ZM8 13.4l9.6-6-7.4 7.2-.3 3.2L8 13.4Z';

function HeroStage() {
  const { t } = useLang();
  const cv = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const el = cv.current!, ctx = el.getContext('2d')!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, w = 0, h = 0, clock = reduce ? PHASE_AT[4] + 2600 : 0, last = performance.now(), lastPhase = -1, frames = 0, onScreen = true;
    let col = readColors();
    const paint = () => {
      const p = phaseOf(clock); if (p !== lastPhase) { lastPhase = p; setPhase(p); }
      if (frames++ % 120 === 0) col = readColors();     // follows the day / night switch
      drawScene(ctx, w, h, clock, col);
    };
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), r = el.getBoundingClientRect();
      w = r.width; h = r.height; el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); paint();
    };
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(now - last, 80)); last = now;      // a long pause (hidden tab) must not skip the story; the first rAF timestamp can be older than `last`, which made the clock negative and stopped the loop
      clock = (clock + dt) % SCENE_MS; paint();
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (reduce || raf || !onScreen || document.hidden) return; last = performance.now(); raf = requestAnimationFrame(tick); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const ro = new ResizeObserver(size); ro.observe(el);
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; onScreen ? start() : stop(); }); io.observe(el);
    const vis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', vis);
    size(); start();
    return () => { stop(); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);

  return (
    <div className="lp-stage" data-p={phase}>
      <div className="lp-chart" role="img" aria-label={t("ตัวอย่างจำลอง: กราฟแท่งเทียนเคลื่อนที่ในกรอบแคบ แล้วทะลุแนวต้านขึ้นเป็นเทรนด์ AI ยืนยัน และเทเลแกรมส่งแผนซื้อให้กดสั่ง","Simulated demo: candles move in a tight range, break resistance into an uptrend, AI confirms, and Telegram sends a buy plan to tap.")}>
        <div className="lp-chart-head">
          <b>XAUUSD</b><span className="mute">H1</span>
          <span className="lp-tag lp-regime"><i className="side">{t("ไซด์เวย์","Sideways")}</i><i className="up">{t("เทรนขึ้น","Uptrend")}</i></span>
          <span className="lp-tag lp-ai"><i className="lp-orb" /><i className="think">{t("AI กำลังวิเคราะห์","AI analyzing")}</i><i className="done">{t("AI: เทรนขึ้น 86% → Trend Follow","AI: uptrend 86% → Trend Follow")}</i></span>
        </div>
        <canvas ref={cv} className="lp-canvas" />
      </div>

      <div className="lp-chat" aria-hidden="true">
        <div className="lp-chat-head">
          <span className="lp-tg"><Icon d={PLANE} size={18} /></span>
          <div><b>SR Breakout Bot</b><span>{t("บอท","Bot")}</span></div>
        </div>
        <div className="lp-chat-body">
          <div className="lp-msg lp-wait">{t("รอสัญญาณจาก EA…","Waiting for signal from EA…")}</div>
          <div className="lp-msg lp-m1">🔄 <b>{t("สภาพตลาดเปลี่ยน","Market regime changed")}</b><br />{t("XAUUSD H1: ไซด์เวย์ → ","XAUUSD H1: sideways → ")}<b>{t("เทรนขึ้น","Uptrend")}</b><br />{t("AI มั่นใจ 86%","AI confidence 86%")}</div>
          <div className="lp-msg lp-m2">
            🎯 <b>XAUUSD H1</b>{t(" · ราคา "," · price ")}<b>2,652.40</b><br />
            {t("แนวรับ","Support")} 2,646.80 · SL 2,646.10<br />
            <div className="lp-btns">
              <span>🟢 BUY TP1 · 1:1.0</span><span className="tp2">🟢 BUY TP2 · 1:2.0</span><span>🟢 BUY TP3 · 1:3.0</span>
            </div>
          </div>
          <div className="lp-msg lp-m3">✅ <b>{t("เปิดออเดอร์สำเร็จ","Order opened")}</b><br />BUY XAUUSD 0.01 lot<br />SL 2,646.10 · TP 2,665.00</div>
        </div>
      </div>
    </div>
  );
}

export default function Landing({ themeBtn, children }: { themeBtn: ReactNode; children: ReactNode }) {
  const { t } = useLang();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(location.origin), []);

  // scroll-reveal: elements with .rv fade and rise in when they enter the viewport
  useEffect(() => {
    document.documentElement.classList.add('js');
    const els = Array.from(document.querySelectorAll('.rv'));
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  const steps = [
    { t: t("EA สแกนทุกคู่เงิน","EA scans every pair"), d: t("ทุกคู่ในตะกร้าถูกวัด ADX, ATR, EMA และกรอบราคา แล้วโหวตว่าเป็นเทรนขึ้น เทรนลง ไซด์เวย์ หรือผันผวน","Every pair in your basket is measured by ADX, ATR, EMA and price range, then voted as uptrend, downtrend, sideways or volatile"), icon: 'M4 20V10M10 20V4M16 20v-7M22 20V8' },
    { t: t("AI วิเคราะห์และเลือกกลยุทธ์","AI analyzes and picks a strategy"), d: t("คู่ที่คุณเลือกถูกส่งให้ AI ในคำขอเดียว ได้ผลจำแนกสภาพตลาด เหตุผลสั้น ๆ และกลยุทธ์ที่เข้ากับสภาพนั้น (ตั้งได้ว่าสภาพไหนใช้กลยุทธ์ใด)","Your selected pairs go to the AI in a single request. You get the market regime, a short rationale and a matching strategy (you can set which strategy each regime uses)"), icon: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1' },
    { t: t("กดสั่งในเทเลแกรม","Tap to order in Telegram"), d: t("เลือกคู่ ดูแนวรับต้านกับ SL และ TP1–3 พร้อม RR ของแต่ละระดับ กดยืนยันแล้ว EA เปิดไม้ให้","Pick a pair, review support/resistance, SL and TP1–3 with each level's RR, confirm, and the EA opens the trade"), icon: PLANE },
  ];
  const points = [
    [t("แยกไม้ออโต้กับไม้ที่กดเอง","Auto trades and manual trades kept apart"), t("ไม้ที่สั่งจากเทเลแกรมใช้ Magic Number คนละชุดกับไม้ออโต้ กริดและ Recovery จึงไม่แตะไม้ที่คุณกดเอง","Trades placed from Telegram use a different Magic Number from auto trades, so grid and Recovery never touch the ones you open yourself")],
    [t("หยุดก่อนชนกฎของ Prop Firm","Stops before breaking prop firm rules"), t("ชน Daily Loss หรือ Max Drawdown แล้ว EA หยุดเปิดไม้ใหม่ ทั้งไม้ออโต้และไม้จากเทเลแกรม และกำหนดเพดาน lot ต่อไม้ได้","When Daily Loss or Max Drawdown is hit, the EA stops opening new trades, both auto and Telegram, and you can cap lot size per trade")],
    [t("หลายบัญชีในเว็บเดียว","Multiple accounts on one site"), t("ผู้ดูแลออกรหัสผ่านและ EA key แยกรายบัญชี สมาชิกใช้ API key ของ AI ของตัวเอง ไม่ปนกัน","The admin issues passwords and EA keys per account; members use their own AI API keys, never mixed")],
    [t("พักระบบได้ทุกเมื่อ","Pause anytime"), t("กดหยุดส่งคำสั่งทั้งหมดจากหน้าเว็บหรือเทเลแกรมได้ทันที ไม้ที่เปิดอยู่ยังเป็นของคุณ","Stop all orders from the web or Telegram instantly. Open trades stay yours")],
  ];

  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="#top"><span className="lp-mark"><i /><i /><i /></span>MT5 Signal Hub</a>
        <div className="row"><LangBtn />{themeBtn}<a className="btn lp-line-btn lp-nav-line" href={LINE_URL} target="_blank" rel="noopener noreferrer">{t("ติดต่อเรา","Contact us")}</a><a className="btn" href="#login">{t("เข้าสู่ระบบ","Log in")}</a></div>
      </header>

      <section className="lp-hero" id="top">
        <div className="lp-copy">
          <h1 className="lp-h1">{t("AI วิเคราะห์สภาพตลาดทุกคู่เงิน แล้วเลือก","AI reads the market on every pair, then picks ")}<span style={{ whiteSpace: 'nowrap' }}>{t("กลยุทธ์ที่ใช่","the right strategy")}</span>{t("ให้"," for you")}</h1>
          <div className="lp-side">
            <p className="lp-lead">{t("AI อ่านว่าแต่ละคู่เงินกำลังเทรนขึ้น เทรนลง หรือไซด์เวย์ แล้วเลือกกลยุทธ์ที่รองรับ เช่น Trend Follow, EMA Pullback, Range Reversion เซิร์ฟเวอร์ตรวจเงื่อนไขของกลยุทธ์ก่อนทุกครั้ง AI ไม่ได้สั่งเทรนเอง คุณกดสั่งพร้อมแผน SL/TP/RR ได้จากเทเลแกรม","AI reads whether each pair is trending up, trending down or sideways, then picks a supported strategy such as Trend Follow, EMA Pullback or Range Reversion. The server checks the strategy's conditions every time. The AI never trades on its own: you tap to order, with an SL/TP/RR plan, from Telegram.")}</p>
            <div className="row">
              <a className="btn main lp-cta" href={EA_URL} rel="noopener"><Icon d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" size={20} />{t("ดาวน์โหลด EA","Download EA")}</a>
              <a className="btn lp-cta" href="#login">{t("เข้าสู่ระบบ","Log in")}</a>
              <a className="btn lp-cta lp-tg-btn" href={TG_URL} target="_blank" rel="noopener noreferrer"><Icon d={PLANE} size={20} />{t("เปิดบอทเทเลแกรม","Open Telegram bot")}</a>
            </div>
            <div className="mute">{t("สำหรับ MetaTrader 5 · เชื่อมกับเว็บด้วยรหัสจากผู้ดูแล","For MetaTrader 5 · connect to the site with a code from your admin")}</div>
          </div>
        </div>
        <HeroStage />
        <div className="mute lp-note">{t("ภาพตัวอย่างจำลอง ราคาและข้อความไม่ใช่ข้อมูลตลาดจริง","Simulated demo. Prices and messages are not real market data.")}</div>
      </section>

      <section className="lp-sec" aria-labelledby="how">
        <h2 id="how" className="lp-h2 rv">{t("จากกราฟถึงออเดอร์ ใน 3 ขั้น","From chart to order in 3 steps")}</h2>
        <ol className="lp-steps">
          {steps.map((s, i) => (
            <li key={s.t} className="rv" style={{ transitionDelay: `${i * 120}ms` }}>
              <span className="lp-step-ic"><Icon d={s.icon} /><em>{i + 1}</em></span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-sec lp-split" aria-labelledby="safe">
        <div>
          <h2 id="safe" className="lp-h2 rv">{t("ควบคุมความเสี่ยงได้ในตัว","Built-in risk control")}</h2>
          <div className="lp-ai-row rv">
            <div className="orb-wrap idle lp-mini-orb" aria-hidden="true"><div className="orb-glow" /><div className="orb-core" /></div>
            <p className="mute">{t("AI ช่วยอ่านสภาพตลาด แต่ไม่ได้สั่งเทรนเอง ทุกออเดอร์ผ่านด่านตรวจของ EA ก่อนเปิดเสมอ","The AI helps read the market but never trades on its own. Every order passes the EA's checks before it opens.")}</p>
          </div>
        </div>
        <ul className="lp-points">
          {points.map(([h, d], i) => <li key={h} className="rv" style={{ transitionDelay: `${i * 100}ms` }}><h3>{h}</h3><p>{d}</p></li>)}
        </ul>
      </section>

      <section className="lp-sec lp-get" id="login" aria-labelledby="get">
        <div className="lp-dl rv">
          <h2 id="get" className="lp-h2">{t("เริ่มใช้งาน","Get started")}</h2>
          <a className="btn main lp-cta" href={EA_URL} rel="noopener"><Icon d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" size={20} />{t("ดาวน์โหลด EA","Download EA")}</a>
          <a className="btn lp-cta lp-tg-btn" href={TG_URL} target="_blank" rel="noopener noreferrer"><Icon d={PLANE} size={20} />{t("เปิดบอทเทเลแกรม","Open Telegram bot")}</a>
          <a className="mute" href={EA_VIEW} target="_blank" rel="noopener noreferrer">{t("ดาวน์โหลดไม่ได้? เปิดไฟล์บน Google Drive","Can't download? Open the file on Google Drive")}</a>
          <ol className="lp-install">
            <li>{t("วางไฟล์ลงในโฟลเดอร์ ","Place the file in the folder ")}<code>MQL5/Experts</code>{t(" แล้วคอมไพล์ใน MetaEditor"," and compile it in MetaEditor")}</li>
            <li>{t("ใน MT5 ไปที่ Tools › Options › Expert Advisors เลือก Allow WebRequest แล้วเพิ่ม https://docs.google.com ","In MT5 go to Tools › Options › Expert Advisors, tick Allow WebRequest and add ")}<code>{origin || t("ลิงก์เว็บนี้","this site's link")}</code></li>
            <li>{t("ใส่ ","Set ")}<code>Hub_Url</code>{t(" เป็นลิงก์เดียวกัน และ "," to the same link, and ")}<code>Hub_EAKey</code>{t(" ตามที่ผู้ดูแลออกให้"," as issued by your admin")}</li>
          </ol>
        </div>
        <div className="lp-login rv" style={{ transitionDelay: '150ms' }}>{children}</div>
      </section>

      <section className="lp-sec lp-contact rv" id="contact" aria-labelledby="contact-h">
        <img className="lp-promo-img" src="/mts-capital-futures.jpg" alt="MTS Capital เทรด Futures อย่างมั่นใจ มีใบอนุญาตจาก กลต. Meta Trader 5" width={494} height={619} loading="lazy" decoding="async" />
        <div className="lp-contact-txt">
          <h2 id="contact-h" className="lp-h2">{t("ติดต่อเรา","Contact us")}</h2>
          <p className="mute">{t("มีคำถามหรืออยากสมัครใช้งาน ทักไลน์ OA ได้เลย","Questions or want to sign up? Message us on LINE OA.")}</p>
          <a className="btn lp-cta lp-line-btn" href={LINE_URL} target="_blank" rel="noopener noreferrer"><Icon d={LINE_ICON} size={20} />{t("ติดต่อเรา ผ่าน LINE OA","Contact us on LINE OA")}</a>
        </div>
      </section>

      <footer className="lp-foot mute">{t("การเทรดมีความเสี่ยง ผลในอดีตและภาพตัวอย่างไม่รับประกันผลในอนาคต ควรทดสอบกับบัญชีทดลองก่อนใช้เงินจริง","Trading involves risk. Past results and demo visuals do not guarantee future results. Test on a demo account before using real money.")}</footer>
    </div>
  );
}
