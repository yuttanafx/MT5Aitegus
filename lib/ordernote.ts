// Turns the short reason codes the EA (and the web) put in an order's note into a sentence the user can act on.
// Pure text helper: used by the Telegram bot, the dashboard and the order list. Unknown notes are returned unchanged.
const RC: Record<number, string> = {
  10004: 'ราคาเปลี่ยน (Requote) ลองกดใหม่อีกครั้ง',
  10006: 'โบรกเกอร์ปฏิเสธคำสั่ง',
  10013: 'คำสั่งไม่ถูกต้อง',
  10014: 'ขนาด lot ไม่ถูกต้อง (ตรวจ Lot Start ให้ตรงกับ lot ต่ำสุด/ขั้น lot ของโบรกเกอร์)',
  10015: 'ราคาในคำสั่งไม่ถูกต้อง',
  10016: 'ระดับ SL/TP ไม่ถูกต้อง',
  10017: 'โบรกเกอร์ปิดการเทรดของบัญชี/สัญลักษณ์นี้',
  10018: 'ตลาดปิดอยู่',
  10019: 'เงินในบัญชีไม่พอ (margin ไม่พอ) ให้ลด lot',
  10020: 'ราคาเปลี่ยนเร็ว ลองกดใหม่',
  10021: 'ยังไม่มีราคา (quote) จากโบรกเกอร์ตอนนี้',
  10024: 'ส่งคำสั่งถี่เกินไป',
  10027: 'ปุ่ม Algo Trading ของ MT5 ปิดอยู่ (กด Ctrl+E เพื่อเปิด)',
  10028: 'เซิร์ฟเวอร์โบรกเกอร์ปิด Algo Trading ของบัญชีนี้',
  10030: 'โหมด filling ของสัญลักษณ์นี้ไม่รองรับคำสั่งที่ส่ง',
  10031: 'MT5 ไม่ได้เชื่อมต่อเซิร์ฟเวอร์โบรกเกอร์',
  10033: 'เกินจำนวนคำสั่งค้างที่โบรกเกอร์กำหนด',
  10034: 'เกินปริมาณรวมของสัญลักษณ์นี้ที่โบรกเกอร์กำหนด',
  10040: 'จำนวนไม้ที่เปิดของบัญชีเต็มตามที่โบรกเกอร์กำหนด',
  10042: 'โบรกเกอร์อนุญาตเฉพาะฝั่ง BUY',
  10043: 'โบรกเกอร์อนุญาตเฉพาะฝั่ง SELL',
  10044: 'โบรกเกอร์อนุญาตเฉพาะการปิดไม้ (Close only)',
  10045: 'ติดกฎ FIFO ของโบรกเกอร์',
};

export function explainNote(note?: string | null, short = false): string | undefined {
  if (!note) return undefined;
  const n = note.trim();
  const out = (cause: string, fix?: string) => (short || !fix ? cause : `${cause} → ${fix}`);
  let m: RegExpMatchArray | null;

  // ----- reasons reported by the EA (new short codes, and the older plain-text ones)
  if ((m = n.match(/^lic:(.*)$/i)) || n === 'licence off') return out(`EA ไม่ผ่านการตรวจสิทธิ์ใช้งาน${m && m[1].trim() ? ` (${m[1].trim()})` : ''}`, 'ต่ออายุบนเว็บ หรือตรวจ AI_EAKey ให้ตรงกับเลขบัญชี MT5');
  if (n === 'sys:off' || /^system off/i.test(n)) return out('สวิตช์ระบบ SmartGold บนเว็บถูกปิดอยู่ จึงไม่เปิดไม้ใหม่', 'เปิดสวิตช์ระบบในหน้า Dashboard');
  if ((m = n.match(/^basket:(\d+)/)) || n === 'basket open') return out(`EA มีไม้ค้างอยู่${m ? ` ${m[1]} ไม้` : ''} และตั้ง AI_BlockWhileOpen = true (รอปิดไม้เดิมก่อนรับออเดอร์จากเว็บ)`, 'ปิดไม้เดิมก่อน หรือตั้ง AI_BlockWhileOpen = false ในอินพุต EA');
  if (n === 'side:bad' || n === 'bad side') return out('ฝั่งของคำสั่งไม่ถูกต้อง (ต้องเป็น BUY หรือ SELL)');
  if (n === 'term:off') return out('ปุ่ม Algo Trading ของโปรแกรม MT5 ปิดอยู่', 'กดปุ่ม Algo Trading ให้เป็นสีเขียว (Ctrl+E)');
  if (n === 'algo:off') return out('EA ไม่ได้รับอนุญาตให้เทรด', 'ในหน้าต่างตั้งค่า EA แท็บ Common ติ๊ก Allow Algo Trading และเปิดปุ่ม Algo Trading');
  if (n === 'mkt:closed') return out('สัญลักษณ์นี้ปิดการเทรดอยู่ (ตลาดปิดหรือโบรกเกอร์ปิด)', 'รอตลาดเปิด');
  if (n === 'mkt:close_only') return out('โบรกเกอร์อนุญาตเฉพาะการปิดไม้ของสัญลักษณ์นี้');
  if (n === 'mkt:long_only') return out('สัญลักษณ์นี้เปิดได้เฉพาะ BUY');
  if (n === 'mkt:short_only') return out('สัญลักษณ์นี้เปิดได้เฉพาะ SELL');
  if ((m = n.match(/^rc:(\d+)(?::(.*))?$/)) || (m = n.match(/^retcode (\d+)/))) {
    const code = Number(m[1]);
    return out(RC[code] ?? `MT5 ปฏิเสธคำสั่ง (รหัส ${code}${m[2] ? ` ${m[2].trim()}` : ''})`, RC[code] ? undefined : 'ค้นรหัสนี้ในเอกสาร MT5 (Trade server return codes)');
  }

  // ----- reasons found by the web itself
  if (n === 'ea:never') return out('ยังไม่เคยเห็น EA ของคู่นี้ติดต่อเว็บเลย คำสั่งจึงไม่ถึง MT5', 'เปิด EA บนกราฟคู่นี้ ตั้ง AI_WebOrders = true ใส่ AI_Url / AI_EAKey ให้ถูก และเพิ่ม URL ใน Allow WebRequest');
  if ((m = n.match(/^ea:offline:(\d+)/))) return out(`EA ของคู่นี้ไม่ได้ติดต่อเว็บมา ${m[1]} นาทีแล้ว คำสั่งอาจไม่ถึง MT5`, 'เช็กว่า EA ยังรันบนกราฟคู่นี้ AI_WebOrders = true และ MT5 ออนไลน์อยู่');
  if (n === 'exp:symbol') return out('หมดเวลา: ไม่มี EA ของคู่นี้มารับคำสั่งภายใน 2 นาที (EA ที่เชื่อมอยู่เป็นคู่อื่น)', 'ลง EA บนกราฟของคู่นี้ หรือเลือกคู่ที่มี EA รันอยู่');
  if (n === 'exp:nopoll' || n === 'exp:late') return out('หมดเวลา: ไม่มี EA มารับคำสั่งภายใน 2 นาที', 'เช็กว่า EA รันอยู่ AI_WebOrders = true และ AI_Url / AI_EAKey ถูกต้อง');
  if (n === 'exp:noreport') return out('ส่งคำสั่งให้ EA แล้ว แต่ไม่มีรายงานกลับมา', 'ดูแท็บ Trade ของ MT5 ว่าไม้เปิดแล้วหรือยัง และดูแท็บ Experts ว่า EA แจ้งอะไร');
  if (/a sniper position is already open/i.test(n)) return out('คู่นี้มีไม้สไนเปอร์เปิดค้างอยู่แล้ว และสวิตช์ "หลายออเดอร์ต่อคู่" บนเว็บปิดอยู่', 'เปิดสวิตช์ในการ์ด "เลือกระบบเทรด" หรือรอปิดไม้เดิมก่อน');
  if ((m = n.match(/sniper position limit reached.*\((\d+)\)/i))) return out(`คู่นี้มีไม้สไนเปอร์ค้างครบ ${m[1]} ไม้แล้ว (เพดาน Sn_MultiMax)`, 'รอปิดไม้เดิม หรือเพิ่ม Sn_MultiMax ในอินพุตของ EA');
  if (/several orders on one symbol need a hedging/i.test(n)) return out('บัญชีนี้เป็นแบบ Netting จึงเปิดหลายไม้คู่เดียวกันไม่ได้ (ไม้จะถูกรวมเป็นไม้เดียว)', 'ต้องใช้บัญชีแบบ Hedging');
  return n;
}
