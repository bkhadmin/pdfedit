const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFile } = require('child_process')
const { autoUpdater } = require('electron-updater')

autoUpdater.autoDownload = false // nothing downloads until the user clicks the update button
ipcMain.handle('download-update', () => autoUpdater.downloadUpdate())
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall())

ipcMain.handle('sign-pdf', async (_e, args) => {
  try {
    // loaded on use: a broken signing dependency must not stop the app (or its updater) from starting
    return await require('./sign.cjs').signPdf(args)
  } catch (err) {
    if (/password|MAC/i.test(err.message)) throw new Error('รหัสผ่านใบรับรองไม่ถูกต้อง')
    if (/ASN\.1|PKCS#12|der/i.test(err.message)) throw new Error('ไฟล์ใบรับรองไม่ถูกต้อง (ต้องเป็น .p12 หรือ .pfx)')
    throw err
  }
})

const SCAN_ERRORS = {
  '80210015': 'ไม่พบเครื่องสแกน กรุณาเชื่อมต่อและเปิดเครื่องสแกนก่อน',
  '80040154': 'ไม่พบเครื่องสแกน (บริการสแกนของ Windows ไม่พร้อมใช้งาน)',
  '80210005': 'เครื่องสแกนไม่ได้เชื่อมต่อหรือปิดอยู่',
  '8021000A': 'ติดต่อเครื่องสแกนไม่ได้ กรุณาตรวจสอบสายหรือเครือข่าย',
  '80210006': 'เครื่องสแกนกำลังใช้งานอยู่ กรุณาลองใหม่',
  '80210002': 'กระดาษติดในเครื่องสแกน',
  '80210003': 'ไม่มีกระดาษในถาดป้อนกระดาษ',
  '80210064': 'ฝาเครื่องสแกนเปิดอยู่',
}

// Windows WIA scan via scan.ps1 (no extra deps). Returns [{ bytes, dpi }], empty = cancelled; temp images are deleted.
ipcMain.handle('scan', async (e) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfedit-scan-'))
  const win = BrowserWindow.fromWebContents(e.sender)
  try {
    const out = await new Promise((resolve) => {
      const kill = () => ps.kill() // don't leave a scanner dialog behind when the app closes
      const ps = execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-STA', '-Command', '-'],
        { env: { ...process.env, PDFEDIT_SCAN_DIR: dir }, windowsHide: true },
        (err, stdout, stderr) => {
          win.off('closed', kill)
          resolve(err && !stdout ? 'ERR\t-\t' + (stderr || err.message) : stdout)
        },
      )
      win.once('closed', kill)
      // script on stdin (read via fs so it also works from app.asar); -Command - runs a block only after a blank line
      ps.stdin.end(fs.readFileSync(path.join(__dirname, 'scan.ps1'), 'utf8') + '\n\n')
    })
    const lines = out.split(/\r?\n/).map((l) => l.split('\t'))
    const err = lines.find((l) => l[0] === 'ERR')
    if (err) {
      console.log('scan error:', err.join(' '))
      throw new Error(SCAN_ERRORS[err[1]] || `สแกนไม่สำเร็จ (รหัส ${err[1]})`)
    }
    return lines.filter((l) => l[0] === 'PAGE').map(([, f, dpi]) => ({ bytes: fs.readFileSync(f), dpi: +dpi || 0 }))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
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

  const send = (type, data) => !win.isDestroyed() && win.webContents.send('update', { type, ...data })
  autoUpdater.on('update-available', (i) => send('available', { version: i.version }))
  autoUpdater.on('download-progress', (p) => send('progress', { percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', () => send('downloaded'))
  autoUpdater.on('error', (err) => send('error', { message: err.message }))
  // No network / no releases yet / rate limit are normal: log only; the renderer ignores errors until a download starts.
  if (app.isPackaged) win.webContents.once('did-finish-load', () => autoUpdater.checkForUpdates().catch((e) => console.log('update check:', e.message)))
})
app.on('window-all-closed', () => app.quit())
