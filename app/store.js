'use strict'
/**
 * 本地设置存储：只保存界面偏好、便签目录与最近画布
 */
const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  general: { noteDir: '', autoSaveNote: true },
  ui: { grid: true, snap: true },
  recent: []
}

let cache = null

function filePath () {
  return path.join(app.getPath('userData'), 'settings.json')
}

function deepMerge (base, patch) {
  if (Array.isArray(patch)) return patch.slice()
  if (patch && typeof patch === 'object') {
    const out = Array.isArray(base) ? {} : Object.assign({}, base)
    for (const k of Object.keys(patch)) {
      out[k] = (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]))
        ? deepMerge(base ? base[k] : undefined, patch[k])
        : patch[k]
    }
    return out
  }
  return patch
}

function load () {
  if (cache) return cache
  let raw = {}
  try { raw = JSON.parse(fs.readFileSync(filePath(), 'utf8')) } catch (_) { raw = {} }
  cache = deepMerge(DEFAULTS, raw)
  return cache
}

function save () {
  const target = filePath()
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(cache, null, 2), 'utf8')
}

function publicView () {
  const s = load()
  return { general: s.general, ui: s.ui, recent: s.recent }
}

function setPatch (patch) {
  load()
  cache = deepMerge(cache, patch)
  save()
  return publicView()
}

function addRecent (p) {
  const s = load()
  const list = (s.recent || []).filter(x => x.path !== p)
  list.unshift({ path: p, name: path.basename(p, path.extname(p)), time: Date.now() })
  s.recent = list.slice(0, 12)
  save()
  return s.recent
}

module.exports = { load, save, publicView, setPatch, addRecent, filePath }
