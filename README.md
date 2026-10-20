# MT5 Signal Hub

เว็บกลางรับสัญญาณ (TradingView webhook หรือ AI ที่ EA ส่งข้อมูลมาให้) แล้วส่งเข้า EA ใน MT5

```
TradingView ─┐                                   ┌─> /api/ea/poll  <── EA (MT5) ดึงคำสั่งทุก 3 วินาที
             ├─> /api/webhook ─> Risk ─> คิว ────┤
EA ─> /api/ai/decide ─> AI เลือกกลยุทธ์ ─> กฎ ─> Risk ─┘   EA ส่งผลกลับที่ /api/ea/report
```

AI เลือก "กลยุทธ์" เท่านั้น ส่วนเงื่อนไขเข้าเทรดเช็กด้วยกฎใน `lib/strategies.ts` ที่ตายตัวและตรวจสอบได้

## 1) ขึ้น Vercel
1. แตก zip แล้ว `git init` → push ขึ้น GitHub
2. Vercel → Add New → Project → เลือก repo → Deploy
3. Vercel → Storage / Marketplace → เพิ่ม **Upstash Redis** แล้วต่อเข้ากับโปรเจกต์ (ได้ตัวแปร URL/TOKEN อัตโนมัติ)
4. Settings → Environment Variables ใส่ตาม `.env.example`
   (อย่างน้อย `ADMIN_KEY`, `EA_API_KEY`, `WEBHOOK_SECRET` และ API key ของ AI เจ้าที่ใช้) แล้ว Redeploy
5. เปิดเว็บ ใส่ `ADMIN_KEY` เพื่อเข้าหน้า Dashboard

ไม่มี Redis ก็รันได้ แต่ข้อมูลอยู่ในหน่วยความจำ จะหายเมื่อฟังก์ชันรีสตาร์ท ใช้ทดสอบในเครื่อง (`npm i && npm run dev`) เท่านั้น

## 2) ติดตั้ง EA
1. คัดลอก `ea/SignalHubEA.mq5` ไปที่ `MQL5/Experts` แล้วคอมไพล์ใน MetaEditor
2. MT5 → Tools → Options → Expert Advisors → ติ๊ก **Allow WebRequest** และเพิ่ม `https://YOUR-APP.vercel.app`
3. ลาก EA ลงกราฟ ตั้ง `ServerUrl`, `ApiKey` (= `EA_API_KEY`), `SignalTF`, `SymbolSuffix` (ถ้าโบรกเกอร์ต่อท้ายชื่อ) และเปิด Algo Trading

## 3) ทดสอบ webhook
```
curl -X POST "https://YOUR-APP.vercel.app/api/webhook?key=WEBHOOK_SECRET" \
  -H "content-type: application/json" \
  -d '{"symbol":"XAUUSD","side":"buy","lot":0.01,"sl":2400,"tp":2430}'
```
TradingView ใส่ URL เดียวกัน (ใส่ `?key=` ต่อท้าย เพราะตั้ง header ไม่ได้) และใส่ JSON ข้างบนเป็นข้อความ alert

## ข้อควรรู้
- **ทดสอบบนบัญชี Demo ก่อนเสมอ** และเริ่มจาก lot เล็ก ระบบนี้เป็นเครื่องมือ ไม่ได้รับประกันกำไร
- `MAX_LOT`, `ALLOWED_SYMBOLS`, ปุ่ม "หยุดส่งคำสั่งทั้งหมด" ทำงานฝั่งเซิร์ฟเวอร์ ส่วนขีดจำกัดขาดทุนรายวันยังไม่ได้ทำ (ต้องให้ EA รายงานกำไร/ขาดทุนกลับมาก่อน)
- ชื่อโมเดลเริ่มต้นใน `.env.example` ตรวจสอบกับเอกสารของแต่ละเจ้าอีกครั้งก่อนใช้ แล้วแก้ผ่านตัวแปร `*_MODEL` หรือในหน้า Dashboard ได้
- EA ดึงทุก 3 วินาที = ประมาณ 28,800 ครั้ง/วัน ถ้าติดโควตาของแพ็กเกจ ให้เพิ่ม `PollSeconds` หรือย้ายส่วน poll ไปเซิร์ฟเวอร์ที่รันตลอด
- คิวเก็บเป็นรายการเดียวใน Redis เหมาะกับบัญชีเดียวและสัญญาณไม่ถี่มาก ถ้าจะรองรับหลายบัญชีให้แยกคิวต่อบัญชี
