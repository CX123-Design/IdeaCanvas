'use strict'
/* IdeaCanvas · 核心：状态、模型、历史、工具函数 */
window.CC = window.CC || {}

const U = {
  uid: () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
  esc (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  },
  fileUrl (p) {
    if (!p) return ''
    let s = String(p).replace(/\\/g, '/')
    if (!s.startsWith('/')) s = '/' + s
    return 'file://' + encodeURI(s).replace(/#/g, '%23').replace(/\+/g, '%2B')
  },
  fmtSize (n) {
    if (!n && n !== 0) return ''
    if (n < 1024) return n + ' B'
    if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'
    return (n / 1073741824).toFixed(2) + ' GB'
  },
  fmtTime (ms) {
    if (!ms) return ''
    const d = new Date(ms)
    const p = n => String(n).padStart(2, '0')
    return (d.getMonth() + 1) + '-' + p(d.getDate())
  },
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  debounce (fn, wait) {
    let t = null
    const w = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait) }
    w.cancel = () => clearTimeout(t)
    return w
  },
  now: () => Date.now()
}

const KIND_COLORS = {
  doc: '#6b8cff', sheet: '#3fbf8f', slide: '#f5a524', pdf: '#f0645c',
  cad: '#a78bfa', fem: '#2dd4bf', image: '#ec6ea8', text: '#94a3b8',
  model: '#93a6c4', other: '#6b7280'
}

/* 卡片之间的逻辑关系：决定连线颜色/线型与整理顺序 */
const REL = {
  flow: { label: '输入', color: '#7C8BFF', dash: false, hint: '资料作为输入交给下游处理' },
  ref: { label: '参考', color: '#8FA0C8', dash: true, hint: '下游可参考，但不是主要依据' },
  compare: { label: '对比', color: '#F0A24C', dash: false, hint: '两组资料互相比较差异' },
  check: { label: '校核', color: '#6EE0B4', dash: false, hint: '用前者校核/验证后者' },
  feedback: { label: '反馈', color: '#EC6EA8', dash: true, hint: '下游结果回传给上游迭代' }
}
const REL_KEYS = Object.keys(REL)

/* ---------- 状态 ---------- */
const state = {
  doc: null,
  view: { x: 60, y: 40, s: 1 },
  selection: new Set(),
  selectedEdge: null,
  history: [],
  future: [],
  dirty: false,
  mode: 'idle',
  workMode: false,
  connectSource: null,
  spaceDown: false,
  settings: null,
  tidy: null,        // 整理后的列通道信息，用于正交走线
  zTop: 0,           // 卡片叠放层级
  started: false
}

function blankDoc (name) {
  return {
    app: 'IdeaCanvas', version: 1, name: name || '未命名画布',
    createdAt: U.now(), updatedAt: U.now(),
    view: { x: 60, y: 40, s: 1 },
    nodes: [], edges: [],
    settings: { grid: true, snap: true }
  }
}

function snapshot () {
  return JSON.stringify({ nodes: state.doc.nodes, edges: state.doc.edges })
}

/* ---------- 文档操作 ---------- */
const Doc = {
  node (id) { return state.doc.nodes.find(n => n.id === id) },
  edge (id) { return state.doc.edges.find(e => e.id === id) },
  checkpoint () {
    state.history.push(snapshot())
    if (state.history.length > 30) state.history.shift()
    state.future.length = 0
  },
  undo () {
    if (!state.history.length) { U.toast && 0; CC.toast('没有可撤销的操作'); return }
    state.future.push(snapshot())
    const prev = JSON.parse(state.history.pop())
    state.doc.nodes = prev.nodes; state.doc.edges = prev.edges
    state.selection.clear(); state.selectedEdge = null
    CC.refresh()
  },
  redo () {
    if (!state.future.length) { CC.toast('没有可重做的操作'); return }
    state.history.push(snapshot())
    const next = JSON.parse(state.future.pop())
    state.doc.nodes = next.nodes; state.doc.edges = next.edges
    state.selection.clear(); state.selectedEdge = null
    CC.refresh()
  },
  addNode (n) {
    state.doc.nodes.push(n)
    CC.renderNodes(); CC.renderEdges(); CC.updateEmpty()
    return n
  },
  addNodes (list) {
    list = Array.isArray(list) ? list.filter(Boolean) : []
    if (!list.length) return []
    state.doc.nodes.push(...list)
    CC.renderNodes(); CC.renderEdges(); CC.updateEmpty()
    return list
  },
  removeNodes (ids) {
    ids = [...ids]
    if (!ids.length) return
    state.doc.nodes = state.doc.nodes.filter(n => !ids.includes(n.id))
    state.doc.edges = state.doc.edges.filter(e => !ids.includes(e.from) && !ids.includes(e.to))
    ids.forEach(id => state.selection.delete(id))
    CC.refresh()
  },
  connect (from, to, kind) {
    if (!from || !to || from === to) return null
    if (state.doc.edges.some(e => e.from === from && e.to === to)) return null
    const e = { id: U.uid(), from, to, kind: REL[kind] ? kind : 'flow', createdAt: U.now() }
    state.doc.edges.push(e)
    CC.renderEdges()
    return e
  },
  disconnect (id) {
    state.doc.edges = state.doc.edges.filter(e => e.id !== id)
    if (state.selectedEdge === id) state.selectedEdge = null
    CC.renderEdges()
  },
  incoming (nodeId) {
    return state.doc.edges.filter(e => e.to === nodeId).map(e => Doc.node(e.from)).filter(Boolean)
  },
  outgoing (nodeId) {
    return state.doc.edges.filter(e => e.from === nodeId).map(e => Doc.node(e.to)).filter(Boolean)
  },
  select (ids, additive) {
    if (!additive) state.selection.clear()
    ;(Array.isArray(ids) ? ids : [ids]).forEach(id => { if (id) state.selection.add(id) })
    state.selectedEdge = null
    CC.renderSelection()
  },
  toggle (id) {
    if (state.selection.has(id)) state.selection.delete(id); else state.selection.add(id)
    CC.renderSelection()
  },
  clearSelection () {
    state.selection.clear(); state.selectedEdge = null
    CC.renderSelection()
  }
}

/* ---------- 节点工厂 ---------- */
function fileNode (desc, x, y) {
  const h = desc.kind === 'image' ? 236 : (desc.kind === 'pdf' ? 190 : 168)
  return {
    id: U.uid(), type: 'file', x, y, w: 252, h,
    path: desc.path, name: desc.name, ext: desc.ext, kind: desc.kind,
    size: desc.size, mtime: desc.mtime, exists: desc.exists !== false,
    icon: desc.icon || '', thumb: desc.thumb ? U.fileUrl(desc.thumb) : '',
    snippet: desc.snippet || '', pages: desc.pages || 0, dims: desc.dims || '',
    createdAt: U.now()
  }
}

function noteNode (x, y, text) {
  return { id: U.uid(), type: 'note', x, y, w: 236, h: 168, text: text || '', color: 'amber', title: '便签', filePath: '', createdAt: U.now() }
}

/* ---------- 通用刷新与生命周期 ---------- */
CC.U = U
CC.KIND_COLORS = KIND_COLORS
CC.REL = REL
CC.REL_KEYS = REL_KEYS
CC.state = state
CC.Doc = Doc
CC.blankDoc = blankDoc
CC.snapshot = snapshot
CC.fileNode = fileNode
CC.noteNode = noteNode

let toastTimer = null
CC.toast = function (msg, type) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.className = 'toast show' + (type ? ' ' + type : '')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.className = 'toast' + (type ? ' ' + type : '') }, 2600)
}

CC.setDirty = function (v) {
  state.dirty = !!v
  const dot = document.getElementById('dirtyDot')
  if (dot) dot.hidden = !state.dirty
  if (CC.onDirtyChange) CC.onDirtyChange(state.dirty)
  else window.cc && window.cc.setDirty(state.dirty)
}

CC.title = function () {
  const name = state.doc ? state.doc.name : 'IdeaCanvas'
  const t = (state.dirty ? '● ' : '') + name + ' · IdeaCanvas'
  document.getElementById('docName').textContent = name
  window.cc && window.cc.setTitle(t)
}

CC.autosaveNow = function () {
  if (!state.doc) return
  const path = state.doc.path || null
  if (!path && !state.doc.nodes.length) return
  window.cc.autosave(CC.serialize(), path)
}

const autosaveDebounced = U.debounce(() => CC.autosaveNow(), 3500)

CC.touch = function (structural) {
  CC.setDirty(true)
  CC.title()
  if (structural) CC.updateEmpty()
  autosaveDebounced()
}

CC.serialize = function () {
  const d = state.doc
  return {
    app: 'IdeaCanvas', version: 1, name: d.name, path: d.path || '',
    createdAt: d.createdAt, updatedAt: U.now(),
    view: { x: state.view.x, y: state.view.y, s: state.view.s },
    nodes: d.nodes, edges: d.edges,
    settings: { grid: d.settings ? d.settings.grid : true, snap: d.settings ? d.settings.snap : true }
  }
}

/* 把画布数据转成内部文档对象（不改状态），供多标签复用 */
CC.makeDoc = function (data, path) {
  data = data || {}
  const goodName = data.name && data.name !== '未命名画布' ? data.name : ''
  const d = blankDoc(goodName || (path ? String(path).split(/[\\/]/).pop().replace(/\.cvproj$/i, '') : '未命名画布'))
  d.path = path || ''
  const rawNodes = Array.isArray(data.nodes) ? data.nodes : []
  const dropped = rawNodes.filter(n => n && (n.type === 'ai' || n.type === 'agent')).length
  d.nodes = rawNodes.filter(n => n && n.type !== 'ai' && n.type !== 'agent').map(n => Object.assign({}, n))
  d.edges = (data.edges || []).filter(e => e && e.from && e.to && d.nodes.some(n => n.id === e.from) && d.nodes.some(n => n.id === e.to))
    .map(e => ({ id: e.id, from: e.from, to: e.to, kind: REL[e.kind] ? e.kind : 'flow', createdAt: e.createdAt || 0 }))
  d.removedSpecial = dropped
  d.settings = data.settings || { grid: true, snap: true }
  d.createdAt = data.createdAt || U.now()
  return d
}

CC.makeView = function (data) {
  return (data && data.view && typeof data.view.s === 'number')
    ? { x: data.view.x, y: data.view.y, s: Math.max(0.15, Math.min(3, data.view.s)) }
    : { x: 60, y: 40, s: 1 }
}

CC.applyDoc = function (data, path) {
  const d = CC.makeDoc(data, path)
  state.doc = d
  state.history.length = 0
  state.future.length = 0
  state.selection.clear()
  state.selectedEdge = null
  state.tidy = null
  state.zTop = d.nodes.reduce((m, n) => Math.max(m, n.z || 0), 0)
  state.view = CC.makeView(data)
  CC.applyTransform()
  CC.renderNodes()
  CC.renderEdges()
  CC.renderMinimap()
  CC.updateEmpty()
  CC.updateToggles()
  CC.setDirty(false)
  CC.title()
  const meta = document.getElementById('docMeta')
  if (meta) meta.textContent = path || '未保存'
  if (d.removedSpecial) setTimeout(() => CC.toast('已移除旧版专属节点 ' + d.removedSpecial + ' 个'), 350)
}
