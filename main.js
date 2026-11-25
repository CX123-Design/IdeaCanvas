'use strict'
/**
 * IdeaCanvas 主进程
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard, screen, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const { execFile, spawn } = require('child_process')

const store = require('./app/store')
const filesvc = require('./app/files')

let win = null
let pendingPath = null
let dirty = false
let forceClose = false

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1'

/* ---------------- 纯 D 盘工作流：程序和所有运行数据都在程序目录旁 ---------------- */
function ensureDir (dir) {
  try { fs.mkdirSync(dir, { recursive: true }); return true } catch (_) { return false }
}

const APP_ROOT = app.isPackaged ? path.dirname(process.execPath) : __dirname
const APP_DATA_ROOT = path.join(APP_ROOT, 'data')
const APP_USER_DATA = path.join(APP_DATA_ROOT, 'app')

ensureDir(APP_DATA_ROOT)
ensureDir(APP_USER_DATA)
app.setPath('userData', APP_USER_DATA)
const APP_SESSION_DATA = path.join(APP_USER_DATA, 'session')
ensureDir(APP_SESSION_DATA)
try { app.setPath('sessionData', APP_SESSION_DATA) } catch (_) {}
const APP_LOG_DIR = path.join(APP_DATA_ROOT, 'logs')
ensureDir(APP_LOG_DIR)
try { app.setPath('logs', APP_LOG_DIR) } catch (_) {}
const APP_CRASH_DIR = path.join(APP_DATA_ROOT, 'crashDumps')
ensureDir(APP_CRASH_DIR)
try { app.setPath('crashDumps', APP_CRASH_DIR) } catch (_) {}

function copyFileIfMissing (src, dst) {
  try {
    if (!fs.existsSync(src) || fs.existsSync(dst)) return true
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
    return true
  } catch (_) { return false }
}

/* 首次切到 D 盘时，把旧版 C 盘里的设置、恢复文件、剪贴板数据搬过来；
   缩略图缓存不搬，旧文档在渲染时自动回到原始文件路径。 */
function migrateLegacyData () {
  const legacy = path.join(app.getPath('appData'), 'IdeaCanvas')
  // 旧版拖出替身放在系统 TEMP，一并清掉
  try { fs.rmSync(path.join(app.getPath('temp'), 'IdeaCanvas-drag'), { recursive: true, force: true }) } catch (_) {}
  if (legacy === APP_USER_DATA || !fs.existsSync(legacy)) return
  let ok = true

  ok = copyFileIfMissing(path.join(legacy, 'settings.json'), path.join(APP_USER_DATA, 'settings.json')) && ok
  ok = copyFileIfMissing(path.join(legacy, 'recovery.cvproj'), path.join(APP_USER_DATA, 'recovery.cvproj')) && ok

  try {
    const clipSrc = path.join(legacy, 'clip')
    const clipDst = path.join(APP_USER_DATA, 'clip')
    if (fs.existsSync(clipSrc) && !fs.existsSync(clipDst)) fs.cpSync(clipSrc, clipDst, { recursive: true })
  } catch (_) { ok = false }

  try {
    const oldNotes = path.join(legacy, 'data', '便签')
    const newNotes = path.join(APP_DATA_ROOT, '便签')
    if (fs.existsSync(oldNotes) && !fs.existsSync(newNotes)) fs.cpSync(oldNotes, newNotes, { recursive: true })
  } catch (_) { ok = false }

  // 全部搬完后再删旧目录，避免 C 盘继续留一份运行数据
  if (ok) {
    try { fs.rmSync(legacy, { recursive: true, force: true }) } catch (_) {}
  }
}

// 这是个 2D 卡片工具，不需要独立 GPU 合成进程；牺牲一点动画流畅度换内存
app.disableHardwareAcceleration()
// GPU 进程并入主进程，空载再少一个约 90MB 的进程（软件合成足够这个小画布）
app.commandLine.appendSwitch('in-process-gpu')

// 控制 V8 堆和瞬时内存；这个工具只需要处理卡片与短文本
app.commandLine.appendSwitch('js-flags', '--optimize-for-size --max-semi-space-size=2')
app.commandLine.appendSwitch('disk-cache-size', String(20 * 1024 * 1024))

function findProjectArg (argv) {
  for (const a of argv.slice(1)) {
    if (typeof a !== 'string') continue
    if (/\.cvproj$/i.test(a) && fs.existsSync(a)) return a
  }
  return null
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  migrateLegacyData()

  app.on('second-instance', (_e, argv) => {
    const p = findProjectArg(argv)
    if (p && win) {
      pendingPath = p
      win.webContents.send('project:open-path', p)
    }
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })

  app.on('open-file', (e, p) => {
    e.preventDefault()
    if (win) { pendingPath = p; win.webContents.send('project:open-path', p) } else pendingPath = p
  })

  app.whenReady().then(boot)
}

function boot () {
  Menu.setApplicationMenu(null)
  if (process.env.CC_SMOKE) console.log('[argv]', JSON.stringify(process.argv))
  const argPath = findProjectArg(process.argv)
  if (argPath) pendingPath = argPath
  store.load()
  cleanDragTemp()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
}

function createWindow () {
  const area = screen.getPrimaryDisplay().workArea
  const w = Math.max(900, Math.round(area.width * 0.75))
  const h = Math.max(620, Math.round(area.height * 0.75))
  win = new BrowserWindow({
    width: w,
    height: h,
    x: area.x + Math.round((area.width - w) / 2),
    y: area.y + Math.round((area.height - h) / 2),
    minWidth: 640,
    minHeight: 400,
    frame: false,
    fullscreen: false,
    backgroundColor: '#000000',
    title: 'IdeaCanvas · 文件思路工作台',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      webviewTag: false,
      backgroundThrottling: true,
      enableWebSQL: false
    }
  })
  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.webContents.on('console-message', (...a) => {
    if (app.isPackaged) return
    let msg = ''
    if (a[1] && typeof a[1] === 'object') msg = a[1].message
    else msg = a[2]
    console.log('[renderer]', msg)
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => { if (!app.isPackaged) console.log('[load-fail]', code, desc) })
  win.webContents.on('preload-error', (_e, p, err) => console.log('[preload-error]', p, err && err.message))
  win.once('ready-to-show', () => {
    win.show()
    if (pendingPath) win.webContents.send('project:open-path', pendingPath)
  })

  win.on('close', e => {
    if (forceClose || !dirty) return
    e.preventDefault()
    const r = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['保存并退出', '直接退出', '取消'],
      defaultId: 0,
      cancelId: 2,
      title: 'IdeaCanvas',
      message: '当前画布有未保存的修改',
      detail: '是否保存后再退出？'
    })
    if (r === 0) win.webContents.send('app:save-then-close')
    else if (r === 1) { forceClose = true; win.close() }
  })

  win.on('closed', () => { win = null })
  win.on('enter-full-screen', sendWinState)
  win.on('leave-full-screen', sendWinState)
  win.on('maximize', sendWinState)
  win.on('unmaximize', sendWinState)

  if (process.env.CC_SMOKE) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const out = { ok: true }
        try {
          const js = fs.readFileSync(process.env.CC_SMOKE, 'utf8')
          out.result = await win.webContents.executeJavaScript(js, true)
        } catch (err) { out.ok = false; out.error = String((err && err.message) || err) }
        try {
          await new Promise(r => setTimeout(r, 350))
          const img = await win.webContents.capturePage()
          const shotPath = app.isPackaged ? path.join(app.getPath('temp'), 'cc_smoke.png') : path.join(__dirname, '_smoke.png')
          await fsp.writeFile(shotPath, img.toPNG())
          out.shot = shotPath
        } catch (err) { out.shotError = String((err && err.message) || err) }
        console.log('SMOKE_RESULT ' + JSON.stringify(out))
        if (process.env.CC_SMOKE_OUT) {
          try { fs.writeFileSync(process.env.CC_SMOKE_OUT, JSON.stringify(out, null, 2), 'utf8') } catch (_) {}
        }
        app.exit(0)
      }, 2400)
    })
  }
}

/* ---------------- IPC ---------------- */

ipcMain.handle('app:init', () => {
  const p = pendingPath
  pendingPath = null
  return {
    version: app.getVersion(),
    packaged: app.isPackaged,
    exePath: process.execPath,
    settings: store.publicView(),
    pendingPath: p,
    platform: process.platform
  }
})

ipcMain.on('window:title', (_e, t) => { if (win) win.setTitle(t || 'IdeaCanvas · 文件思路工作台') })
ipcMain.on('window:dirty', (_e, v) => { dirty = !!v })
ipcMain.on('app:destroy', () => { forceClose = true; if (win) win.close() })

function threeQuarterBounds () {
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const w = Math.max(900, Math.round(area.width * 0.75))
  const h = Math.max(620, Math.round(area.height * 0.75))
  return {
    x: area.x + Math.round((area.width - w) / 2),
    y: area.y + Math.round((area.height - h) / 2),
    width: w,
    height: h
  }
}

function windowThreeQuarterSize () {
  if (!win) return
  win.unmaximize()
  win.setBounds(threeQuarterBounds(), false)
}

// 退出全屏时等系统先把窗口还原，再一次定位到 3/4 尺寸：
// 不走 setBounds 的补间动画，避免“全屏 → 最大化 → 慢慢缩回”的双重过渡。
function exitFullscreenToThreeQuarter () {
  if (!win) return
  const target = threeQuarterBounds()
  let applied = false
  const apply = () => {
    if (applied || !win || win.isDestroyed()) return
    applied = true
    win.setBounds(target, false)
    sendWinState()
  }
  win.once('leave-full-screen', apply)
  win.setFullScreen(false)
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isFullScreen()) apply()
  }, 700)
}

ipcMain.on('win:minimize', () => { if (win) win.minimize() })
ipcMain.on('win:maximize-toggle', () => {
  if (!win) return
  if (win.isFullScreen()) {
    exitFullscreenToThreeQuarter()
  } else {
    win.setFullScreen(true)
  }
  setTimeout(sendWinState, 400)
})
ipcMain.on('win:fullscreen-toggle', () => {
  if (!win) return
  if (win.isFullScreen()) {
    exitFullscreenToThreeQuarter()
    setTimeout(sendWinState, 400)
  } else {
    win.setFullScreen(true)
    setTimeout(sendWinState, 200)
  }
})
ipcMain.on('win:close', () => { if (win) win.close() })
ipcMain.handle('win:state', () => winState())

function winState () {
  if (!win) return { fullscreen: false, maximized: false }
  return { fullscreen: win.isFullScreen(), maximized: win.isMaximized(), bounds: win.getBounds() }
}
function sendWinState () {
  if (win && !win.isDestroyed()) win.webContents.send('win:state', winState())
}

ipcMain.handle('dialog:pick-exe', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择要启动的程序（.exe）',
    properties: ['openFile'],
    filters: [{ name: '可执行程序', extensions: ['exe', 'bat', 'cmd', 'lnk'] }, { name: '所有文件', extensions: ['*'] }]
  })
  return r.canceled ? '' : (r.filePaths[0] || '')
})

ipcMain.handle('dialog:pick-files', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择要加入画布的文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '全部支持的工程文件', extensions: ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'pdf', 'dwg', 'dxf', 'png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff', 'webp', 'txt', 'md', 'csv', 'inp', 'dat', 'rst', 'cdb', 'mac', 'out', 'step', 'stp', 'iges', 'igs', 'sat', 'skp', 'obj', 'ifc'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  return r.canceled ? [] : r.filePaths
})

ipcMain.handle('dialog:pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择文件夹（自动扫描其中的工程文件）',
    properties: ['openDirectory']
  })
  if (r.canceled || !r.filePaths[0]) return { dir: '', files: [] }
  const dir = r.filePaths[0]
  const files = await filesvc.scanFolder(dir)
  return { dir, files }
})

ipcMain.handle('file:scan', async (_e, dir) => {
  if (!dir) return { dir: '', files: [] }
  return { dir, files: await filesvc.scanFolder(dir) }
})

ipcMain.handle('file:describe', async (_e, paths) => {
  if (!Array.isArray(paths) || !paths.length) return []
  return filesvc.describeMany(paths)
})

ipcMain.handle('file:extract', async (_e, { path: p, limit }) => {
  try { return { ok: true, text: await filesvc.extractText(p, limit || 20000) } } catch (err) { return { ok: false, text: '', error: String(err.message || err) } }
})

ipcMain.handle('file:open', async (_e, p) => {
  try {
    const st = await fsp.stat(p)
    if (!st.isFile()) return { ok: false, error: '不是文件' }
  } catch (_) { return { ok: false, error: '文件不存在或已被移动' } }
  try {
    // explorer 转发给系统默认程序后立即返回，不等大文件加载完成
    const child = spawn('explorer.exe', [p], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) }
  }
})

ipcMain.handle('folder:open', async (_e, p) => {
  try {
    const st = await fsp.stat(p)
    if (!st.isDirectory()) return { ok: false, error: '不是文件夹' }
  } catch (_) { return { ok: false, error: '文件夹不存在' } }
  const r = await shell.openPath(p)
  return r ? { ok: false, error: r } : { ok: true }
})

ipcMain.handle('file:reveal', (_e, p) => { shell.showItemInFolder(p); return true })

ipcMain.handle('file:isdir', async (_e, p) => {
  try { return (await fsp.stat(p)).isDirectory() } catch (_) { return false }
})

ipcMain.handle('file:exists', async (_e, paths) => {
  const out = {}
  for (const p of paths) { try { const s = await fsp.stat(p); out[p] = s.isFile() } catch (_) { out[p] = false } }
  return out
})

ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text || '')); return true })
ipcMain.handle('clipboard:read', () => clipboard.readText())

/* 卡片剪贴板：不把 JSON 明文塞进剪贴板，只用一行提示 + 令牌，数据落在 userData/clip */
function clipDir () {
  const d = path.join(app.getPath('userData'), 'clip')
  try { fs.mkdirSync(d, { recursive: true }) } catch (_) {}
  return d
}
ipcMain.handle('clipboard:copy-cards', async (_e, payload) => {
  try {
    const dir = clipDir()
    const token = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
    const file = path.join(dir, 'cards-' + token + '.json')
    await fsp.writeFile(file, JSON.stringify(payload || {}), 'utf8')
    clipboard.writeText('IdeaCanvas 卡片剪贴板 · 回到画布按 Ctrl+V 粘贴（请勿修改此行）\nCC-CARDS:' + token)
    const files = (await fsp.readdir(dir)).filter(f => f.endsWith('.json')).sort()
    while (files.length > 20) { try { await fsp.unlink(path.join(dir, files.shift())) } catch (_) {} }
    return { ok: true, token, count: (payload && payload.nodes ? payload.nodes.length : 0) }
  } catch (err) { return { ok: false, error: String(err.message || err) } }
})
ipcMain.handle('clipboard:read-cards', async () => {
  const txt = clipboard.readText() || ''
  const m = /CC-CARDS:([a-z0-9-]+)/i.exec(txt)
  if (m) {
    try {
      const raw = await fsp.readFile(path.join(clipDir(), 'cards-' + m[1] + '.json'), 'utf8')
      const data = JSON.parse(raw)
      if (data && Array.isArray(data.nodes)) return { ok: true, data }
    } catch (_) {}
  }
  // 兼容旧格式
  const legacy = 'IDEACANVAS-CARDS-1\n'
  if (txt.startsWith(legacy)) {
    try {
      const data = JSON.parse(txt.slice(legacy.length))
      if (data && Array.isArray(data.nodes)) return { ok: true, data }
    } catch (_) {}
  }
  return { ok: false }
})

/* ---------------- 便签落盘 ---------------- */
function dataRoot () {
  try { fs.mkdirSync(APP_DATA_ROOT, { recursive: true }) } catch (_) {}
  return APP_DATA_ROOT
}

function noteRoot () {
  const s = store.load()
  const custom = s.general && s.general.noteDir ? String(s.general.noteDir).trim() : ''
  if (custom && path.isAbsolute(custom)) {
    try { fs.mkdirSync(custom, { recursive: true }); return custom } catch (_) {}
  }
  const dir = path.join(dataRoot(), '便签')
  try { fs.mkdirSync(dir, { recursive: true }) } catch (_) {}
  return dir
}

function safeName (name) {
  return String(name || '便签')
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().slice(0, 40) || '便签'
}

function uniqueFile (dir, base) {
  let file = path.join(dir, base + '.txt')
  let i = 2
  while (fs.existsSync(file)) { file = path.join(dir, base + '-' + i + '.txt'); i++ }
  return file
}

function uniquePath (dir, fileName) {
  const ext = path.extname(fileName)
  const base = path.basename(fileName, ext)
  let file = path.join(dir, base + ext)
  let i = 2
  while (fs.existsSync(file)) { file = path.join(dir, base + '-' + i + ext); i++ }
  return file
}

ipcMain.handle('note:write', async (_e, { path: oldPath, name, content }) => {
  try {
    let target = oldPath && path.isAbsolute(oldPath) && fs.existsSync(path.dirname(oldPath)) ? oldPath : ''
    if (target && !/\.txt$/i.test(target)) target = ''
    if (!target) {
      const dir = noteRoot()
      const base = safeName(name) + '-' + new Date().toISOString().slice(0, 10).replace(/-/g, '')
      target = uniqueFile(dir, base)
    }
    await fsp.writeFile(target, content == null ? '' : String(content), 'utf8')
    return { ok: true, path: target, name: path.basename(target) }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
})

ipcMain.handle('note:pick-dir', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择便签保存目录',
    properties: ['openDirectory', 'createDirectory']
  })
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
  return { ok: true, dir: r.filePaths[0] }
})

ipcMain.handle('note:default-dir', () => ({ dir: noteRoot() }))

/* ---------------- 工作模式：把卡片作为文件拖到其他软件 ---------------- */
function dragTempRoot () {
  const dir = path.join(APP_DATA_ROOT, 'temp', 'drag')
  try { fs.mkdirSync(dir, { recursive: true }) } catch (_) {}
  return dir
}

function cleanDragTemp () {
  const dir = dragTempRoot()
  try {
    const now = Date.now()
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      try { if (now - fs.statSync(p).mtimeMs > 86400000) fs.unlinkSync(p) } catch (_) {}
    }
  } catch (_) {}
}

ipcMain.handle('drag:prepare', async (_e, { path: oldPath, name, text }) => {
  try {
    const dir = dragTempRoot()
    let target = ''
    const src = oldPath && path.isAbsolute(oldPath) && fs.existsSync(oldPath) ? oldPath : ''
    if (src) {
      // 永远不把原文件直接交给 OLE：拖到资源管理器时系统可能执行“移动”，
      // 会把卡片指向的原文件搬走。这里在临时目录建硬链接（跨卷时退回复制），
      // 拖出去的是替身，原文件留在原位。
      const ext = path.extname(src)
      const base = safeName(path.basename(src, ext)) + (ext || '')
      target = uniquePath(dir, base)
      try {
        await fsp.link(src, target)
      } catch (_) {
        await fsp.copyFile(src, target)
      }
    } else {
      const base = safeName(name) + '-' + Date.now().toString(36)
      target = uniquePath(dir, base + '.txt')
      await fsp.writeFile(target, text == null ? '' : String(text), 'utf8')
    }
    return { ok: true, path: target, name: path.basename(target) }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
})

ipcMain.on('drag:start', (event, payload) => {
  try {
    const file = payload && payload.file
    if (!file || !fs.existsSync(file)) return
    let icon = null
    if (payload && typeof payload.icon === 'string' && /^data:image\//.test(payload.icon)) {
      try { icon = nativeImage.createFromDataURL(payload.icon) } catch (_) {}
    }
    if (!icon || icon.isEmpty()) {
      try { icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')) } catch (_) {}
    }
    event.sender.startDrag({ file, icon: icon || undefined })
  } catch (err) {
    console.error('[drag]', err && err.message)
  }
})

/* 画布工程 */
ipcMain.handle('project:save', async (_e, { data, path: p, saveAs }) => {
  let target = p
  if (!target || saveAs) {
    const r = await dialog.showSaveDialog(win, {
      title: '保存画布',
      defaultPath: p || path.join(app.getPath('documents'), (data.name || '未命名画布') + '.cvproj'),
      filters: [{ name: 'IdeaCanvas 画布', extensions: ['cvproj'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false, canceled: true }
    target = r.filePath
  }
  data.updatedAt = Date.now()
  data.app = 'IdeaCanvas'
  data.version = 1
  await fsp.writeFile(target, JSON.stringify(data, null, 2), 'utf8')
  const recent = store.addRecent(target)
  return { ok: true, path: target, recent }
})

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '打开画布',
    properties: ['openFile'],
    filters: [{ name: 'IdeaCanvas 画布', extensions: ['cvproj'] }]
  })
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
  return readProject(r.filePaths[0])
})

ipcMain.handle('project:read', async (_e, p) => readProject(p))

async function readProject (p) {
  try {
    const raw = await fsp.readFile(p, 'utf8')
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.nodes)) return { ok: false, error: '不是有效的 IdeaCanvas 画布文件' }
    store.addRecent(p)
    return { ok: true, path: p, data, recent: store.load().recent }
  } catch (err) {
    return { ok: false, error: '打开失败：' + (err.message || err) }
  }
}

ipcMain.handle('project:autosave', async (_e, { data, path: p }) => {
  const target = p || path.join(app.getPath('userData'), 'recovery.cvproj')
  const payload = Object.assign({}, data, { app: 'IdeaCanvas', version: 1, autosaved: true })
  try { await fsp.writeFile(target, JSON.stringify(payload, null, 2), 'utf8'); return { ok: true, path: target } } catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('recovery:take', async () => {
  const p = path.join(app.getPath('userData'), 'recovery.cvproj')
  try {
    const raw = await fsp.readFile(p, 'utf8')
    const data = JSON.parse(raw)
    return { ok: true, data, path: p }
  } catch (_) { return { ok: false } }
})

ipcMain.handle('recovery:clear', async () => {
  try { await fsp.unlink(path.join(app.getPath('userData'), 'recovery.cvproj')) } catch (_) {}
  return true
})

/* 导出 */
ipcMain.handle('export:png', async (_e, { dataUrl, defaultName }) => {
  const r = await dialog.showSaveDialog(win, {
    title: '导出画布图片',
    defaultPath: path.join(app.getPath('pictures'), (defaultName || 'canvas') + '.png'),
    filters: [{ name: 'PNG 图片', extensions: ['png'] }]
  })
  if (r.canceled || !r.filePath) return { ok: false, canceled: true }
  const b64 = String(dataUrl || '').replace(/^data:image\/png;base64,/, '')
  await fsp.writeFile(r.filePath, Buffer.from(b64, 'base64'))
  return { ok: true, path: r.filePath }
})

ipcMain.handle('export:capture', async (_e, { rect, defaultName }) => {
  if (!win) return { ok: false, error: '窗口不可用' }
  const r = {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  }
  const image = await win.webContents.capturePage(r)
  const save = await dialog.showSaveDialog(win, {
    title: '导出画布图片',
    defaultPath: path.join(app.getPath('pictures'), (defaultName || 'canvas') + '.png'),
    filters: [{ name: 'PNG 图片', extensions: ['png'] }]
  })
  if (save.canceled || !save.filePath) return { ok: false, canceled: true }
  await fsp.writeFile(save.filePath, image.toPNG())
  return { ok: true, path: save.filePath }
})

ipcMain.handle('dialog:save-text', async (_e, { defaultName, content, filters }) => {
  const r = await dialog.showSaveDialog(win, {
    title: '保存为文件',
    defaultPath: defaultName,
    filters: filters || [{ name: 'Markdown', extensions: ['md'] }, { name: '纯文本', extensions: ['txt'] }]
  })
  if (r.canceled || !r.filePath) return { ok: false, canceled: true }
  await fsp.writeFile(r.filePath, content, 'utf8')
  return { ok: true, path: r.filePath }
})

/* 设置 */
ipcMain.handle('settings:get', () => store.publicView())
ipcMain.handle('settings:set', (_e, patch) => store.setPatch(patch))

/* 文件关联 */
ipcMain.handle('assoc:register', async () => {
  if (!app.isPackaged) return { ok: false, error: '开发模式下请先用打包版注册文件关联' }
  const exe = process.execPath
  const ico = app.isPackaged
    ? path.join(path.dirname(exe), 'assets', 'cvproj.ico')
    : path.join(__dirname, 'assets', 'cvproj.ico')
  const iconSpec = fs.existsSync(ico) ? ico + ',0' : exe + ',0'
  const sysRoot = process.env.SystemRoot || 'C:\\Windows'
  const regExe = path.join(sysRoot, 'System32', 'reg.exe')
  const ieExe = path.join(sysRoot, 'System32', 'ie4uinit.exe')
  if (!fs.existsSync(regExe)) return { ok: false, error: '找不到系统 reg.exe' }
  const cmds = [
    ['add', 'HKCU\\Software\\Classes\\IdeaCanvas.Project', '/ve', '/d', 'IdeaCanvas 画布工程', '/f'],
    ['add', 'HKCU\\Software\\Classes\\IdeaCanvas.Project\\shell\\open\\command', '/ve', '/d', '"' + exe + '" "%1"', '/f'],
    ['add', 'HKCU\\Software\\Classes\\IdeaCanvas.Project\\DefaultIcon', '/ve', '/d', iconSpec, '/f'],
    ['add', 'HKCU\\Software\\Classes\\.cvproj', '/ve', '/d', 'IdeaCanvas.Project', '/f']
  ]
  return new Promise(resolve => {
    let i = 0
    const next = () => {
      if (i >= cmds.length) {
        try { execFile(ieExe, ['-show'], { windowsHide: true }, () => {}) } catch (_) {}
        return resolve({ ok: true })
      }
      execFile(regExe, cmds[i++], err => { if (err) resolve({ ok: false, error: err.message }); else next() })
    }
    next()
  })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

