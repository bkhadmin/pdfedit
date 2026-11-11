# PDF Edit

โปรแกรมแก้ไขและเซ็น PDF สร้างด้วย React + Vite + Electron

## ภาพรวม

- เปิดและรวมหลายไฟล์ PDF เข้าด้วยกัน (เลือกหลายไฟล์พร้อมกันได้)
- จัดลำดับหน้าใหม่ (ลากหรือใช้ปุ่มลูกศร) และลบหน้าที่ไม่ต้องการ
- เซ็นชื่อ: วาดลายเซ็น, อัปโหลดรูปลายเซ็น, หรือบันทึกลายเซ็นไว้ใช้ซ้ำ
- แทรกข้อความ: เลือกฟอนต์จากเครื่อง, กำหนดขนาดและสี, พื้นหลังทึบที่กลมกลืนกับ PDF
- ย้อนกลับการแก้ไขด้วย Ctrl+Z
- พิมพ์เอกสาร
- ลายเซ็นดิจิทัลด้วยใบรับรอง `.p12` / `.pfx` (ใช้ได้เฉพาะโปรแกรม Windows)
- อัปเดตอัตโนมัติผ่าน GitHub Releases (เฉพาะโปรแกรม Windows)

โครงสร้างหลัก:

- `src/` — ส่วนหน้าจอ (renderer) ใช้ pdf.js แสดงผล และ pdf-lib เขียนไฟล์ ลายเซ็นและข้อความเป็น PNG overlay ที่ฝังลงไฟล์ตอนบันทึก
- `electron/` — ส่วน shell ของ Electron รวมถึงการเซ็นด้วยใบรับรอง (`electron/sign.cjs`) ทำงานใน main process ผ่าน IPC (`preload.cjs` → `window.pdfedit`)
- `test/` — เทสต์การเซ็นด้วยใบรับรอง

## เริ่มต้นพัฒนา

```bash
npm install        # ติดตั้ง dependencies
npm run dev        # เปิด dev server บนเบราว์เซอร์
npm start          # build แล้วเปิดด้วย Electron
npm test           # รันเทสต์การเซ็นด้วยใบรับรอง
```

## Build

### Windows installer

```bash
npm run dist
```

ได้ไฟล์ติดตั้งที่ `release/PDF Edit Setup <version>.exe`

### Web app

```bash
npm run build:web
```

ได้ไฟล์ static ที่โฟลเดอร์ `dist/` นำไปวางบนเซิร์ฟเวอร์ใดก็ได้ที่ใช้ HTTPS

ความต่างของเวอร์ชันเว็บเมื่อเทียบกับโปรแกรม Windows:

- ไม่มีลายเซ็นดิจิทัล (ต้องใช้ Electron main process)
- ไม่มีการอัปเดตอัตโนมัติ
- รายชื่อฟอนต์ในเครื่องใช้ได้เฉพาะ Chrome/Edge (เบราว์เซอร์จะขออนุญาตก่อน) เบราว์เซอร์อื่นจะใช้รายชื่อฟอนต์สำรอง
- ลายเซ็นที่บันทึกไว้เก็บแยกตามเบราว์เซอร์

## ออกเวอร์ชันใหม่ (release + auto-update)

1. เปลี่ยนเวอร์ชันใน package.json:
   ```bash
   npm version <x.y.z> --no-git-tag-version
   ```
2. commit การเปลี่ยนแปลง แล้วสร้างและ push tag:
   ```bash
   git tag v<x.y.z>
   git push && git push origin v<x.y.z>
   ```
3. ตั้ง environment variable `GH_TOKEN` เป็น GitHub personal access token ที่มีสิทธิ์ `repo` (PowerShell):
   ```powershell
   $env:GH_TOKEN="ghp_..."
   ```
4. รันคำสั่ง release ซึ่ง build installer และอัปโหลด installer กับ `latest.yml` ขึ้น GitHub Release:
   ```bash
   npm run release
   ```
   electron-builder จะสร้าง Release เป็น **draft** ให้ไปที่ GitHub แล้วกด publish draft นั้น
5. โปรแกรมที่ติดตั้งแล้วจะแสดงปุ่มสีเหลือง "อัปเดตเป็น vX" ตอนเปิดโปรแกรม

หมายเหตุ:

- repo ต้องเป็น **public** เพื่อให้ตัวโปรแกรมเช็กอัปเดตได้โดยไม่ต้องฝัง token ไว้ในโปรแกรม
- owner/repo ตั้งไว้ที่ `build.publish` ใน package.json

## หมายเหตุสำหรับนักพัฒนา

- Shell ของ Claude ตั้งค่า `ELECTRON_RUN_AS_NODE=1` ไว้ ทำให้คำสั่ง Electron ทำงานผิดพลาด ให้นำหน้าด้วย `env -u ELECTRON_RUN_AS_NODE`
- ปิดโปรแกรม "PDF Edit" ที่กำลังทำงานอยู่ก่อนรัน `npm run dist` มิฉะนั้นจะเกิด EPERM ที่ `release/win-unpacked`
- dependencies ที่ใช้เฉพาะฝั่ง renderer (เช่น react, pdfjs-dist) ให้อยู่ใน `devDependencies` เพราะ Vite bundle ให้แล้ว ส่วนที่ `electron/` ใช้ `require` ต้องอยู่ใน `dependencies`
- ทีมแบ่งงานเป็น sr / jr: งานยากหรืองานที่เกี่ยวกับ Electron main/IPC, การเซ็น, การอัปเดต, ความปลอดภัย ให้ใช้ `sr` ส่วนงานง่ายที่ระบุชัดเจนให้ใช้ `jr` รายละเอียดดูที่ CLAUDE.md
