const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('semanticBrowser', {
  runtime: () => ipcRenderer.invoke('app:runtime'),
  onInitialUrl: (callback) => ipcRenderer.on('open-initial-url', (_event, url) => callback(url)),
  newWindow: (url) => ipcRenderer.invoke('app:new-window', url),
  nexAccount: {
    register: (payload) => ipcRenderer.invoke('nexaccount:register', payload),
    login: (payload) => ipcRenderer.invoke('nexaccount:login', payload),
    logout: () => ipcRenderer.invoke('nexaccount:logout'),
    profile: () => ipcRenderer.invoke('nexaccount:profile'),
    updateSettings: (payload) => ipcRenderer.invoke('nexaccount:update-settings', payload),
    conversations: () => ipcRenderer.invoke('nexaccount:conversations'),
    createConversation: (payload) => ipcRenderer.invoke('nexaccount:create-conversation', payload),
    messages: (id) => ipcRenderer.invoke('nexaccount:messages', id),
    deleteConversation: (id) => ipcRenderer.invoke('nexaccount:delete-conversation', id),
    sendMessage: (payload) => ipcRenderer.invoke('nexaccount:send-message', payload)
  },
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
