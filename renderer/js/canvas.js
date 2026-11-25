'use strict'
/* IdeaCanvas · 画布渲染与交互 */
const stage = document.getElementById('stage')
const world = document.getElementById('world')
const nodesEl = document.getElementById('nodes')
const edgesEl = document.getElementById('edges')
const marqueeEl = document.getElementById('marquee')

const V = () => CC.state.view
const D = () => CC.state.doc
const S = () => CC.state
const isWork = () => !!S().workMode

/* ---------------- 工作模式 ---------------- */
CC.isWorkMode = isWork
CC.setWorkMode = function (v) {
  v = !!v
  if (S().workMode === v) return
  S().workMode = v
  if (v) {
    if (CC.closeModal && !document.getElementById('modal-root').hidden) CC.closeModal()
    if (CC.clearConnectSource) CC.clearConnectSource(true)
    S().selection.clear()
    S().selectedEdge = null
    document.getElementById('inspector').hidden = true
    document.body.classList.remove('ins-open')
    CC.renderSelection()
    S().tidy = null
  }
  document.body.classList.toggle('work-mode', v)
  stage.classList.toggle('work-mode', v)
  nodesEl.querySelectorAll('.node').forEach(el => { el.draggable = v })
  const badge = document.getElementById('modeBadge')
  if (badge) badge.hidden = !v
  if (CC.hideContext) CC.hideContext()
  CC.toast(v ? '工作模式：长按卡片拖到微信、QQ、桌面或资源管理器；双击空白返回梳理模式' : '已返回梳理思路模式', 'ok')
}
const modeExit = document.getElementById('modeExit')
if (modeExit) modeExit.addEventListener('click', e => { e.stopPropagation(); CC.setWorkMode(false) })

/* ---------------- 坐标 ---------------- */
function w2s (x, y) {
  const v = V()
  return { x: v.x + x * v.s, y: v.y + y * v.s }
}
function s2w (x, y) {
  const v = V()
  return { x: (x - v.x) / v.s, y: (y - v.y) / v.s }
}
CC.w2s = w2s
CC.s2w = s2w

CC.applyTransform = function () {
  const v = V()
  world.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.s + ')'
  const gs = 26 * v.s
  stage.style.setProperty('--gs', gs + 'px')
  stage.style.setProperty('--gx', (v.x % gs) + 'px')
  stage.style.setProperty('--gy', (v.y % gs) + 'px')
  const zVal = document.getElementById('zVal')
  if (zVal) zVal.textContent = Math.round(v.s * 100) + '%'
  CC.renderEdges()
  CC.renderMinimap()
}

CC.zoomTo = function (target, mx, my) {
  const v = V()
  const s = CC.U.clamp(target, 0.2, 2.6)
  const px = mx == null ? stage.clientWidth / 2 : mx
  const py = my == null ? stage.clientHeight / 2 : my
  v.x = px - (px - v.x) * (s / v.s)
  v.y = py - (py - v.y) * (s / v.s)
  v.s = s
  CC.applyTransform()
}

CC.fitView = function () {
  const nodes = D().nodes
  if (!nodes.length) { CC.state.view = { x: 60, y: 40, s: 1 }; CC.applyTransform(); return }
  const pad = 110
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h)
  }
  const bw = Math.max(200, maxX - minX), bh = Math.max(200, maxY - minY)
  const insW = document.getElementById('inspector') && !document.getElementById('inspector').hidden ? 336 : 0
  const availW = Math.max(320, stage.clientWidth - insW)
  const s = CC.U.clamp(Math.min((availW - pad * 2) / bw, (stage.clientHeight - pad * 2) / bh), 0.2, 1.4)
  V().s = s
  V().x = (availW - bw * s) / 2 - minX * s
  V().y = (stage.clientHeight - bh * s) / 2 - minY * s
  CC.applyTransform()
}

CC.centerOn = function (node) {
  const v = V()
  const insW = document.getElementById('inspector') && !document.getElementById('inspector').hidden ? 336 : 0
  const availW = Math.max(320, stage.clientWidth - insW)
  v.x = availW / 2 - (node.x + node.w / 2) * v.s
  v.y = stage.clientHeight / 2 - (node.y + node.h / 2) * v.s
  CC.applyTransform()
}

/* ---------------- 节点 DOM ---------------- */
const PORTS = '<div class="node-port left" data-port="left"></div><div class="node-port right" data-port="right"></div>' +
  '<div class="node-port top" data-port="top"></div><div class="node-port bottom" data-port="bottom"></div>'

function iconHtml (n) {
  if (n.icon) return '<img class="node-icon" src="' + n.icon + '" alt="" decoding="async">'
  const label = (n.ext || '?').slice(0, 3).toUpperCase()
  return '<span class="node-icon fallback">' + CC.U.esc(label) + '</span>'
}

function fileBody (n) {
  if (n.kind === 'image' && n.thumb) {
    return '<div class="node-thumb"><img class="lazy-thumb" data-src="' + n.thumb + '" alt="" decoding="async"></div>'
  }
  if (n.kind === 'pdf' || n.kind === 'cad' || n.kind === 'fem' || n.kind === 'model' || n.kind === 'other') {
    const extra = n.kind === 'pdf' ? (n.pages ? n.pages + ' 页' : '文档') : (n.kind === 'cad' ? 'CAD 图纸' : (n.kind === 'fem' ? '有限元文件' : (n.kind === 'model' ? '三维模型' : '文件')))
    const cover = '<div class="node-cover"><span class="cover-badge">' + CC.U.esc((n.ext || '').toUpperCase().slice(0, 5)) + '</span><div class="cover-meta">' + extra + '<br>双击打开</div></div>'
    if (n.snippet) return cover + '<div class="node-snippet" style="margin-top:7px">' + CC.U.esc(n.snippet.slice(0, 150)) + '</div>'
    return cover
  }
  if (n.snippet) return '<div class="node-snippet">' + CC.U.esc(n.snippet) + '</div>'
  return '<div class="node-snippet" style="color:#5f667a">暂无文本预览</div>'
}

function nodeHtml (n) {
  const selected = S().selection.has(n.id)
  const sourceClass = S().connectSource === n.id ? ' connect-source' : ''
  if (n.type === 'note') {
    return '<div class="node note' + (selected ? ' selected' : '') + sourceClass + '" data-id="' + n.id + '" style="left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px;height:' + n.h + 'px">' +
      PORTS +
      '<div class="node-head"><div class="node-title">便签</div><span class="node-badge" style="--kind:#e0a83c">NOTE</span></div>' +
      '<div class="node-body"><div class="node-text">' + CC.U.esc(n.text || '双击编辑便签内容') + '</div></div>' +
      '<div class="node-foot"><span>' + (n.filePath ? 'TXT 已同步' : '双击编辑') + '</span><div class="right">' +
      '<button class="mini-btn" data-act="note-save">存 TXT</button>' +
      '<button class="mini-btn" data-act="note-edit">编辑</button></div></div></div>'
  }
  // file
  const color = CC.KIND_COLORS[n.kind] || '#6b7280'
  const missing = n.exists === false
  return '<div class="node file' + (selected ? ' selected' : '') + sourceClass + (missing ? ' missing' : '') + '" data-id="' + n.id + '" data-kind="' + n.kind + '" style="left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px;height:' + n.h + 'px;--kind:' + color + '">' +
    PORTS +
    '<div class="node-head">' + iconHtml(n) + '<div class="node-title" title="' + CC.U.esc(n.path) + '">' + CC.U.esc(n.name) + '</div>' +
    '<span class="node-badge">' + CC.U.esc((n.ext || '?').toUpperCase()) + '</span></div>' +
    '<div class="node-body">' + fileBody(n) + (missing ? '<div class="node-snippet" style="color:#ff9d97">⚠ 文件已不存在或已移动</div>' : '') + '</div>' +
    '<div class="node-foot"><span>' + CC.U.fmtSize(n.size) + (n.dims ? ' · ' + n.dims : '') + '</span><span class="dotsep">·</span><span>' + CC.U.fmtTime(n.mtime) + '</span>' +
    '<div class="right"><button class="mini-btn" data-act="open">打开</button></div></div></div>'
}

let thumbObserver = null
function observeThumbs (scope) {
  if (!thumbObserver) {
    thumbObserver = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (!en.isIntersecting) continue
        const img = en.target
        if (img.dataset && img.dataset.src) {
          img.src = img.dataset.src
          delete img.dataset.src
        }
        thumbObserver.unobserve(img)
      }
    }, { root: stage, rootMargin: '260px' })
  }
  ;(scope || nodesEl).querySelectorAll('img[data-src]').forEach(img => thumbObserver.observe(img))
}

CC.renderNodes = function () {
  const html = D().nodes.map(nodeHtml).join('')
  nodesEl.innerHTML = html
  D().nodes.forEach(n => {
    const el = nodesEl.querySelector('[data-id="' + n.id + '"]')
    if (el && n.z) el.style.zIndex = n.z
  })
  if (CC.isWorkMode()) nodesEl.querySelectorAll('.node').forEach(el => { el.draggable = true })
  observeThumbs(nodesEl)
}

CC.bringToFront = function (ids) {
  const list = Array.isArray(ids) ? ids : [ids]
  list.forEach(id => {
    const n = CC.Doc.node(id)
    if (!n) return
    n.z = ++CC.state.zTop
    const el = nodesEl.querySelector('[data-id="' + id + '"]')
    if (el) el.style.zIndex = n.z
  })
}

CC.renderNode = function (id) {  const n = CC.Doc.node(id)
  const el = nodesEl.querySelector('[data-id="' + id + '"]')
  if (!n) { if (el) el.remove(); return }
  if (!el) { nodesEl.insertAdjacentHTML('beforeend', nodeHtml(n)); observeThumbs(nodesEl); return }
  const tmp = document.createElement('div')
  tmp.innerHTML = nodeHtml(n)
  const fresh = tmp.firstElementChild
  if (CC.isWorkMode()) fresh.draggable = true
  el.replaceWith(fresh)
  observeThumbs(fresh)
}

CC.refresh = function () {
  CC.renderNodes()
  CC.renderEdges()
  CC.renderMinimap()
  CC.updateEmpty()
  CC.updateToggles()
  if (CC.renderInspector) CC.renderInspector()
}

CC.renderSelection = function () {
  nodesEl.querySelectorAll('.node').forEach(el => {
    el.classList.toggle('selected', S().selection.has(el.dataset.id))
    el.classList.toggle('connect-source', S().connectSource === el.dataset.id)
  })
  CC.renderEdges()
  CC.renderInspector && CC.renderInspector()
}

/* ---------------- 连线 ---------------- */
const SIDE_VEC = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }
const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }

function portPoint (n, side) {
  if (side === 'left') return { x: n.x, y: n.y + n.h / 2 }
  if (side === 'right') return { x: n.x + n.w, y: n.y + n.h / 2 }
  if (side === 'top') return { x: n.x + n.w / 2, y: n.y }
  return { x: n.x + n.w / 2, y: n.y + n.h }
}

/* 依据两张卡片的相对位置挑选最自然的一对端口 */
function pickSides (a, b) {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2)
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2)
  if (Math.abs(dx) >= Math.abs(dy) * 1.1) return dx >= 0 ? ['right', 'left'] : ['left', 'right']
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
}

function edgeGeom (p1, p2, s1, s2) {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (dist < 56) {
    return { d: 'M' + p1.x + ',' + p1.y + ' L' + p2.x + ',' + p2.y, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } }
  }
  const cd = Math.max(38, Math.min(180, dist * 0.45))
  const v1 = SIDE_VEC[s1] || [0, 0]
  const v2 = SIDE_VEC[s2] || [0, 0]
  const c1 = { x: p1.x + v1[0] * cd, y: p1.y + v1[1] * cd }
  const c2 = { x: p2.x + v2[0] * cd, y: p2.y + v2[1] * cd }
  // 三次贝塞尔 t=0.5 处作为关系标签位置
  const mid = {
    x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8,
    y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8
  }
  return {
    d: 'M' + p1.x + ',' + p1.y + ' C' + c1.x + ',' + c1.y + ' ' + c2.x + ',' + c2.y + ' ' + p2.x + ',' + p2.y,
    mid
  }
}

function edgeCurve (p1, p2, s1, s2) { return edgeGeom(p1, p2, s1, s2).d }

/* 折线转圆角路径 */
function polyPath (pts, r) {
  if (pts.length < 2) return ''
  const rad = r == null ? 10 : r
  let d = 'M' + pts[0].x + ',' + pts[0].y
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    if (i === pts.length - 1) { d += ' L' + p.x + ',' + p.y; break }
    const prev = pts[i - 1], next = pts[i + 1]
    const l1 = Math.hypot(p.x - prev.x, p.y - prev.y) || 1
    const l2 = Math.hypot(next.x - p.x, next.y - p.y) || 1
    const rr = Math.min(rad, l1 / 2, l2 / 2)
    const a = { x: p.x - (p.x - prev.x) / l1 * rr, y: p.y - (p.y - prev.y) / l1 * rr }
    const b = { x: p.x + (next.x - p.x) / l2 * rr, y: p.y + (next.y - p.y) / l2 * rr }
    d += ' L' + a.x + ',' + a.y + ' Q' + p.x + ',' + p.y + ' ' + b.x + ',' + b.y
  }
  return d
}

/* 整理后的正交走线：横向走卡片之间的通道，纵向段落在列间空隙里，不穿过卡片 */
function tidyBandY (t, c0, c1, desired) {
  const spans = []
  for (let c = Math.min(c0, c1) + 1; c < Math.max(c0, c1); c++) {
    const col = t.cols[c]
    if (!col || !col.ids) continue
    col.ids.forEach(id => {
      const n = CC.Doc.node(id)
      if (n) spans.push([n.y, n.y + n.h])
    })
  }
  if (!spans.length) return desired
  spans.sort((a, b) => a[0] - b[0])
  const merged = []
  spans.forEach(s => {
    const last = merged[merged.length - 1]
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1])
    else merged.push([s[0], s[1]])
  })
  const cands = [merged[0][0] - 44]
  for (let i = 1; i < merged.length; i++) {
    const gap = merged[i][0] - merged[i - 1][1]
    if (gap >= 18) cands.push((merged[i][0] + merged[i - 1][1]) / 2)
  }
  cands.push(merged[merged.length - 1][1] + 44)
  return cands.reduce((best, y) => Math.abs(y - desired) < Math.abs(best - desired) ? y : best, cands[0])
}

function tidyGeom (e, a, b) {
  const t = S().tidy
  if (!t || !t.pos || !t.cols) return null
  const pa = t.pos[a.id], pb = t.pos[b.id]
  if (!pa || !pb) return null
  if (Math.abs(a.x - pa[0]) > 1 || Math.abs(a.y - pa[1]) > 1 ||
      Math.abs(b.x - pb[0]) > 1 || Math.abs(b.y - pb[1]) > 1) return null
  const ci = t.col[a.id], cj = t.col[b.id]
  if (ci == null || cj == null || !t.cols[ci] || !t.cols[cj]) return null
  const ay = a.y + a.h / 2, by = b.y + b.h / 2
  const W = []

  if (ci === cj) {
    // 同列：从右侧通道绕一下，避免穿过中间的卡片
    const lane = t.cols[ci].x + t.cols[ci].w + 60
    W.push({ x: a.x + a.w, y: ay }, { x: lane, y: ay }, { x: lane, y: by }, { x: b.x + b.w, y: by })
  } else {
    const forward = cj > ci
    const span = Math.abs(cj - ci)
    const laneS = forward ? t.cols[ci].x + t.cols[ci].w + 60 : t.cols[ci].x - 60
    const laneT = forward ? t.cols[cj].x - 60 : t.cols[cj].x + t.cols[cj].w + 60
    const p1 = { x: forward ? a.x + a.w : a.x, y: ay }
    const p2 = { x: forward ? b.x : b.x + b.w, y: by }
    if (span === 1 && Math.abs(by - ay) < 2) {
      W.push(p1, p2)
    } else if (span === 1) {
      W.push(p1, { x: laneT, y: ay }, { x: laneT, y: by }, p2)
    } else {
      // 跨多列：从列与列之间的空隙里找一条横向通道，绕开中间所有卡片
      const band = tidyBandY(t, ci, cj, (ay + by) / 2)
      W.push(p1, { x: laneS, y: ay }, { x: laneS, y: band }, { x: laneT, y: band }, { x: laneT, y: by }, p2)
    }
  }

  const sp = W.map(q => w2s(q.x, q.y))
  let mid = { x: sp[0].x, y: sp[0].y }
  if (sp.length === 2) mid = { x: (sp[0].x + sp[1].x) / 2, y: (sp[0].y + sp[1].y) / 2 }
  else if (sp.length === 4) mid = { x: (sp[1].x + sp[2].x) / 2, y: (sp[1].y + sp[2].y) / 2 }
  else if (sp.length === 6) mid = { x: (sp[2].x + sp[3].x) / 2, y: (sp[2].y + sp[3].y) / 2 }
  return { d: polyPath(sp), mid }
}

let edgeFrame = 0
CC.renderEdges = function () {
  if (edgeFrame) return
  edgeFrame = requestAnimationFrame(() => { edgeFrame = 0; drawEdges() })
}
CC.renderEdgesNow = function () { drawEdges() }

function drawEdges () {
  const doc = D()
  if (!doc) return
  const sel = S().selection
  const zoom = V().s
  const parts = []
  const labelParts = []
  const labelsEl = document.getElementById('labels')
  for (const e of doc.edges) {
    const a = CC.Doc.node(e.from), b = CC.Doc.node(e.to)
    if (!a || !b) continue
    const rel = CC.REL[e.kind] || CC.REL.flow
    let g = tidyGeom(e, a, b)
    if (!g) {
      const [s1, s2] = pickSides(a, b)
      const p1 = w2s(portPoint(a, s1).x, portPoint(a, s1).y)
      const p2 = w2s(portPoint(b, s2).x, portPoint(b, s2).y)
      g = edgeGeom(p1, p2, s1, s2)
    }
    const related = !sel.size || sel.has(a.id) || sel.has(b.id)
    const isSel = e.id === S().selectedEdge
    const classes = 'e' + (isSel ? ' selected' : '') + (related ? '' : ' dim') + (rel.dash ? ' dashed' : '')
    parts.push('<g class="' + classes + '" data-edge="' + e.id + '"><path class="edge-hit" d="' + g.d + '"></path>' +
      '<path class="edge-line" d="' + g.d + '" stroke="' + rel.color + '" marker-end="url(#arrow-' + (e.kind || 'flow') + ')"></path></g>')
    // 关系标签单独画在上层，带底色，保证不会被卡片遮住、也能看清
    if (zoom > 0.25 && (e.kind !== 'flow' || isSel)) {
      const text = rel.label
      const w = text.length * 11 + 16
      const h = 18
      labelParts.push('<g class="e-label-g" style="opacity:' + (related ? 1 : 0.35) + '">' +
        '<rect x="' + Math.round(g.mid.x - w / 2) + '" y="' + Math.round(g.mid.y - h / 2) + '" width="' + w + '" height="' + h + '" rx="9" fill="#0A0A0A" stroke="' + rel.color + '" stroke-opacity=".45"></rect>' +
        '<text class="edge-label" x="' + Math.round(g.mid.x) + '" y="' + Math.round(g.mid.y + 3.5) + '" fill="' + rel.color + '">' + text + '</text></g>')
    }
  }
  edgesEl.innerHTML = parts.join('')
  if (labelsEl) labelsEl.innerHTML = labelParts.join('')
}

/* 拖动连线时的临时线 */
CC.showTempEdge = function (x1, y1, x2, y2, s1, s2) {
  let p = document.getElementById('tempEdge')
  if (!p) {
    p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('id', 'tempEdge')
    p.setAttribute('class', 'temp')
    edgesEl.appendChild(p)
  }
  p.setAttribute('d', edgeCurve({ x: x1, y: y1 }, { x: x2, y: y2 }, s1 || 'right', s2 || 'left'))
}
CC.hideTempEdge = function () {
  const p = document.getElementById('tempEdge')
  if (p) p.remove()
}

/* 指针相对起点的方向，用于拖线时反向端口的朝向 */
CC.sideToward = function (dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'left' : 'right'
  return dy >= 0 ? 'top' : 'bottom'
}

/* 连线悬停提示 + 双击删除 */
function edgeHintAt (x, y) {
  const hint = document.getElementById('edgeHint')
  if (!hint) return
  hint.hidden = false
  hint.style.left = Math.min(x + 14, window.innerWidth - 150) + 'px'
  hint.style.top = Math.min(y + 14, window.innerHeight - 40) + 'px'
}
function hideEdgeHint () {
  const hint = document.getElementById('edgeHint')
  if (hint) hint.hidden = true
}
edgesEl.addEventListener('pointermove', e => {
  if (isWork()) { hideEdgeHint(); return }
  const g = e.target.closest('g[data-edge]')
  if (g) edgeHintAt(e.clientX, e.clientY)
  else hideEdgeHint()
})
edgesEl.addEventListener('pointerleave', hideEdgeHint)
edgesEl.addEventListener('dblclick', e => {
  if (isWork()) return
  const g = e.target.closest('g[data-edge]')
  if (!g) return
  e.preventDefault()
  e.stopPropagation()
  const id = g.dataset.edge
  CC.Doc.checkpoint()
  CC.Doc.disconnect(id)
  CC.touch(true)
  hideEdgeHint()
  CC.toast('已删除这条连线', 'ok')
})

/* ---------------- 小地图 ---------------- */
let mmFrame = 0
CC.renderMinimap = function () {
  if (mmFrame) return
  mmFrame = requestAnimationFrame(() => { mmFrame = 0; drawMinimap() })
}

function drawMinimap () {
  const cv = document.getElementById('mmCanvas')
  if (!cv || !D()) return
  const ctx = cv.getContext('2d')
  const W = cv.width, H = cv.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#181818'
  ctx.fillRect(0, 0, W, H)
  const nodes = D().nodes
  if (!nodes.length) {
    ctx.fillStyle = '#6E6E6E'
    ctx.font = '11px "Manrope","Segoe UI","Microsoft YaHei"'
    ctx.textAlign = 'center'
    ctx.fillText('画布为空 · 拖入文件开始', W / 2, H / 2 + 4)
    cv._map = null
    return
  }
  let minX = 0, minY = 0, maxX = stage.clientWidth / V().s, maxY = stage.clientHeight / V().s
  if (nodes.length) {
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity
    for (const n of nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h)
    }
  }
  const pad = 40
  const bw = Math.max(1, maxX - minX) + pad * 2, bh = Math.max(1, maxY - minY) + pad * 2
  const k = Math.min(W / bw, H / bh)
  const ox = (W - bw * k) / 2 - (minX - pad) * k
  const oy = (H - bh * k) / 2 - (minY - pad) * k
  // 视口
  const vr = { x: (-V().x / V().s) * k + ox, y: (-V().y / V().s) * k + oy, w: (stage.clientWidth / V().s) * k, h: (stage.clientHeight / V().s) * k }
  ctx.strokeStyle = 'rgba(107,140,255,.45)'
  ctx.lineWidth = 1
  ctx.strokeRect(vr.x, vr.y, vr.w, vr.h)
  ctx.fillStyle = 'rgba(107,140,255,.06)'
  ctx.fillRect(vr.x, vr.y, vr.w, vr.h)
  for (const n of nodes) {
    const c = CC.KIND_COLORS[n.kind] || (n.type === 'note' ? '#e0a83c' : '#6b7280')
    ctx.fillStyle = c + 'cc'
    ctx.fillRect(n.x * k + ox, n.y * k + oy, Math.max(2, n.w * k), Math.max(2, n.h * k))
  }
  cv._map = { k, ox, oy }
}

document.getElementById('mmCanvas')?.addEventListener('pointerdown', e => {
  const cv = e.currentTarget
  const m = cv._map
  if (!m) return
  const r = cv.getBoundingClientRect()
  const px = e.clientX - r.left, py = e.clientY - r.top
  const wx = (px - m.ox) / m.k, wy = (py - m.oy) / m.k
  V().x = stage.clientWidth / 2 - wx * V().s
  V().y = stage.clientHeight / 2 - wy * V().s
  CC.applyTransform()
})

/* ---------------- 交互 ---------------- */
let drag = null
let spaceDown = false
let holdDrag = null

function removeDragGhost () {
  const el = document.getElementById('dragGhost')
  if (el) el.remove()
  stage.classList.remove('drag-arming', 'drag-ready')
}

function cancelHoldDrag () {
  if (!holdDrag) return
  if (holdDrag.armTimer) clearTimeout(holdDrag.armTimer)
  if (holdDrag.startTimer) clearTimeout(holdDrag.startTimer)
  try { stage.releasePointerCapture(holdDrag.pointerId) } catch (_) {}
  holdDrag = null
  removeDragGhost()
}

function moveDragGhost (x, y) {
  const el = document.getElementById('dragGhost')
  if (!el) return
  el.style.left = x + 'px'
  el.style.top = y + 'px'
}

function showDragGhost (n, x, y) {
  removeDragGhost()
  const ghost = document.createElement('div')
  ghost.id = 'dragGhost'
  ghost.className = 'drag-ghost'
  ghost.innerHTML = (n.icon ? '<img src="' + n.icon + '" alt="" decoding="async">' : '<span class="dg-letter">' + CC.U.esc((n.ext || n.type || '?').slice(0, 3).toUpperCase()) + '</span>') +
    '<span class="dg-name">' + CC.U.esc(n.name || n.title || '便签') + '</span>'
  document.body.appendChild(ghost)
  moveDragGhost(x, y)
  stage.classList.add('drag-ready')
}

function beginHoldDrag (nodeEl, e) {
  const n = CC.Doc.node(nodeEl.dataset.id)
  if (!n) return
  const pointerId = e.pointerId
  holdDrag = { id: n.id, pointerId, x: e.clientX, y: e.clientY, downAt: Date.now(), fileInfo: null, armTimer: null }
  stage.classList.add('drag-arming')
  // 不要 setPointerCapture：指针捕获会妨碍 Chromium 在长按后触发原生 dragstart
  holdDrag.armTimer = setTimeout(() => {
    if (!holdDrag || holdDrag.id !== n.id) return
    showDragGhost(n, holdDrag.x, holdDrag.y)
    // 只按一下就松开不会生成临时文件；长按 380ms 后才准备拖出替身
    prepareDragInfo(n).then(info => { if (holdDrag && holdDrag.id === n.id) holdDrag.fileInfo = info })
      .catch(() => {})
  }, 380)
}

function prepareDragInfo (n) {
  // 文件卡也走临时替身，避免拖到资源管理器时把原文件“移动”走
  return window.cc.prepareDrag({
    path: n.type === 'file' ? (n.path || '') : (n.filePath || ''),
    name: (n.name || n.title || '便签'),
    text: n.text != null ? n.text : (n.snippet || '')
  }).then(r => {
    if (!r || !r.ok) throw new Error((r && r.error) || '无法生成临时文件')
    return { file: r.path, icon: n.icon || '', label: n.name || n.title || '便签' }
  })
}

CC.dragOutNode = async function (id) {
  const n = CC.Doc.node(id)
  if (!n) return false
  try {
    const info = await prepareDragInfo(n)
    window.cc.startDrag(info)
    return true
  } catch (err) {
    CC.toast('拖出失败：' + String((err && err.message) || err), 'err')
    return false
  }
}

function localPoint (e) {
  const r = stage.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function pushSnapshot (snap) {
  S().history.push(snap)
  if (S().history.length > 80) S().history.shift()
  S().future.length = 0
}

stage.addEventListener('pointerdown', e => {
  if (!D()) return
  // 画布上的浮动界面（HUD、小地图、引导层、指令条）自行处理点击，不能落到框选逻辑
  if (e.target.closest('.hud, #empty, #hintbar, #minimap, #toolrail, #tabbar')) return
  if (CC.hideContext) CC.hideContext()
  if (isWork()) {
    // 工作模式：只允许空格/右键平移，左键在卡片上长按拖出；卡片不能移动、不能选中
    if (e.button === 2 || (e.button === 0 && spaceDown)) {
      drag = { type: 'pan', px: e.clientX, py: e.clientY, vx: V().x, vy: V().y }
      stage.classList.add('panning')
      try { stage.setPointerCapture(e.pointerId) } catch (_) {}
      e.preventDefault()
      return
    }
    if (e.button === 0) {
      const nodeEl = e.target.closest('.node')
      if (nodeEl && !e.target.closest('[data-act]')) {
        beginHoldDrag(nodeEl, e)
        // 这里不能 preventDefault：否则 Chromium 不会派发原生 dragstart，长按后就拖不出去
      }
    }
    return
  }
  if (e.button === 1 || spaceDown) {
    drag = { type: 'pan', px: e.clientX, py: e.clientY, vx: V().x, vy: V().y }
    stage.classList.add('panning')
    try { stage.setPointerCapture(e.pointerId) } catch (_) {}
    e.preventDefault()
    return
  }
  if (e.button === 2) {
    drag = { type: 'pan', px: e.clientX, py: e.clientY, vx: V().x, vy: V().y, context: true, moved: 0, target: e.target }
    try { stage.setPointerCapture(e.pointerId) } catch (_) {}
    return
  }
  const portEl = e.target.closest('.node-port')
  if (portEl) {
    const nodeEl = portEl.closest('.node')
    const n = CC.Doc.node(nodeEl.dataset.id)
    if (n) {
      const side = portEl.dataset.port || 'right'
      const start = w2s(portPoint(n, side).x, portPoint(n, side).y)
      drag = { type: 'link', from: n.id, x1: start.x, y1: start.y, s1: side, pointerId: e.pointerId }
      CC.showTempEdge(start.x, start.y, start.x, start.y, side, OPPOSITE[side])
      try { stage.setPointerCapture(e.pointerId) } catch (_) {}
      e.preventDefault(); e.stopPropagation()
      return
    }
  }
  const nodeEl = e.target.closest('.node')
  if (nodeEl && !e.target.closest('[data-act]')) {
    const id = nodeEl.dataset.id
    const n = CC.Doc.node(id)
    if (!n) return
    CC.bringToFront(S().selection.has(id) ? [...S().selection] : [id])
    // 不在 pointerdown 时选中，也不立即开始移动：先记为“待定”，
    // 移动超过 5px 才算拖拽，否则 pointerup 时按单击处理（只选中）。
    drag = {
      type: 'pending-move', id, sx: e.clientX, sy: e.clientY,
      wasSelected: S().selection.has(id), shift: e.shiftKey, moved: false,
      pointerId: e.pointerId, snap: CC.snapshot()
    }
    e.preventDefault()
    return
  }
  const edgeG = e.target.closest('g[data-edge]')
  if (edgeG) {
    S().selectedEdge = edgeG.dataset.edge
    S().selection.clear()
    CC.renderSelection()
    return
  }
  // 卡片上的按钮/链接：交给 click 处理，不要进入框选
  if (e.target.closest('.node') || e.target.closest('[data-act]')) return
  // 空白：框选
  const p = localPoint(e)
  drag = { type: 'marquee', x0: p.x, y0: p.y, additive: e.shiftKey, pointerId: e.pointerId }
  marqueeEl.hidden = false
  marqueeEl.style.left = p.x + 'px'; marqueeEl.style.top = p.y + 'px'
  marqueeEl.style.width = '0px'; marqueeEl.style.height = '0px'
  stage.setPointerCapture(e.pointerId)
  if (!e.shiftKey) CC.Doc.clearSelection()
})

let lastPointer = null
stage.addEventListener('pointermove', e => {
  lastPointer = localPoint(e)
  CC.lastPointer = lastPointer
  if (holdDrag) {
    holdDrag.x = e.clientX; holdDrag.y = e.clientY
    moveDragGhost(e.clientX, e.clientY)
    return
  }
  if (!drag) return
  if (drag.type === 'pending-move') {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return
    const id = drag.id
    if (drag.shift) { if (!S().selection.has(id)) CC.Doc.toggle(id) }
    else if (!drag.wasSelected) CC.Doc.select(id)
    CC.bringToFront([...S().selection])
    const starts = new Map()
    S().tidy = null
    S().selection.forEach(nid => { const x = CC.Doc.node(nid); if (x) starts.set(nid, { x: x.x, y: x.y }) })
    drag = { type: 'move', sx: drag.sx, sy: drag.sy, starts, moved: true, snap: drag.snap, pointerId: drag.pointerId }
    nodesEl.querySelectorAll('.node.selected').forEach(el => el.classList.add('dragging'))
    try { stage.setPointerCapture(drag.pointerId) } catch (_) {}
  }
  if (drag.type === 'pan') {
    const dx = e.clientX - drag.px, dy = e.clientY - drag.py
    if (drag.context) { drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy)); if (drag.moved < 4) return }
    V().x = drag.vx + dx; V().y = drag.vy + dy
    CC.applyTransform()
    return
  }
  if (drag.type === 'move') {
    const dx = (e.clientX - drag.sx) / V().s, dy = (e.clientY - drag.sy) / V().s
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
    const snapOn = D().settings.snap && !e.altKey
    drag.starts.forEach((st, id) => {
      const n = CC.Doc.node(id)
      if (!n) return
      let nx = st.x + dx, ny = st.y + dy
      if (snapOn) { nx = Math.round(nx / 8) * 8; ny = Math.round(ny / 8) * 8 }
      n.x = nx; n.y = ny
      const el = nodesEl.querySelector('[data-id="' + id + '"]')
      if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px' }
    })
    CC.renderEdges(); CC.renderMinimap()
    return
  }
  if (drag.type === 'link') {
    const p = localPoint(e)
    const dx = p.x - drag.x1, dy = p.y - drag.y1
    const s2 = CC.sideToward(dx, dy)
    CC.showTempEdge(drag.x1, drag.y1, p.x, p.y, drag.s1, s2)
    return
  }
  if (drag.type === 'marquee') {
    const p = localPoint(e)
    const x = Math.min(p.x, drag.x0), y = Math.min(p.y, drag.y0)
    const w = Math.abs(p.x - drag.x0), h = Math.abs(p.y - drag.y0)
    marqueeEl.style.left = x + 'px'; marqueeEl.style.top = y + 'px'
    marqueeEl.style.width = w + 'px'; marqueeEl.style.height = h + 'px'
  }
})

stage.addEventListener('pointerup', e => {
  if (holdDrag) {
    if (!holdDrag.started) cancelHoldDrag()
    return
  }
  if (!drag) return
  const d = drag
  drag = null
  stage.classList.remove('panning')
  try { stage.releasePointerCapture(e.pointerId) } catch (_) {}

  if (d.type === 'pan' && d.context) {
    if (d.moved < 4) {
      const nodeEl = d.target && d.target.closest ? d.target.closest('.node') : null
      const edgeG = d.target && d.target.closest ? d.target.closest('g[data-edge]') : null
      if (nodeEl) {
        CC.rightCardTap(nodeEl.dataset.id, e.clientX, e.clientY)
      } else if (edgeG) {
        CC.showEdgeMenu(edgeG.dataset.edge, e.clientX, e.clientY)
      } else {
        if (S().connectSource) CC.clearConnectSource(true)
        CC.showCanvasMenu(e.clientX, e.clientY)
      }
    }
    return
  }
  if (d.type === 'pending-move') {
    // 没有越过拖拽阈值：纯单击，只改变选中，不移动卡片
    if (d.shift) CC.Doc.toggle(d.id)
    else CC.Doc.select(d.id)
    return
  }
  if (d.type === 'move') {
    nodesEl.querySelectorAll('.node.dragging').forEach(el => el.classList.remove('dragging'))
    if (d.moved) { pushSnapshot(d.snap); CC.touch(true); CC.renderInspector && CC.renderInspector() }
    return
  }
  if (d.type === 'link') {
    CC.hideTempEdge()
    const hit = document.elementFromPoint(e.clientX, e.clientY)
    const targetNode = hit && hit.closest ? hit.closest('.node') : null
    if (targetNode) {
      const to = targetNode.dataset.id
      if (to && to !== d.from) {
        CC.Doc.checkpoint()
        const e2 = CC.Doc.connect(d.from, to)
        if (e2) { CC.touch(true); CC.toast('已建立关联', 'ok') }
      }
    }
    return
  }
  if (d.type === 'marquee') {
    const rect = marqueeEl.getBoundingClientRect()
    marqueeEl.hidden = true
    if (rect.width > 4 && rect.height > 4) {
      const r = stage.getBoundingClientRect()
      const x1 = (rect.left - r.left - V().x) / V().s, y1 = (rect.top - r.top - V().y) / V().s
      const x2 = (rect.right - r.left - V().x) / V().s, y2 = (rect.bottom - r.top - V().y) / V().s
      const ids = D().nodes.filter(n => n.x + n.w > x1 && n.x < x2 && n.y + n.h > y1 && n.y < y2).map(n => n.id)
      if (d.additive) ids.forEach(id => S().selection.add(id)) ; else CC.Doc.select(ids)
      CC.renderSelection()
    }
  }
})

stage.addEventListener('pointercancel', () => { cancelHoldDrag() })

stage.addEventListener('wheel', e => {
  if (!D()) return
  e.preventDefault()
  if (isWork()) return
  const p = localPoint(e)
  const k = Math.exp(-e.deltaY * 0.0016)
  CC.zoomTo(V().s * k, p.x, p.y)
}, { passive: false })

stage.addEventListener('dblclick', e => {
  if (!D()) return
  if (e.target.closest('.hud, #hintbar, #minimap, #toolrail, #tabbar, #topbar')) return
  const nodeEl = e.target.closest('.node')
  const edgeG = e.target.closest('g[data-edge]')
  if (isWork()) {
    if (nodeEl || edgeG) return
    e.preventDefault()
    CC.setWorkMode(false)
    return
  }
  if (nodeEl) {
    const n = CC.Doc.node(nodeEl.dataset.id)
    if (!n) return
    if (n.type === 'file') CC.openFile(n.path)
    else if (n.type === 'note') CC.editNote(n.id)
    return
  }
  if (edgeG) return
  // 空白双击：进入工作模式（这里不再新建便签，便签用左侧按钮或右键菜单）
  e.preventDefault()
  CC.setWorkMode(true)
})

/* 空格平移（不再绑定任何“重复上一步”行为；并阻止空格触发焦点按钮的 click） */
window.addEventListener('keydown', e => {
  const typing = e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
  if (e.code === 'Space' && !typing) {
    // 按钮拿到焦点时，空格会被浏览器当成 click，等于“再执行一次上一个操作”，这里直接掐掉
    if (e.target && e.target.closest && e.target.closest('button')) {
      e.preventDefault()
      e.target.blur()
    }
    if (!e.repeat) {
      spaceDown = true
      stage.classList.add('space-ready')
    }
    if (e.target === document.body || !typing) e.preventDefault()
  }
})
window.addEventListener('keyup', e => {
  if (e.code === 'Space') { spaceDown = false; stage.classList.remove('space-ready') }
})
window.addEventListener('blur', () => { spaceDown = false; stage.classList.remove('space-ready'); cancelHoldDrag() })

/* 节点上的小按钮 */
nodesEl.addEventListener('click', e => {
  if (isWork()) return
  const btn = e.target.closest('[data-act]')
  if (!btn) return
  const nodeEl = btn.closest('.node')
  const n = nodeEl && CC.Doc.node(nodeEl.dataset.id)
  if (!n) return
  e.stopPropagation()
  const act = btn.dataset.act
  if (act === 'open') { CC.openFile(n.path) }
  else if (act === 'note-save') { CC.saveNote(n.id) }
  else if (act === 'note-edit') { CC.editNote(n.id) }
})

/* 工作模式下长按后拖出：依靠原生 dragstart 触发 startDrag，普通拖拽一律禁止 */
nodesEl.addEventListener('dragstart', e => {
  const nodeEl = e.target.closest ? e.target.closest('.node') : null
  e.preventDefault()
  if (!isWork() || !nodeEl) return
  const h = holdDrag
  const id = nodeEl.dataset.id
  if (!h || h.id !== id) return
  if (Date.now() - h.downAt < 500) { cancelHoldDrag(); return }
  if (!h.fileInfo) {
    CC.toast('文件还在准备，按住卡片稍等半秒再拖', 'warn')
    cancelHoldDrag()
    return
  }
  const info = h.fileInfo
  holdDrag = null
  removeDragGhost()
  stage.classList.remove('drag-arming')
  window.cc.startDrag(info)
})

CC.updateEmpty = function () {
  const el = document.getElementById('empty')
  if (!el) return
  const has = !!(D() && D().nodes.length)
  el.hidden = has
  document.body.classList.toggle('canvas-empty', !has)
}

CC.updateToggles = function () {
  const d = D()
  if (!d) return
  const g = document.getElementById('tGrid'), s = document.getElementById('tSnap')
  if (g) g.classList.toggle('on', d.settings.grid !== false)
  if (s) s.classList.toggle('on', d.settings.snap !== false)
  stage.classList.toggle('no-grid', d.settings.grid === false)
}
