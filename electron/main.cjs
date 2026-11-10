const { app, BrowserWindow } = require('electron')
const path = require('path')

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1200, height: 900, autoHideMenuBar: true })
  win.loadFile(path.join(__dirname, '../dist/index.html'))
})
app.on('window-all-closed', () => app.quit())
