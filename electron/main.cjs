const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
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
