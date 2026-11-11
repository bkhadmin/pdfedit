const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { signPdf } = require('./sign.cjs')

ipcMain.handle('sign-pdf', async (_e, args) => {
  try {
    return await signPdf(args)
  } catch (err) {
    if (/password|MAC/i.test(err.message)) throw new Error('รหัสผ่านใบรับรองไม่ถูกต้อง')
    if (/ASN\.1|PKCS#12|der/i.test(err.message)) throw new Error('ไฟล์ใบรับรองไม่ถูกต้อง (ต้องเป็น .p12 หรือ .pfx)')
    throw err
  }
})

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../dist/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  })
  win.loadFile(path.join(__dirname, '../dist/index.html'))
})
app.on('window-all-closed', () => app.quit())
