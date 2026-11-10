'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// Tiny TH/EN switch. Usage: const { t } = useLang();  t('ข้อความไทย', 'English text')
import { EN } from './en';
export type Lang = 'th' | 'en';

// tx(thai): translate by dictionary (lib/en.ts); works anywhere, also outside components. tp(map): same for a constant object's values.
let CUR: 'th' | 'en' = 'th';
export const tx = (th: string) => (CUR === 'en' ? EN[th] ?? th : th);
export const tp = <T extends Record<string, string>>(o: T): T => new Proxy(o, { get: (t, k) => { const v = (t as any)[k]; return typeof v === 'string' ? tx(v) : v; } });
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (th: string, en: string) => string };
const LangCtx = createContext<Ctx>({ lang: 'th', setLang: () => {}, t: (th) => th });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setL] = useState<Lang>('th');
  CUR = lang;   // set during render, before the children render
  useEffect(() => {
    try {
      const s = localStorage.getItem('lang');
      if (s === 'en' || s === 'th') setL(s);
      else if (!navigator.language.toLowerCase().startsWith('th')) setL('en');   // first visit: follow the browser language
    } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => { setL(l); try { localStorage.setItem('lang', l); } catch {} }, []);
  const t = useCallback((th: string, en: string) => (lang === 'en' ? en : th), [lang]);
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

export function LangBtn() {
  const { lang, setLang } = useLang();
  return (
    <button className="btn lang-btn" onClick={() => setLang(lang === 'th' ? 'en' : 'th')} aria-label={lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}>
      🌐 {lang === 'th' ? 'EN' : 'TH'}
    </button>
  );
}
