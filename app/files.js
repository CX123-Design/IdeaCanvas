'use strict'
/**
 * 文件元信息、系统图标、缩略图、文本抽取
 */
const { app } = require('electron')
const fs = require('fs')
const fsp = fs.promises
const path = require('path')

const KIND_BY_EXT = {}
const KIND_LIST = {
  doc: ['doc', 'docx', 'wps', 'odt', 'rtf'],
  sheet: ['xls', 'xlsx', 'xlsm', 'et', 'ods', 'csv'],
  slide: ['ppt', 'pptx', 'dps', 'odp'],
  pdf: ['pdf'],
  cad: ['dwg', 'dxf'],
  fem: ['inp', 'rst', 'cdb', 'mac', 'dat', 'out', 'ans', 'db', 'k', 'prt', 'sim'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'svg', 'ico'],
  text: ['txt', 'md', 'json', 'xml', 'log', 'ini', 'yml', 'yaml', 'py', 'js', 'm', 'tex'],
  model: ['step', 'stp', 'iges', 'igs', 'sat', '3dm', 'skp', 'obj', 'stl', 'ifc', 'gltf', 'glb']
}
for (const [kind, exts] of Object.entries(KIND_LIST)) for (const e of exts) KIND_BY_EXT[e] = kind

const TEXT_EXT = new Set(['txt', 'md', 'json', 'xml', 'log', 'ini', 'yml', 'yaml', 'csv', 'inp', 'dat', 'mac', 'out', 'ans', 'py', 'js', 'm', 'tex'])

const iconCache = new Map()
let pdfjs = null

function extOf (p) { return (path.extname(p) || '').replace('.', '').toLowerCase() }
function kindOf (p) { return KIND_BY_EXT[extOf(p)] || 'other' }

async function iconFor (p) {
  const ext = extOf(p) || '_'
  if (iconCache.has(ext)) return iconCache.get(ext)
  let dataUrl = ''
  try {
    const img = await app.getFileIcon(p, { size: 'normal' })
    dataUrl = img.isEmpty() ? '' : img.toDataURL()
  } catch (_) { dataUrl = '' }
  iconCache.set(ext, dataUrl)
  return dataUrl
}

async function readHead (p, maxBytes = 65536) {
  let fh = null
  try {
    fh = await fsp.open(p, 'r')
    const buf = Buffer.alloc(maxBytes)
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    if (fh) { try { await fh.close() } catch (_) {} }
  }
}

async function imageDims (p, ext) {
  try {
    if (ext === 'png') {
      const b = await readHead(p, 32)
      if (b.length >= 24) return b.readUInt32BE(16) + '×' + b.readUInt32BE(20)
    } else if (ext === 'gif') {
      const b = await readHead(p, 16)
      if (b.length >= 10) return b.readUInt16LE(6) + '×' + b.readUInt16LE(8)
    } else if (ext === 'bmp') {
      const b = await readHead(p, 32)
      if (b.length >= 26) return Math.abs(b.readInt32LE(18)) + '×' + Math.abs(b.readInt32LE(22))
    } else if (ext === 'webp') {
      const b = await readHead(p, 40)
      if (b.length >= 30 && b.toString('ascii', 12, 16) === 'VP8X') {
        const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
        const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
        return w + '×' + h
      }
    } else if (ext === 'svg') {
      const text = (await readHead(p, 4096)).toString('utf8')
      const w = /\bwidth=["']?([0-9.]+)/i.exec(text)
      const h = /\bheight=["']?([0-9.]+)/i.exec(text)
      if (w && h) return Math.round(Number(w[1])) + '×' + Math.round(Number(h[1]))
      const vb = /viewBox=["']?[^\d]*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i.exec(text)
      if (vb) return Math.round(Number(vb[3])) + '×' + Math.round(Number(vb[4]))
    } else if (ext === 'jpg' || ext === 'jpeg') {
      let fh = null
      try {
        fh = await fsp.open(p, 'r')
        const b = Buffer.alloc(65536)
        let pos = 2
        for (let guard = 0; guard < 80; guard++) {
          const m = Buffer.alloc(2)
          const r = await fh.read(m, 0, 2, pos)
          if (!r.bytesRead) break
          if (m[0] !== 0xff) { pos++; continue }
          const marker = m[1]
          pos += 2
          if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
          if (marker === 0xda || marker === 0xd9) break
          const lenBuf = Buffer.alloc(2)
          if (!(await fh.read(lenBuf, 0, 2, pos)).bytesRead) break
          const len = lenBuf.readUInt16BE(0)
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            const s = await fh.read(b, 0, 5, pos + 2)
            if (s.bytesRead >= 5) return b.readUInt16BE(3) + '×' + b.readUInt16BE(1)
            break
          }
          pos += len
          if (pos > (await fh.stat()).size) break
        }
      } finally { if (fh) { try { await fh.close() } catch (_) {} } }
    } else if (ext === 'tif' || ext === 'tiff') {
      return ''
    }
  } catch (_) {}
  return ''
}

function stripXml (xml) {
  return xml
    .replace(/<\/w:p>|<\/a:p>/g, '\n')
    .replace(/<w:tab\/>|<a:br\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#10;/g, '\n').replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function officeText (p, ext, limit) {
  try {
    const st = await fsp.stat(p)
    if (st.size > 30 * 1024 * 1024) return ''
  } catch (_) { return '' }
  const AdmZip = require('adm-zip')
  const zip = new AdmZip(p)
  let text = ''
  if (ext === 'docx' || ext === 'doc') {
    const entry = zip.getEntry('word/document.xml')
    if (entry) text = stripXml(entry.getData().toString('utf8'))
  } else if (['xlsx', 'xlsm', 'xls'].includes(ext)) {
    const shared = zip.getEntry('xl/sharedStrings.xml')
    if (shared) {
      text = stripXml(shared.getData().toString('utf8').replace(/<\/si>/g, '\n'))
    }
  } else if (['pptx', 'ppt'].includes(ext)) {
    const parts = []
    for (const e of zip.getEntries()) {
      const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(e.entryName)
      if (m) parts.push({ n: Number(m[1]), xml: e.getData().toString('utf8') })
    }
    parts.sort((a, b) => a.n - b.n)
    text = parts.map((x, i) => '[第' + (i + 1) + '页]\n' + stripXml(x.xml)).join('\n')
  }
  return text.slice(0, limit)
}

function getPdfjs () {
  if (!pdfjs) pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
  return pdfjs
}

let pdfAssets = null
function pdfAssetUrls () {
  if (pdfAssets) return pdfAssets
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
  pdfAssets = {
    cMapUrl: path.join(root, 'cmaps') + path.sep,
    standardFontDataUrl: path.join(root, 'standard_fonts') + path.sep
  }
  return pdfAssets
}

async function pdfText (p, limit) {
  try {
    const st = await fsp.stat(p)
    if (st.size > 80 * 1024 * 1024) return { pages: 0, text: '', error: 'PDF 过大，已跳过文本摘要' }
    const data = new Uint8Array(await fsp.readFile(p))
    const doc = await getPdfjs().getDocument(Object.assign({
      data, isEvalSupported: false, useSystemFonts: true, cMapPacked: true
    }, pdfAssetUrls())).promise
    const pages = Math.min(doc.numPages, 6)
    let text = ''
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      text += '[第' + i + '页] ' + content.items.map(it => it.str).join(' ').replace(/\s+/g, ' ') + '\n'
      page.cleanup && page.cleanup()
      if (text.length >= limit) break
    }
    const total = doc.numPages
    try { doc.destroy() } catch (_) {}
    return { pages: total, text: text.slice(0, limit) }
  } catch (err) {
    return { pages: 0, text: '', error: String(err && err.message ? err.message : err) }
  }
}

async function readTextish (p, limit) {
  const buf = await readHead(p, Math.max(4096, Math.min(limit * 3 + 256, 200000)))
  let text = buf.toString('utf8')
  const bad = (text.match(/\uFFFD/g) || []).length
  if (bad > text.length * 0.05) text = buf.toString('latin1')
  return text.replace(/\r\n/g, '\n').slice(0, limit)
}

/** 完整抽取（用于 AI 输入） */
async function extractText (p, limit = 20000) {
  const ext = extOf(p)
  try {
    if (TEXT_EXT.has(ext)) return await readTextish(p, limit)
    if (['docx', 'xlsx', 'xlsm', 'pptx'].includes(ext)) return await officeText(p, ext, limit)
    if (ext === 'pdf') {
      const r = await pdfText(p, limit)
      return r.text || ''
    }
  } catch (err) {
    return '[读取失败：' + (err.message || err) + ']'
  }
  return ''
}

/** 卡片展示用摘要 */
async function snippetOf (p, limit = 320) {
  const ext = extOf(p)
  try {
    if (TEXT_EXT.has(ext)) {
      const t = await readTextish(p, limit * 3)
      return t.replace(/\s+/g, ' ').trim().slice(0, limit)
    }
    if (['docx', 'xlsx', 'xlsm', 'pptx'].includes(ext)) {
      const t = await officeText(p, ext, limit * 3)
      return t.replace(/\s+/g, ' ').trim().slice(0, limit)
    }
    if (ext === 'pdf') {
      const r = await pdfText(p, limit * 2)
      return r.text.replace(/\s+/g, ' ').trim().slice(0, limit)
    }
  } catch (_) {}
  return ''
}

async function describe (p, opts = {}) {
  const ext = extOf(p)
  const kind = kindOf(p)
  const name = path.basename(p)
  let stat = null
  try { stat = await fsp.stat(p) } catch (_) {}
  if (!stat || !stat.isFile()) return { path: p, name, ext, kind, exists: false, size: 0, mtime: 0 }
  const out = { path: p, name, ext, kind, exists: true, size: stat.size, mtime: stat.mtimeMs }
  out.icon = await iconFor(p)
  if (kind === 'image') {
    try {
      out.dims = await imageDims(p, ext)
    } catch (_) {}
  }
  if (ext === 'pdf') {
    try {
      const r = await pdfText(p, 700)
      out.pages = r.pages || 0
      out.snippet = (r.text || '').replace(/\s+/g, ' ').trim().slice(0, 320)
    } catch (_) {}
  } else if (opts.snippet !== false) {
    out.snippet = await snippetOf(p, opts.snippetLimit || 320)
  }
  return out
}

async function describeMany (paths) {
  const out = []
  const queue = paths.slice()
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift()
      try { out.push(await describe(p)) } catch (_) { out.push({ path: p, name: path.basename(p), ext: extOf(p), kind: kindOf(p), exists: false }) }
    }
  }
  await Promise.all([worker(), worker()])
  return out
}

const SCAN_EXT = new Set([...KIND_LIST.doc, ...KIND_LIST.sheet, ...KIND_LIST.slide, ...KIND_LIST.pdf, ...KIND_LIST.cad, ...KIND_LIST.fem, ...KIND_LIST.image, ...KIND_LIST.text, ...KIND_LIST.model])

async function scanFolder (dir, cap = 800) {
  const found = []
  const skipDirs = new Set(['node_modules', '$RECYCLE.BIN', 'System Volume Information', '.git', 'AppData'])
  async function walk (d, depth) {
    if (found.length >= cap || depth > 6) return
    let entries = []
    try { entries = await fsp.readdir(d, { withFileTypes: true }) } catch (_) { return }
    for (const e of entries) {
      if (found.length >= cap) return
      if (e.name.startsWith('.')) continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        if (skipDirs.has(e.name)) continue
        await walk(full, depth + 1)
      } else if (e.isFile()) {
        if (SCAN_EXT.has(extOf(full))) found.push(full)
      }
    }
  }
  await walk(dir, 0)
  return found
}

module.exports = { describe, describeMany, extractText, scanFolder, kindOf, extOf, pdfText }
