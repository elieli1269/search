const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('semanticBrowser', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setModel: (model) => ipcRenderer.invoke('settings:set-model', model)
  },
  keys: {
    add: (payload) => ipcRenderer.invoke('keys:add', payload),
    activate: (id) => ipcRenderer.invoke('keys:activate', id),
    remove: (id) => ipcRenderer.invoke('keys:remove', id)
  },
  pages: {
    list: () => ipcRenderer.invoke('pages:list'),
    save: (page) => ipcRenderer.invoke('pages:save', page)
  },
  ai: {
    chat: (messages) => ipcRenderer.invoke('ai:chat', messages)
  },
  external: {
    open: (url) => ipcRenderer.invoke('external:open', url)
  }
});
