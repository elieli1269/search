const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('semanticBrowser', {
  runtime: () => ipcRenderer.invoke('app:runtime'),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setModels: (payload) => ipcRenderer.invoke('settings:set-models', payload)
  },
  keys: {
    add: (payload) => ipcRenderer.invoke('keys:add', payload),
    activate: (id) => ipcRenderer.invoke('keys:activate', id),
    remove: (id) => ipcRenderer.invoke('keys:remove', id)
  },
  pages: {
    list: () => ipcRenderer.invoke('pages:list')
  },
  vault: {
    list: () => ipcRenderer.invoke('vault:list'),
    add: (payload) => ipcRenderer.invoke('vault:add', payload),
    remove: (id) => ipcRenderer.invoke('vault:remove', id)
  },
  quiz: {
    generate: (payload) => ipcRenderer.invoke('quiz:generate', payload),
    flash: (payload) => ipcRenderer.invoke('quiz:flash', payload)
  },
  context: {
    update: (payload) => ipcRenderer.invoke('context:update', payload),
    ghostSuggestion: (payload) => ipcRenderer.invoke('ai:ghost-suggestion', payload),
    capture: () => ipcRenderer.invoke('page:capture')
  },
  ai: {
    chat: (messages, options) => ipcRenderer.invoke('ai:chat', { messages, options })
  },
  voice: {
    transcribe: (payload) => ipcRenderer.invoke('voice:transcribe', payload)
  },
  external: {
    open: (url) => ipcRenderer.invoke('external:open', url)
  }
});
