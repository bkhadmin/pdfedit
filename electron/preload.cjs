const { contextBridge, ipcRenderer } = require('electron')

// Only exists in the desktop app; the web build checks for window.pdfedit and hides certificate signing.
contextBridge.exposeInMainWorld('pdfedit', {
  signPdf: (args) => ipcRenderer.invoke('sign-pdf', args),
  // Auto-update: cb gets { type: 'available'|'progress'|'downloaded'|'error', version?, percent?, message? }
  onUpdate: (cb) => {
    const f = (_e, u) => cb(u)
    ipcRenderer.on('update', f)
    return () => ipcRenderer.removeListener('update', f) // unsubscribe
  },
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
})
