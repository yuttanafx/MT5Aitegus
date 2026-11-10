import './globals.css';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import Galaxy from '@/components/Galaxy';
import Sky from '@/components/Sky';
import { LangProvider } from '@/lib/i18n';

const font = IBM_Plex_Sans_Thai({ subsets: ['thai', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap' });
export const metadata = { title: 'MT5 Signal Hub', description: 'AI วิเคราะห์สภาพตลาดทุกคู่เงินใน MT5 เลือกกลยุทธ์ที่เหมาะ และสั่งออเดอร์จากเทเลแกรม' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('theme')||'dark'}catch(e){}" }} /></head>
      <body className={font.className}>
        <LangProvider>
          <Sky />
          <Galaxy />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
