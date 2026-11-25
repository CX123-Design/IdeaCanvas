'use strict'
const { contextBridge, ipcRenderer, webUtils } = require('electron')

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload)

contextBridge.exposeInMainWorld('cc', {
  getFilePath: file => { try { return webUtils.getPathForFile(file) || '' } catch (_) { return '' } },
  init: () => invoke('app:init'),
  setTitle: t => ipcRenderer.send('window:title', t),
  setDirty: v => ipcRenderer.send('window:dirty', v),
  destroyWindow: () => ipcRenderer.send('app:destroy'),
  onSaveThenClose: cb => ipcRenderer.on('app:save-then-close', () => cb()),
  onOpenPath: cb => ipcRenderer.on('project:open-path', (_e, p) => cb(p)),
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaxToggle: () => ipcRenderer.send('win:maximize-toggle'),
  winFullToggle: () => ipcRenderer.send('win:fullscreen-toggle'),
  winClose: () => ipcRenderer.send('win:close'),
  winState: () => invoke('win:state'),
  onWinState: cb => ipcRenderer.on('win:state', (_e, s) => cb(s)),

  pickFiles: () => invoke('dialog:pick-files'),
  pickExe: () => invoke('dialog:pick-exe'),
  pickFolder: () => invoke('dialog:pick-folder'),
  scanFolder: p => invoke('file:scan', p),
  describe: paths => invoke('file:describe', paths),
  extract: (p, limit) => invoke('file:extract', { path: p, limit }),
  openFile: p => invoke('file:open', p),
  openFolder: p => invoke('folder:open', p),
  reveal: p => invoke('file:reveal', p),
  exists: paths => invoke('file:exists', paths),
  isDir: p => invoke('file:isdir', p),
  copyText: t => invoke('clipboard:write', t),
  readText: () => invoke('clipboard:read'),
  copyCards: p => invoke('clipboard:copy-cards', p),
  readCards: () => invoke('clipboard:read-cards'),

  saveProject: (data, path, saveAs) => invoke('project:save', { data, path, saveAs }),
  openProject: () => invoke('project:open'),
  readProject: p => invoke('project:read', p),
  autosave: (data, path) => invoke('project:autosave', { data, path }),
  recoveryTake: () => invoke('recovery:take'),
  recoveryClear: () => invoke('recovery:clear'),

  exportPng: (dataUrl, defaultName) => invoke('export:png', { dataUrl, defaultName }),
  capturePng: (rect, defaultName) => invoke('export:capture', { rect, defaultName }),
  saveText: (defaultName, content, filters) => invoke('dialog:save-text', { defaultName, content, filters }),

  settingsGet: () => invoke('settings:get'),
  settingsSet: patch => invoke('settings:set', patch),
  assocRegister: () => invoke('assoc:register'),

  noteWrite: p => invoke('note:write', p),
  notePickDir: () => invoke('note:pick-dir'),
  noteDefaultDir: () => invoke('note:default-dir'),

  prepareDrag: p => invoke('drag:prepare', p),
  startDrag: p => ipcRenderer.send('drag:start', p)
})
