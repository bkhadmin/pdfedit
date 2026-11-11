const { contextBridge, ipcRenderer } = require('electron')

// Only exists in the desktop app; the web build checks for window.pdfedit and hides certificate signing.
contextBridge.exposeInMainWorld('pdfedit', {
  signPdf: (args) => ipcRenderer.invoke('sign-pdf', args),
})
