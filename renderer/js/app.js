'use strict';
/* IdeaCanvas · 界面、导入导出、检查器、设置、快捷键 */
(function () {
  const ST = CC.state
  const Doc = CC.Doc
  const U = CC.U
  const $ = s => document.querySelector(s)
  const stageEl = document.getElementById('stage')

  const root = document.getElementById('modal-root')

  /* ---------------- 模态框 ---------------- */
  function showModal (opts) {
    const { title = '', body = '', foot = [], small = false, onMount, onClose } = opts
    root.hidden = false
    root.innerHTML = '<div class="modal' + (small ? ' small' : '') + '">' +
      '<div class="modal-head"><div class="modal-title">' + U.esc(title) + '</div><button class="modal-close" title="关闭">✕</button></div>' +
      '<div class="modal-body">' + body + '</div>' +
      (foot.length ? '<div class="modal-foot">' + foot.map(b => '<button class="btn ' + (b.cls || '') + '" data-mk="' + U.esc(b.key) + '">' + U.esc(b.label) + '</button>').join('') + '</div>' : '') +
      '</div>'
    const modal = root.firstElementChild
    modal.querySelector('.modal-close').addEventListener('click', closeModal)
    foot.forEach(b => {
      const btn = modal.querySelector('[data-mk="' + b.key + '"]')
      if (btn) btn.addEventListener('click', () => { if (b.onClick) b.onClick(modal) })
    })
    root.onclick = e => { if (e.target === root) closeModal() }
    root._onClose = onClose || null
    if (onMount) onMount(modal)
    return modal
  }
  function closeModal () {
    const onClose = root._onClose
    root._onClose = null
    root.hidden = true
    root.innerHTML = ''
    if (onClose) { try { onClose() } catch (_) {} }
  }
  CC.showModal = showModal
  CC.closeModal = closeModal

  /* ---------------- 顶部画布标签 ---------------- */
  const tabsEl = document.getElementById('tabs')
  const T = { list: [], active: 0 }

  function tabSnapshot () {
    const t = T.list[T.active]
    if (!t || !ST.doc) return
    t.doc = ST.doc
    t.view = { x: ST.view.x, y: ST.view.y, s: ST.view.s }
    t.dirty = ST.dirty
  }

  function anyDirty () { return T.list.some(t => t && t.dirty) }

  function renderTabs () {
    if (!tabsEl) return
    tabsEl.innerHTML = T.list.map((t, i) =>
      '<div class="tab' + (i === T.active ? ' on' : '') + '" data-tab="' + i + '" title="' + U.esc(t.doc.path || '尚未保存') + '">' +
      '<span class="tab-name">' + U.esc(t.doc.name || '未命名画布') + '</span>' +
      (t.dirty ? '<span class="tab-dot" title="未保存"></span>' : '') +
      (T.list.length > 1 ? '<button class="tab-x" data-tabclose="' + i + '" title="关闭这个画布">✕</button>' : '') +
      '</div>').join('')
  }

  function loadTab (i) {
    const t = T.list[i]
    if (!t) return
    T.active = i
    ST.doc = t.doc
    ST.view = t.view || { x: 60, y: 40, s: 1 }
    ST.history.length = 0
    ST.future.length = 0
    ST.selection.clear()
    ST.selectedEdge = null
    const ins = document.getElementById('inspector')
    if (ins) ins.hidden = true
    document.body.classList.remove('ins-open')
    CC.applyTransform()
    CC.renderNodes()
    CC.renderEdges()
    CC.renderMinimap()
    CC.updateEmpty()
    CC.updateToggles()
    ST.dirty = !!t.dirty
    const dot = document.getElementById('dirtyDot')
    if (dot) dot.hidden = !ST.dirty
    CC.title()
    renderTabs()
    const meta = document.getElementById('docMeta')
    if (meta) meta.textContent = t.doc.path || '未保存'
    window.cc.setDirty(anyDirty())
  }

  function addTab (doc, view, activate) {
    tabSnapshot()
    T.list.push({ doc, view: view || { x: 60, y: 40, s: 1 }, dirty: false })
    const i = T.list.length - 1
    if (activate === false) { renderTabs(); return i }
    loadTab(i)
    return i
  }

  function currentIsBlank () {
    return !!(ST.doc && !ST.doc.path && !ST.doc.nodes.length && !ST.dirty)
  }

  function dropTab (i) {
    const wasActive = i === T.active
    T.list.splice(i, 1)
    if (!T.list.length) {
      const d = CC.blankDoc()
      T.list.push({ doc: d, view: { x: 60, y: 40, s: 1 }, dirty: false })
      loadTab(0)
      return
    }
    if (i < T.active) T.active--
    else if (wasActive) T.active = Math.min(i, T.list.length - 1)
    loadTab(T.active)
  }

  function closeTab (i) {
    if (i === T.active) tabSnapshot()
    const t = T.list[i]
    if (!t) return
    if (!t.dirty) { dropTab(i); return }
    const name = t.doc.name || '未命名画布'
    showModal({
      title: '关闭画布',
      small: true,
      body: '<div style="font-size:12.5px;color:#a3a8ba;line-height:1.6">「' + U.esc(name) + '」有未保存的修改。</div>',
      foot: [
        { label: '取消', key: 'c', onClick: closeModal },
        { label: '不保存', key: 'd', onClick: () => { closeModal(); t.dirty = false; dropTab(i) } },
        { label: '保存并关闭', key: 's', cls: 'pri', onClick: async () => {
          closeModal()
          if (i !== T.active) { tabSnapshot(); loadTab(i) }
          const ok = await doSave(false)
          if (ok) { const cur = T.list.indexOf(t); if (cur >= 0) dropTab(cur) }
        } }
      ]
    })
  }

  CC.tabs = {
    list: T.list,
    get active () { return T.active },
    render: renderTabs,
    load: loadTab,
    snapshot: tabSnapshot,
    add: addTab,
    close: closeTab,
    blank: currentIsBlank
  }

  CC.onDirtyChange = function (v) {
    const t = T.list[T.active]
    if (t) { t.dirty = !!v; renderTabs() }
    window.cc.setDirty(anyDirty())
  }

  if (tabsEl) {
    tabsEl.addEventListener('click', e => {
      const x = e.target.closest('[data-tabclose]')
      if (x) { closeTab(Number(x.dataset.tabclose)); return }
      const el = e.target.closest('[data-tab]')
      if (!el) return
      const i = Number(el.dataset.tab)
      if (i === T.active) return
      tabSnapshot()
      loadTab(i)
    })
  }
  const btnNewTab = document.getElementById('btnNewTab')
  if (btnNewTab) btnNewTab.addEventListener('click', () => {
    const d = CC.blankDoc()
    addTab(d, { x: 60, y: 40, s: 1 }, true)
    CC.toast('已新建空白画布')
  })

  /* 双击上方导航栏，命名当前画布 */
  function renameActive () {
    if (!ST.doc) return
    const old = ST.doc.name || '未命名画布'
    const modal = showModal({
      title: '命名画布',
      small: true,
      body: '<div class="field"><label>画布名称</label><input id="canvasName" type="text" maxlength="80" value="' + U.esc(old) + '" placeholder="给这张思路画布起个名字"></div>',
      foot: [
        { label: '取消', key: 'cancel', onClick: closeModal },
        { label: '确定', key: 'ok', cls: 'pri', onClick: apply }
      ]
    })
    const input = modal.querySelector('#canvasName')
    function apply () {
      const name = input.value.trim() || '未命名画布'
      ST.doc.name = name
      const t = T.list[T.active]
      if (t) t.doc = ST.doc
      CC.touch(true)
      renderTabs()
      CC.title()
      closeModal()
      CC.toast('画布已命名为「' + name + '」', 'ok')
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); apply() }
    })
    setTimeout(() => { input.focus(); input.select() }, 30)
  }
  CC.renameCanvas = renameActive
  const tabbarEl = document.getElementById('tabbar')
  if (tabbarEl) {
    tabbarEl.addEventListener('dblclick', e => {
      if (e.target.closest('button')) return
      renameActive()
    })
  }
  const docHeadEl = document.querySelector('#topbar .doc')
  if (docHeadEl) {
    docHeadEl.title = '双击可命名画布'
    docHeadEl.addEventListener('dblclick', renameActive)
  }

  /* 无边框窗口按钮 */
  document.querySelectorAll('[data-win]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.win
      if (k === 'min') window.cc.winMinimize()
      else if (k === 'max') window.cc.winMaxToggle()
      else if (k === 'close') window.cc.winClose()
    })
  })
  window.cc.onWinState(s => {
    const el = document.getElementById('winMax')
    if (el) el.classList.toggle('fs', !!(s && s.fullscreen))
  })

  /* ---------------- 导入 ---------------- */
  function nextFreeBase (at) {
    if (at) return at
    return {
      x: Math.round((-ST.view.x + 120) / ST.view.s / 8) * 8,
      y: Math.round((-ST.view.y + 120) / ST.view.s / 8) * 8
    }
  }

  async function addFilesAt (paths, at, silent) {
    if (!paths || !paths.length) return []
    const descs = await window.cc.describe(paths)
    const valid = descs.filter(d => d && d.exists !== false)
    const missing = descs.filter(d => d && d.exists === false)
    if (!valid.length && !missing.length) return []
    Doc.checkpoint()
    // 同一文件允许重复导入：每多一张同路径卡片，就向右下错开一点，避免完全叠住
    const dupCount = new Map()
    ST.doc.nodes.filter(n => n.type === 'file').forEach(n => dupCount.set(n.path, (dupCount.get(n.path) || 0) + 1))
    const allRight = ST.doc.nodes.reduce((m, n) => Math.max(m, n.x + n.w), -Infinity)
    const fallback = {
      x: Math.round((isFinite(allRight) ? allRight + 40 : (-ST.view.x + 120) / ST.view.s) / 8) * 8,
      y: Math.round(((-ST.view.y + 120) / ST.view.s) / 8) * 8
    }
    const base = at ? { x: Math.round(at.x / 8) * 8, y: Math.round(at.y / 8) * 8 } : fallback
    const COLS = 3
    const W = 252, GAPX = 34, GAPY = 36
    const added = []
    const batch = []
    const colY = [0, 0, 0]
    descs.forEach((d, i) => {
      if (!d) return
      const dup = dupCount.get(d.path) || 0
      dupCount.set(d.path, dup + 1)
      const col = i % COLS
      const ox = dup ? (dup % 6) * 26 : 0
      const oy = dup ? (dup % 6) * 26 : 0
      const n = CC.fileNode(d, base.x + col * (W + GAPX) + ox, base.y + colY[col] + oy)
      colY[col] += n.h + GAPY
      batch.push(n)
      added.push(n)
    })
    Doc.addNodes(batch)
    Doc.select(added.map(n => n.id))
    CC.touch(true)
    if (!silent) CC.toast('已加入 ' + added.length + ' 张文件卡片' + (missing.length ? '，' + missing.length + ' 个路径不存在' : ''), 'ok')
    return added
  }
  CC.addFilesAt = addFilesAt

  async function importFiles () {
    if (CC.isWorkMode && CC.isWorkMode()) { CC.toast('工作模式下不导入文件，双击空白返回梳理模式'); return }
    const paths = await window.cc.pickFiles()
    if (!paths || !paths.length) return
    await addFilesAt(paths)
  }

  async function importFolder () {
    if (CC.isWorkMode && CC.isWorkMode()) { CC.toast('工作模式下不导入文件，双击空白返回梳理模式'); return }
    const r = await window.cc.pickFolder()
    if (!r || !r.files || !r.files.length) { if (r && r.dir) CC.toast('该文件夹里没有找到可用的工程文件'); return }
    if (r.files.length > 260) CC.toast('文件夹较大，仅导入前 260 个文件')
    await addFilesAt(r.files.slice(0, 260))
  }

  /* 拖拽导入 */
  stageEl.addEventListener('dragover', e => {
    e.preventDefault()
    e.dataTransfer.dropEffect = (CC.isWorkMode && CC.isWorkMode()) ? 'none' : 'copy'
  })
  stageEl.addEventListener('drop', async e => {
    e.preventDefault()
    e.stopPropagation()
    if (!ST.doc) return
    if (CC.isWorkMode && CC.isWorkMode()) {
      CC.toast('工作模式只负责把卡片拖出去；双击空白返回梳理模式后再导入', 'err')
      return
    }
    let paths = []
    try {
      paths = [...(e.dataTransfer.files || [])].map(f => window.cc.getFilePath(f)).filter(Boolean)
    } catch (_) {}
    if (!paths.length) {
      try {
        const uri = e.dataTransfer.getData('text/uri-list') || ''
        paths = uri.split(/\r?\n/).map(s => s.trim()).filter(s => s.startsWith('file:'))
          .map(s => { try { return decodeURIComponent(new URL(s).pathname).replace(/^\//, '').replace(/\//g, '\\') } catch (_) { return '' } })
          .filter(Boolean)
      } catch (_) {}
    }
    if (!paths.length) {
      CC.toast('没拿到文件路径：请用顶部「导入文件 / 导入文件夹」，或从资源管理器直接拖拽文件', 'err')
      return
    }
    const r = stageEl.getBoundingClientRect()
    const p = CC.s2w(e.clientX - r.left, e.clientY - r.top)
    const dirs = []
    for (const path of paths) {
      const info = await window.cc.isDir(path)
      if (info) dirs.push(path)
    }
    if (dirs.length) {
      for (const dir of dirs) {
        const scan = await window.cc.scanFolder(dir)
        if (scan && scan.files) paths = paths.filter(x => x !== dir).concat(scan.files.slice(0, 260))
      }
    }
    await addFilesAt(paths, p)
  })

  /* ---------------- 检查器 ---------------- */
  function fileInspector (n) {
    const color = CC.KIND_COLORS[n.kind] || '#8b93a8'
    return '<div class="field"><label>文件名</label><div class="val" style="font-weight:600">' + U.esc(n.name) + '</div></div>' +
      '<div class="field"><label>类型</label><div class="val"><span class="chip" style="color:' + color + '">' + U.esc((n.ext || '').toUpperCase()) + ' · ' + U.esc({ doc: '文档', sheet: '表格', slide: '演示', pdf: 'PDF', cad: '图纸', fem: '工程文件', image: '图片', text: '文本', model: '三维模型', other: '其他' }[n.kind] || '文件') + '</span></div></div>' +
      '<div class="field"><label>路径</label><div class="val" style="font-size:11px;color:#8b90a3;line-height:1.5">' + U.esc(n.path) + '</div></div>' +
      '<div class="field"><label>大小与时间</label><div class="val" style="font-size:11.5px;color:#a3a8ba">' + U.fmtSize(n.size) + (n.pages ? ' · ' + n.pages + ' 页' : '') + (n.dims ? ' · ' + n.dims : '') + ' · ' + new Date(n.mtime || 0).toLocaleString('zh-CN') + '</div></div>' +
      '<div class="ins-actions">' +
      '<button class="act pri" data-insact="open">打开文件</button>' +
      '<button class="act" data-insact="reveal">定位到文件夹</button>' +
      '<button class="act" data-insact="copy">复制路径</button>' +
      '<button class="act" data-insact="refresh">刷新摘要</button>' +
      '<button class="act danger" data-insact="delete">删除卡片</button>' +
      '</div>' +
      '<div class="ins-section">内容摘要</div><div class="ins-text">' + (U.esc(n.snippet) || '<span style="color:#5f667a">暂无文本摘要</span>') + '</div>'
  }

  function noteInspector (n) {
    return '<div class="field"><label>便签内容</label><textarea data-insfield="text" style="min-height:160px">' + U.esc(n.text || '') + '</textarea></div>' +
      '<div class="field"><label>TXT 文件</label><div class="val" style="font-size:11px;color:' + (n.filePath ? '#a3a8ba' : '#71778c') + ';line-height:1.5;word-break:break-all">' + U.esc(n.filePath || '尚未保存，点下方「保存为 TXT」') + '</div></div>' +
      '<div class="ins-actions"><button class="act pri" data-insact="save-note">保存为 TXT</button>' +
      (n.filePath ? '<button class="act" data-insact="open-note">打开 TXT</button><button class="act" data-insact="reveal-note">所在目录</button>' : '') +
      '<button class="act danger" data-insact="delete">删除便签</button></div>' +
      '<div class="ins-section">提示</div><div class="ins-text" style="font-size:11.5px">保存目录在「设置 → 便签保存位置」里指定；不指定时默认放在程序目录的 data\\便签。</div>'
  }

  CC.renderInspector = function () {
    const ins = document.getElementById('inspector')
    const body = document.getElementById('insBody')
    const title = document.getElementById('insTitle')
    if (!ins || !ST.doc) return
    const sel = [...ST.selection]
    if (!sel.length) { ins.hidden = true; document.body.classList.remove('ins-open'); return }
    ins.hidden = false
    document.body.classList.add('ins-open')
    if (sel.length > 1) {
      title.textContent = '已选 ' + sel.length + ' 张卡片'
      const nodes = sel.map(id => Doc.node(id)).filter(Boolean)
      body.innerHTML = '<div class="ins-section">选择内容</div><div class="chip-list">' +
        nodes.map(n => '<div class="chip">' + U.esc(n.name || n.title || '便签') + '</div>').join('') + '</div>' +
        '<div class="ins-actions"><button class="act" data-insact="align">整理选中的卡片</button>' +
        '<button class="act danger" data-insact="delete">删除</button></div>' +
        '<div class="ins-section">提示</div><div class="ins-text">拖动卡片可调整位置；选中多张后可用「整理」按连线关系排布，或按 Delete 删除。</div>'
      return
    }
    const n = Doc.node(sel[0])
    if (!n) { ins.hidden = true; document.body.classList.remove('ins-open'); return }
    if (n.type === 'file') { title.textContent = '文件卡片'; body.innerHTML = fileInspector(n) }
    else { title.textContent = '便签'; body.innerHTML = noteInspector(n) }
  }

  /* 检查器事件 */
  document.getElementById('insBody').addEventListener('change', e => {
    const rel = e.target.closest('[data-rel]')
    if (!rel) return
    const edge = Doc.edge(rel.dataset.rel)
    if (!edge || !CC.REL[rel.value]) return
    Doc.checkpoint()
    edge.kind = rel.value
    CC.renderEdgesNow(); CC.touch(true); CC.renderInspector()
    CC.toast('连线关系改为「' + CC.REL[rel.value].label + '」', 'ok')
  })
  document.getElementById('insBody').addEventListener('click', async e => {
    const dropwin = e.target.closest('[data-dropwin]')
    if (dropwin) {
      const srcId = dropwin.dataset.dropwin
      const node = Doc.node([...ST.selection][0])
      const edge = ST.doc.edges.find(x => x.from === srcId && node && x.to === node.id)
      if (edge) { Doc.checkpoint(); Doc.disconnect(edge.id); CC.touch(true); CC.renderInspector() }
      return
    }
    const sel = [...ST.selection]
    const n = sel.length === 1 ? Doc.node(sel[0]) : null
    const act = e.target.closest('[data-insact]')
    if (!act) return
    const cmd = act.dataset.insact
    if (cmd === 'delete') { Doc.checkpoint(); Doc.removeNodes(sel); CC.touch(true); CC.renderInspector(); return }
    if (cmd === 'align') { return }
    if (!n) return
    if (cmd === 'open') { CC.openFile(n.path) }
    else if (cmd === 'reveal') { window.cc.reveal(n.path) }
    else if (cmd === 'copy') { window.cc.copyText(n.path); CC.toast('路径已复制', 'ok') }
    else if (cmd === 'refresh') {
      const desc = (await window.cc.describe([n.path]))[0]
      if (desc) {
        n.name = desc.name; n.ext = desc.ext; n.kind = desc.kind
        n.size = desc.size; n.mtime = desc.mtime; n.exists = desc.exists !== false
        n.icon = desc.icon || ''; n.snippet = desc.snippet || ''
        n.pages = desc.pages || 0; n.dims = desc.dims || ''
        if (desc.thumb) n.thumb = U.fileUrl(desc.thumb)
        CC.renderNode(n.id)
        CC.touch(true)
        CC.toast('已刷新：' + desc.name, 'ok')
      }
    }
    else if (cmd === 'save-note') { CC.saveNote(n.id) }
    else if (cmd === 'open-note' && n.filePath) { CC.openFile(n.filePath) }
    else if (cmd === 'reveal-note' && n.filePath) { window.cc.openFolder(n.filePath.replace(/[\\/][^\\/]*$/, '')) }
  })

  document.getElementById('insBody').addEventListener('input', e => {
    const field = e.target.dataset.insfield
    if (!field) return
    const sel = [...ST.selection]
    const n = sel.length === 1 ? Doc.node(sel[0]) : null
    if (!n) return
    if (field === 'text') {
      n.text = e.target.value
      const el = document.querySelector('#nodes [data-id="' + n.id + '"] .node-text')
      if (el) el.textContent = n.text || '双击编辑便签内容'
    } else {
      return
    }
    CC.setDirty(true)
    CC.touch(false)
  })

  document.getElementById('insClose').addEventListener('click', () => {
    document.getElementById('inspector').hidden = true
    document.body.classList.remove('ins-open')
    Doc.clearSelection()
  })

  /* ---------------- 便签编辑 ---------------- */
  CC.editNote = function (id) {
    const n = Doc.node(id)
    if (!n) return
    const snap = CC.snapshot()
    const modal = showModal({
      title: '便签',
      small: true,
      body: '<div class="field"><textarea id="noteEditor" style="min-height:190px;font-size:13px">' + U.esc(n.text || '') + '</textarea></div>',
      foot: [{ label: '完成', key: 'ok', cls: 'pri', onClick: () => finish() }]
    })
    const ta = modal.querySelector('#noteEditor')
    ta.focus()
    ta.addEventListener('input', () => {
      n.text = ta.value
      const el = document.querySelector('#nodes [data-id="' + id + '"] .node-text')
      if (el) el.textContent = n.text || '双击编辑便签内容'
      const ins = document.querySelector('[data-insfield="text"]')
      if (ins) ins.value = n.text
    })
    function finish () {
      if (CC.snapshot() !== snap) { ST.history.push(snap); ST.future.length = 0; CC.touch(true) }
      closeModal()
      CC.renderInspector()
      if (CC.autoSaveNote(n.id)) CC.saveNote(n.id, { silent: true })
    }
    modal.querySelector('.modal-close').addEventListener('click', () => {
      if (CC.snapshot() !== snap) { ST.history.push(snap); ST.future.length = 0; CC.touch(true) }
      if (CC.autoSaveNote(n.id)) CC.saveNote(n.id, { silent: true })
    })
  }

  CC.autoSaveNote = function (id) {
    const g = (ST.settings && ST.settings.general) || {}
    const n = Doc.node(id)
    return !!(n && n.type === 'note' && g.autoSaveNote !== false)
  }

  CC.saveNote = async function (id, opts) {
    opts = opts || {}
    const n = Doc.node(id)
    if (!n || n.type !== 'note') return null
    const first = String(n.text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)[0] || '便签'
    const r = await window.cc.noteWrite({ path: n.filePath || '', name: first.slice(0, 30), content: n.text || '' })
    if (!r || !r.ok) {
      if (!opts.silent) CC.toast('保存 TXT 失败：' + ((r && r.error) || '未知原因'), 'err')
      return null
    }
    const had = n.filePath
    n.filePath = r.path
    CC.setDirty(true)
    CC.touch(false)
    CC.renderNode(n.id)
    if (CC.renderInspector) CC.renderInspector()
    if (!opts.silent) CC.toast('已保存：' + r.name, 'ok')
    return r
  }

  /* ---------------- 文件打开 / 预览 ---------------- */
  CC.openFile = async function (p) {
    if (!p) return
    const r = await window.cc.openFile(p)
    if (!r || !r.ok) {
      CC.toast('打开失败：' + ((r && r.error) || '系统里没有能打开这种文件的程序'), 'err')
      return
    }
    CC.toast('已交给系统程序打开：' + String(p).split(/[\\/]/).pop())
  }

  CC.openPreview = async function (n) {
    if (!n || n.type !== 'file') return
    const isImg = n.kind === 'image'
    const body = isImg
      ? '<div class="prev-wrap"><img src="' + (n.thumb || U.fileUrl(n.path)) + '" alt=""></div>'
      : '<div class="prev-text" id="prevText">正在读取…</div>'
    const modal = showModal({
      title: n.name,
      body,
      foot: [
        { label: '在文件夹中显示', key: 'reveal', onClick: () => window.cc.reveal(n.path) },
        { label: '用系统程序打开', key: 'open', cls: 'pri', onClick: () => CC.openFile(n.path) }
      ]
    })
    if (!isImg) {
      const holder = modal.querySelector('#prevText')
      const r = await window.cc.extract(n.path, 6000)
      holder.textContent = (r.ok && r.text) ? r.text : ('（该类型暂不支持文本预览，' + (r.error || '可直接用系统程序打开') + '）')
    }
  }

  /* ---------------- 设置 ---------------- */
  CC.openSettings = function () {
    const g = (ST.settings && ST.settings.general) || {}
    const body = '<div class="ins-section" style="margin-top:2px">便签保存位置</div>' +
      '<div class="set-row"><label>保存目录</label><div class="keyline"><input id="setNoteDir" type="text" value="' + U.esc(g.noteDir || '') + '" placeholder="留空则使用程序目录的 data\\便签"><button class="btn" id="btnPickNoteDir">选择目录</button></div></div>' +
      '<div class="set-hint" style="margin-left:0">便签点「存 TXT」时写入这里；留空时写入程序目录下的 data\\便签。已经存过的便签继续写回原文件。</div>' +
      '<div class="set-row"><label>自动保存</label><div class="keyline"><input id="setAutoNote" type="checkbox"' + (g.autoSaveNote === false ? '' : ' checked') + '><span style="font-size:11.5px;color:#8b90a3">新建便签时自动生成 TXT，编辑后自动更新</span></div></div>' +
      '<div class="ins-actions"><button class="btn" id="btnOpenNoteDir">打开便签目录</button><span id="noteDirMsg" style="font-size:11.5px;color:#8b90a3;align-self:center"></span></div>' +
      '<div class="ins-section" style="margin-top:22px">画布与文件</div>' +
      '<div class="set-row"><label>.cvproj 关联</label><div class="keyline"><span style="font-size:11.5px;color:#8b90a3">双击画布文件时用本程序打开，并显示专用画布图标</span><button class="btn" id="btnAssoc">注册关联与图标</button></div></div>' +
      '<div class="set-hint" style="margin-left:0">画布文件只记录卡片位置、连线与便签，不包含文件内容本身。若资源管理器仍显示旧图标，重开一次窗口或重启资源管理器即可。</div>'
    const modal = showModal({
      title: '设置',
      body,
      foot: [
        { label: '关闭', key: 'close', onClick: () => closeModal() },
        { label: '保存设置', key: 'save', cls: 'pri', onClick: () => saveSettings() }
      ]
    })

    async function defaultDir () {
      try { return (await window.cc.noteDefaultDir()).dir } catch (_) { return '' }
    }
    defaultDir().then(d => {
      const el = modal.querySelector('#setNoteDir')
      if (el && d && !el.value) el.placeholder = '默认：' + d
    })

    modal.querySelector('#btnPickNoteDir').addEventListener('click', async () => {
      const r = await window.cc.notePickDir()
      if (r && r.ok && r.dir) modal.querySelector('#setNoteDir').value = r.dir
    })

    modal.querySelector('#btnOpenNoteDir').addEventListener('click', async () => {
      let dir = modal.querySelector('#setNoteDir').value.trim()
      if (!dir) dir = await defaultDir()
      if (!dir) { CC.toast('还没有可打开的目录', 'err'); return }
      await window.cc.openFolder(dir)
    })

    modal.querySelector('#btnAssoc').addEventListener('click', async () => {
      const r = await window.cc.assocRegister()
      CC.toast(r && r.ok ? '已注册 .cvproj 关联与文件图标' : ('注册失败：' + ((r && r.error) || '未知原因')), r && r.ok ? 'ok' : 'err')
    })

    async function saveSettings () {
      const general = {
        noteDir: modal.querySelector('#setNoteDir').value.trim(),
        autoSaveNote: modal.querySelector('#setAutoNote').checked
      }
      const r = await window.cc.settingsSet({ general })
      ST.settings = r
      CC.toast('设置已保存', 'ok')
      closeModal()
    }
    void saveSettings
  }

  /* ---------------- 搜索 ---------------- */
  function openSearch () {
    const nodes = ST.doc.nodes
    const modal = showModal({
      title: '查找卡片',
      body: '<div class="searchbox"><input id="q" type="text" placeholder="输入文件名 / 便签文字"></div><div class="search-list" id="sl"></div>'
    })
    const q = modal.querySelector('#q')
    const list = modal.querySelector('#sl')
    function fill (kw) {
      const items = nodes.filter(n => {
        if (!kw) return true
        const hay = (n.name || '') + ' ' + (n.title || '') + ' ' + (n.text || '') + ' ' + (n.snippet || '') + ' ' + (n.path || '')
        return hay.toLowerCase().includes(kw.toLowerCase())
      })
      list.innerHTML = items.length ? items.map(n => '<div class="search-item" data-id="' + n.id + '"><span class="si-name">' + U.esc(n.name || n.title || '便签') + '</span><span class="si-kind">' + U.esc((n.type === 'file' ? (n.ext || '').toUpperCase() : '便签')) + '</span></div>').join('') : '<div style="padding:14px;color:#71778c;font-size:12px">没有匹配的卡片</div>'
    }
    fill('')
    q.addEventListener('input', () => fill(q.value.trim()))
    list.addEventListener('click', e => {
      const it = e.target.closest('.search-item')
      if (!it) return
      Doc.select(it.dataset.id)
      CC.centerOn(Doc.node(it.dataset.id))
      closeModal()
    })
    setTimeout(() => q.focus(), 30)
  }

  /* ---------------- 右键菜单 ---------------- */
  const ctx = document.getElementById('contextmenu')
  function hideContext () { ctx.hidden = true }
  CC.hideContext = hideContext
  window.addEventListener('pointerdown', e => { if (!ctx.contains(e.target)) hideContext() }, true)

  function showMenu (x, y, items) {
    ctx.innerHTML = items.map(i => i === '-' ? '<hr>' : '<button data-cmd="' + i.cmd + '" class="' + (i.danger ? 'danger' : '') + '">' + U.esc(i.label) + '</button>').join('')
    ctx.hidden = false
    const w = 200, h = items.length * 32 + 12
    ctx.style.left = Math.min(x, window.innerWidth - w) + 'px'
    ctx.style.top = Math.min(y, window.innerHeight - h) + 'px'
    ctx.onclick = e => {
      const b = e.target.closest('[data-cmd]')
      if (!b) return
      const cmd = b.dataset.cmd
      hideContext()
      handleMenu(cmd)
    }
    ctx._items = items
  }

  let menuNodeId = null
  let menuEdgeId = null
  function handleMenu (cmd) {
    const n = menuNodeId ? Doc.node(menuNodeId) : null
    if (cmd.indexOf('edge-kind:') === 0) {
      const kind = cmd.slice(10)
      const e = Doc.edge(menuEdgeId)
      if (e && CC.REL[kind]) {
        Doc.checkpoint()
        e.kind = kind
        CC.renderEdgesNow(); CC.touch(true)
        CC.toast('已改为「' + CC.REL[kind].label + '」关系', 'ok')
      }
      return
    }
    if (cmd === 'open') CC.openFile(n.path)
    else if (cmd === 'preview') CC.openPreview(n)
    else if (cmd === 'reveal') window.cc.reveal(n.path)
    else if (cmd === 'copy') { window.cc.copyText(n.path); CC.toast('路径已复制', 'ok') }
    else if (cmd === 'save-note') CC.saveNote(n.id)
    else if (cmd === 'unlink') {
      Doc.checkpoint()
      ST.doc.edges = ST.doc.edges.filter(e => e.from !== n.id && e.to !== n.id)
      CC.renderEdges(); CC.touch(true)
    } else if (cmd === 'edit-note') CC.editNote(n.id)
    else if (cmd === 'delete') { Doc.checkpoint(); Doc.removeNodes([n.id]); CC.touch(true) }
    else if (cmd === 'delete-edge') { Doc.checkpoint(); Doc.disconnect(menuEdgeId); CC.touch(true) }
    else if (cmd === 'new-note') {
      const p = CC.s2w(menuAt.x, menuAt.y)
      Doc.checkpoint()
      const nn = CC.noteNode(Math.round(p.x / 8) * 8, Math.round(p.y / 8) * 8)
      Doc.addNode(nn); Doc.select(nn.id); CC.touch(true)
      if (CC.autoSaveNote(nn.id)) CC.saveNote(nn.id, { silent: true })
    } else if (cmd === 'tidy') tidyLayout()
    else if (cmd === 'fit') CC.fitView()
    else if (cmd === 'export') exportPng()
    else if (cmd === 'search') openSearch()
    else if (cmd === 'import') importFiles()
  }

  let menuAt = { x: 0, y: 0 }
  CC.showNodeMenu = function (id, x, y) {
    menuNodeId = id; menuEdgeId = null
    const n = Doc.node(id)
    if (!n) return
    const items = n.type === 'file'
      ? [{ cmd: 'open', label: '用系统程序打开' }, { cmd: 'preview', label: '在工作台预览' }, { cmd: 'reveal', label: '在文件夹中显示' }, { cmd: 'copy', label: '复制文件路径' }, '-',
        { cmd: 'unlink', label: '断开所有连线' }, '-', { cmd: 'delete', label: '删除卡片', danger: true }]
      : [{ cmd: 'edit-note', label: '编辑便签' }, { cmd: 'save-note', label: '保存为 TXT' }, { cmd: 'unlink', label: '断开所有连线' }, '-', { cmd: 'delete', label: '删除便签', danger: true }]
    showMenu(x, y, items)
  }
  CC.showEdgeMenu = function (id, x, y) {
    menuEdgeId = id; menuNodeId = null
    const e = Doc.edge(id)
    const cur = e ? (e.kind || 'flow') : 'flow'
    const items = CC.REL_KEYS.map(k => ({ cmd: 'edge-kind:' + k, label: (k === cur ? '✓ ' : '') + CC.REL[k].label + '：' + CC.REL[k].hint }))
    showMenu(x, y, items.concat(['-', { cmd: 'delete-edge', label: '删除这条连线', danger: true }]))
  }
  CC.showCanvasMenu = function (x, y) {
    menuNodeId = null; menuEdgeId = null
    const r = stageEl.getBoundingClientRect()
    menuAt = { x: x - r.left, y: y - r.top }
    showMenu(x, y, [{ cmd: 'new-note', label: '在此新建便签' }, { cmd: 'import', label: '导入文件' }, { cmd: 'search', label: '查找卡片' }, '-', { cmd: 'tidy', label: '整理布局' }, { cmd: 'fit', label: '适应视图' }, { cmd: 'export', label: '导出 PNG' }])
  }

  /* ---------------- 右键：延时菜单 / 双击选起点 / 单击目标连线 ---------------- */
  let rightTapLast = null
  let rightMenuTimer = null
  let connectTimer = null
  let relPickerEl = null
  let relPickerOff = null

  function clearRightMenuTimer () {
    if (rightMenuTimer) { clearTimeout(rightMenuTimer); rightMenuTimer = null }
  }

  function closeRelPicker () {
    if (relPickerEl) {
      const el = relPickerEl
      relPickerEl = null
      el.classList.add('is-closing')
      setTimeout(() => el.remove(), 90)
    }
    if (relPickerOff) {
      document.removeEventListener('pointerdown', relPickerOff, true)
      relPickerOff = null
    }
  }
  CC.closeRelPicker = closeRelPicker

  CC.clearConnectSource = function (silent) {
    closeRelPicker()
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null }
    const src = ST.connectSource
    ST.connectSource = null
    if (src) {
      const el = document.querySelector('#nodes [data-id="' + src + '"]')
      if (el) el.classList.remove('connect-source')
      if (!silent) CC.toast('已取消连线起点')
    }
  }

  function setConnectSource (id) {
    CC.clearConnectSource(true)
    const n = Doc.node(id)
    if (!n) return
    ST.connectSource = id
    Doc.select(id)
    const el = document.querySelector('#nodes [data-id="' + id + '"]')
    if (el) el.classList.add('connect-source')
    CC.toast('已选中「' + (n.name || n.title || '卡片') + '」为起点，再右键另一张卡片并选择关系', 'ok')
    connectTimer = setTimeout(() => CC.clearConnectSource(true), 12000)
  }

  function chooseRelation (fromId, toId, x, y) {
    const a = Doc.node(fromId), b = Doc.node(toId)
    if (!a || !b) { CC.clearConnectSource(true); return }
    closeRelPicker()
    const panel = document.createElement('div')
    panel.className = 'rel-pop'
    panel.setAttribute('role', 'menu')
    panel.innerHTML =
      '<div class="rel-pop-head"><b>选择关系</b><span>' + U.esc(a.name || a.title || '卡片') + '<i>→</i>' + U.esc(b.name || b.title || '卡片') + '</span></div>' +
      '<div class="rel-pop-list">' + CC.REL_KEYS.map(k => '<button class="rel-pop-item" role="menuitem" data-relkind="' + k + '" style="--rel:' + CC.REL[k].color + '"><i class="rel-dot"></i><div><b>' + U.esc(CC.REL[k].label) + '</b><span>' + U.esc(CC.REL[k].hint) + '</span></div></button>').join('') + '</div>'
    document.body.appendChild(panel)
    relPickerEl = panel

    // 默认落在鼠标右下方，贴着边缘时自动翻到左/上方
    const gap = 8, edge = 10
    const w = panel.offsetWidth, h = panel.offsetHeight
    let left = (x || 0) + gap
    let top = (y || 0) + gap
    if (left + w > window.innerWidth - edge) left = Math.max(edge, (x || 0) - w - gap)
    if (top + h > window.innerHeight - edge) top = Math.max(edge, (y || 0) - h - gap)
    left = Math.min(left, window.innerWidth - w - edge)
    top = Math.min(top, window.innerHeight - h - edge)
    panel.style.left = left + 'px'
    panel.style.top = top + 'px'

    relPickerOff = ev => {
      if (!panel.contains(ev.target)) {
        closeRelPicker()
        CC.clearConnectSource(true)
      }
    }
    document.addEventListener('pointerdown', relPickerOff, true)
    panel.addEventListener('contextmenu', ev => ev.preventDefault())

    panel.querySelectorAll('[data-relkind]').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.relkind
        if (ST.doc.edges.some(e => e.from === fromId && e.to === toId)) {
          CC.toast('这两张卡片已经有一条连线了', 'err')
          closeRelPicker()
          CC.clearConnectSource(true)
          return
        }
        closeRelPicker()
        Doc.checkpoint()
        const e = Doc.connect(fromId, toId, kind)
        if (e) {
          CC.touch(true)
          CC.renderEdgesNow()
          CC.toast('已建立「' + CC.REL[kind].label + '」关系', 'ok')
        }
        CC.clearConnectSource(true)
      })
    })
  }

  CC.rightCardTap = function (id, x, y) {
    const now = Date.now()
    if (ST.connectSource) {
      if (ST.connectSource === id) {
        CC.clearConnectSource()
        return
      }
      clearRightMenuTimer()
      chooseRelation(ST.connectSource, id, x, y)
      return
    }
    const prev = rightTapLast
    if (prev && prev.id === id && now - prev.t < 320) {
      clearRightMenuTimer()
      rightTapLast = null
      setConnectSource(id)
      return
    }
    clearRightMenuTimer()
    rightTapLast = { id, t: now }
    // 单次右键先等 260ms，避免和“右键双击”抢同一个动作
    rightMenuTimer = setTimeout(() => {
      rightMenuTimer = null
      rightTapLast = null
      CC.showNodeMenu(id, x, y)
    }, 260)
  }

  window.addEventListener('pointerdown', e => {
    if (e.button !== 2) clearRightMenuTimer()
  }, true)

  /* ---------------- 整理布局 ---------------- */
  /* 分层（按最长路径） + 同层按上游重心排序 + 每列垂直居中，尽量少交叉 */
  function tidyLayout () {
    const nodes = ST.doc.nodes
    if (!nodes.length) return
    const edges = ST.doc.edges
    // 先用 DFS 找出“回边”（会形成环的连线），分层时忽略它们，避免整列错位
    const outMap = new Map(nodes.map(n => [n.id, []]))
    edges.forEach(e => { if (outMap.has(e.from)) outMap.get(e.from).push(e.to) })
    const color = new Map()
    const back = new Set()
    const dfs = id => {
      color.set(id, 1)
      for (const to of (outMap.get(id) || [])) {
        if (!color.has(to)) dfs(to)
        else if (color.get(to) === 1) back.add(id + '>' + to)
      }
      color.set(id, 2)
    }
    nodes.forEach(n => { if (!color.has(n.id)) dfs(n.id) })
    const forward = edges.filter(e => !back.has(e.from + '>' + e.to))

    const depth = new Map(nodes.map(n => [n.id, 0]))
    for (let iter = 0; iter < nodes.length + 2; iter++) {
      let changed = false
      for (const e of forward) {
        const a = depth.get(e.from), b = depth.get(e.to)
        if (a != null && b != null && b < a + 1) { depth.set(e.to, a + 1); changed = true }
      }
      if (!changed) break
    }
    const layers = new Map()
    const originalY = new Map(nodes.map(n => [n.id, n.y]))
    nodes.forEach(n => {
      const d = depth.get(n.id) || 0
      if (!layers.has(d)) layers.set(d, [])
      layers.get(d).push(n)
    })
    const layerKeys = [...layers.keys()].sort((a, b) => a - b)
    layerKeys.forEach(k => layers.get(k).sort((a, b) => (originalY.get(a.id) - originalY.get(b.id)) || (a.x - b.x)))

    const GAPX = 120, GAPY = 34
    const posX = new Map()
    let x = 0
    layerKeys.forEach(k => {
      const list = layers.get(k)
      const maxW = list.reduce((m, n) => Math.max(m, n.w), 252)
      list.forEach(n => posX.set(n.id, x))
      x += maxW + GAPX
    })

    // 两轮重心排序：把每层的卡按上游平均高度重排
    const incoming = new Map(nodes.map(n => [n.id, []]))
    forward.forEach(e => { if (incoming.has(e.to)) incoming.get(e.to).push(e.from) })
    const yOf = new Map()
    const stack = (k, order) => {
      let y = 0
      order.forEach(n => { yOf.set(n.id, y); y += Math.max(n.h, 150) + GAPY })
      return y
    }
    layerKeys.forEach(k => stack(k, layers.get(k)))
    const colHeight = k => layers.get(k).reduce((s, n) => s + Math.max(n.h, 150) + GAPY, 0) - GAPY
    const maxH = Math.max(...layerKeys.map(colHeight))

    for (let pass = 0; pass < 2; pass++) {
      layerKeys.slice(1).forEach(k => {
        const list = layers.get(k)
        const score = n => {
          const srcs = incoming.get(n.id) || []
          if (!srcs.length) return yOf.get(n.id)
          let sum = 0, cnt = 0
          srcs.forEach(id => { if (yOf.has(id)) { sum += yOf.get(id); cnt++ } })
          return cnt ? sum / cnt : yOf.get(n.id)
        }
        list.sort((a, b) => score(a) - score(b))
        stack(k, list)
      })
    }
    layerKeys.forEach(k => {
      const off = (maxH - colHeight(k)) / 2
      layers.get(k).forEach(n => { yOf.set(n.id, (yOf.get(n.id) || 0) + off) })
    })

    Doc.checkpoint()
    nodes.forEach(n => {
      const nx = posX.get(n.id) || 0
      const ny = yOf.get(n.id) || 0
      n.x = Math.round(nx / 8) * 8
      n.y = Math.round(ny / 8) * 8
    })
    // 记录列通道，供连线走正交折线，避免穿过卡片
    const cols = []
    const col = {}
    const pos = {}
    layerKeys.forEach((k, idx) => {
      const list = layers.get(k)
      const x0 = Math.min(...list.map(n => n.x))
      const w = Math.max(...list.map(n => n.x + n.w)) - x0
      cols.push({ x: x0, w, ids: list.map(n => n.id) })
      list.forEach(n => { col[n.id] = idx; pos[n.id] = [n.x, n.y] })
    })
    ST.tidy = { cols, col, pos }
    CC.renderNodes(); CC.renderEdgesNow(); CC.renderMinimap(); CC.touch(true); CC.fitView()
    const cross = edges.length
    CC.toast('已按连接关系整理：' + layerKeys.length + ' 层 · ' + cross + ' 条连线', 'ok')
  }
  CC.tidyLayout = tidyLayout
  function baseName (p) {
    const name = String(p).split(/[\\/]/).pop()
    return name.replace(/\.cvproj$/i, '')
  }

  async function doSave (saveAs) {
    if (!ST.doc) return false
    const r = await window.cc.saveProject(CC.serialize(), ST.doc.path, saveAs)
    if (!r.ok) { if (!r.canceled) CC.toast('保存失败', 'err'); return false }
    ST.doc.path = r.path
    ST.doc.name = baseName(r.path)
    const t = T.list[T.active]
    if (t) { t.doc = ST.doc; t.dirty = false }
    const meta = document.getElementById('docMeta')
    if (meta) meta.textContent = r.path
    CC.setDirty(false); CC.title(); renderTabs()
    window.cc.recoveryClear()
    CC.toast('已保存：' + baseName(r.path), 'ok')
    return true
  }
  CC.doSave = doSave

  async function openViaDialog () {
    const r = await window.cc.openProject()
    if (!r.ok) { if (!r.canceled) CC.toast(r.error || '打开失败', 'err'); return }
    await openProjectData(r)
  }

  async function openProjectData (r) {
    if (!r || !r.ok) { CC.toast((r && r.error) || '打开失败', 'err'); return }
    // 同一个文件已经打开：直接切过去
    if (r.path) {
      const openIdx = T.list.findIndex(t => t.doc.path && t.doc.path.toLowerCase() === r.path.toLowerCase())
      if (openIdx >= 0) { tabSnapshot(); loadTab(openIdx); CC.toast('该画布已在标签栏中'); return }
    }
    const doc = CC.makeDoc(r.data, r.path)
    const view = CC.makeView(r.data)
    if (currentIsBlank()) {
      const t = T.list[T.active]
      t.doc = doc; t.view = view; t.dirty = false
      loadTab(T.active)
    } else {
      addTab(doc, view, true)
    }
    window.cc.recoveryClear()
    // 校验文件是否还在
    const files = ST.doc.nodes.filter(n => n.type === 'file')
    if (files.length) {
      const res = await window.cc.exists(files.map(n => n.path))
      let missing = 0
      files.forEach(n => { const ok = res[n.path] !== false; n.exists = ok; if (!ok) missing++ })
      CC.renderNodes()
      if (missing) CC.toast(missing + ' 个文件已移动或删除，卡片已标红', 'err')
    }
    CC.toast('已打开：' + (r.path ? baseName(r.path) : r.data.name || ''), 'ok')
  }
  CC.openProjectData = openProjectData

  async function openPath (p) {
    const r = await window.cc.readProject(p)
    if (!r.ok) { CC.toast(r.error || '打开失败', 'err'); return }
    await openProjectData(r)
  }
  CC.openPath = openPath

  function newDoc () {
    const d = CC.blankDoc()
    addTab(d, { x: 60, y: 40, s: 1 }, true)
    CC.toast('已新建空白画布')
  }

  async function exportPng () {
    const inspector = document.getElementById('inspector')
    const wasInspector = inspector && !inspector.hidden
    if (wasInspector) inspector.hidden = true
    const hideEls = ['hud-left', 'hud-right', 'hintbar', 'empty'].map(id => document.getElementById(id)).filter(Boolean)
    const prev = hideEls.map(el => el.style.visibility)
    hideEls.forEach(el => { el.style.visibility = 'hidden' })
    const rect = stageEl.getBoundingClientRect()
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 60)))
    const r = await window.cc.capturePng({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, ST.doc.name || 'canvas')
    hideEls.forEach((el, i) => { el.style.visibility = prev[i] })
    if (wasInspector) inspector.hidden = false
    if (r.ok) CC.toast('已导出图片：' + r.path, 'ok')
    else if (!r.canceled) CC.toast('导出失败：' + (r.error || ''), 'err')
  }

  /* ---------------- 复制 / 粘贴卡片 ---------------- */
  const CARD_MARK = 'CIVILCANVAS-CARDS-1\n'

  function collectCards (ids) {
    const nodes = ids.map(id => Doc.node(id)).filter(Boolean).map(n => JSON.parse(JSON.stringify(n)))
    const set = new Set(nodes.map(n => n.id))
    const edges = ST.doc.edges.filter(e => set.has(e.from) && set.has(e.to)).map(e => ({ from: e.from, to: e.to, kind: e.kind || 'flow' }))
    return { nodes, edges }
  }

  function cloneInto (payload, at) {
    if (!payload || !payload.nodes || !payload.nodes.length) return []
    Doc.checkpoint()
    const minX = Math.min(...payload.nodes.map(n => n.x))
    const maxX = Math.max(...payload.nodes.map(n => n.x + n.w))
    const minY = Math.min(...payload.nodes.map(n => n.y))
    const maxY = Math.max(...payload.nodes.map(n => n.y + n.h))
    let dx = 40, dy = 40
    if (at) {
      const p = CC.s2w(at.x, at.y)
      dx = Math.round((p.x - (minX + (maxX - minX) / 2)) / 8) * 8
      dy = Math.round((p.y - (minY + (maxY - minY) / 2)) / 8) * 8
    }
    const map = new Map()
    const clones = []
    payload.nodes.forEach(src => {
      const c = JSON.parse(JSON.stringify(src))
      c.id = U.uid()
      c.x = Math.round((src.x + dx) / 8) * 8
      c.y = Math.round((src.y + dy) / 8) * 8
      map.set(src.id, c.id)
      clones.push(c)
    })
    Doc.addNodes(clones)
    payload.edges.forEach(e => {
      if (!map.has(e.from) || !map.has(e.to)) return
      ST.doc.edges.push({ id: U.uid(), from: map.get(e.from), to: map.get(e.to), kind: e.kind || 'flow', createdAt: Date.now() })
    })
    Doc.select(clones.map(c => c.id))
    CC.renderEdgesNow(); CC.touch(true); CC.renderInspector && CC.renderInspector()
    return clones
  }

  CC.copyCards = async function () {
    const ids = [...ST.selection]
    if (!ids.length) { CC.toast('先选中要复制的卡片', 'err'); return }
    const payload = collectCards(ids)
    const r = await window.cc.copyCards(payload)
    if (!r || !r.ok) { CC.toast('复制失败：' + ((r && r.error) || ''), 'err'); return }
    CC.toast('已复制 ' + payload.nodes.length + ' 张卡片（Ctrl+V 粘贴）', 'ok')
  }

  CC.pasteCards = async function (at) {
    const r = await window.cc.readCards()
    if (!r || !r.ok || !r.data) { CC.toast('剪贴板里没有可粘贴的卡片', 'err'); return [] }
    const atPt = at || CC.lastPointer || { x: stageEl.clientWidth / 2, y: stageEl.clientHeight / 2 }
    const clones = cloneInto(r.data, atPt)
    if (clones.length) CC.toast('已粘贴 ' + clones.length + ' 张卡片', 'ok')
    return clones
  }

  /* ---------------- 键盘 ---------------- */
  document.addEventListener('keydown', e => {
    if (CC.isWorkMode && CC.isWorkMode()) {
      if (e.key === 'Escape') { e.preventDefault(); CC.setWorkMode(false) }
      return
    }
    const tag = e.target && e.target.tagName
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    const meta = e.ctrlKey || e.metaKey
    if (e.key === 'Escape') {
      if (!root.hidden) { closeModal(); return }
      hideContext()
      CC.clearConnectSource(true)
      document.getElementById('inspector').hidden = true
      Doc.clearSelection()
      return
    }
    if (meta) {
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); doSave(e.shiftKey); return }
      if (k === 'o') { e.preventDefault(); openViaDialog(); return }
      if (k === 'n') { e.preventDefault(); newDoc(); return }
      if (k === 'w') { e.preventDefault(); closeTab(T.active); return }
      if (k === 'i') { e.preventDefault(); importFiles(); return }
      if (k === 'e') { e.preventDefault(); exportPng(); return }
      if (!typing && k === 'z') { e.preventDefault(); e.shiftKey ? Doc.redo() : Doc.undo(); return }
      if (!typing && k === 'y') { e.preventDefault(); Doc.redo(); return }
      if (k === 'f') { e.preventDefault(); openSearch(); return }
      if (!typing && k === 'a') {
        e.preventDefault()
        Doc.select(ST.doc.nodes.map(n => n.id))
        return
      }
      if (!typing && k === 'c') { e.preventDefault(); CC.copyCards(); return }
      if (!typing && k === 'v') { e.preventDefault(); CC.pasteCards(); return }
      if (!typing && k === 'd') {
        e.preventDefault()
        const payload = collectCards([...ST.selection])
        if (!payload.nodes.length) return
        cloneInto(payload, null)
        return
      }
      return
    }
    if (typing) return
    if (e.key === 'F11') { e.preventDefault(); window.cc.winFullToggle(); return }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (ST.selectedEdge) {
        Doc.checkpoint(); Doc.disconnect(ST.selectedEdge); CC.touch(true)
      } else if (ST.selection.size) {
        Doc.checkpoint(); Doc.removeNodes([...ST.selection]); CC.touch(true)
      }
      CC.renderInspector()
    }
  })

  /* ---------------- 顶栏 & HUD ---------------- */
  document.getElementById('btnImport').addEventListener('click', importFiles)
  document.getElementById('btnFolder').addEventListener('click', importFolder)
  document.getElementById('btnNote').addEventListener('click', () => {
    const p = CC.s2w(stageEl.clientWidth / 2, stageEl.clientHeight / 2)
    Doc.checkpoint()
    const n = CC.noteNode(Math.round(p.x / 8) * 8 - 118, Math.round(p.y / 8) * 8 - 84)
    Doc.addNode(n); Doc.select(n.id); CC.touch(true)
    if (CC.autoSaveNote(n.id)) CC.saveNote(n.id, { silent: true })
    setTimeout(() => CC.editNote(n.id), 60)
  })
  document.getElementById('btnSave').addEventListener('click', () => doSave(false))
  document.getElementById('btnOpen').addEventListener('click', openViaDialog)
  document.getElementById('btnExport').addEventListener('click', exportPng)
  document.getElementById('btnTidy').addEventListener('click', tidyLayout)
  document.getElementById('btnSettings').addEventListener('click', () => CC.openSettings())

  document.getElementById('zIn').addEventListener('click', () => CC.zoomTo(ST.view.s * 1.2))
  document.getElementById('zOut').addEventListener('click', () => CC.zoomTo(ST.view.s / 1.2))
  document.getElementById('zVal').addEventListener('click', () => CC.zoomTo(1))
  document.getElementById('zFit').addEventListener('click', CC.fitView)
  document.getElementById('tGrid').addEventListener('click', () => {
    ST.doc.settings.grid = !ST.doc.settings.grid
    CC.updateToggles(); CC.setDirty(true); CC.touch(false)
  })
  document.getElementById('tSnap').addEventListener('click', () => {
    ST.doc.settings.snap = !ST.doc.settings.snap
    CC.updateToggles(); CC.setDirty(true); CC.touch(false)
  })

  /* ---------------- 启动 ---------------- */
  async function saveAllTabs () {
    for (let i = 0; i < T.list.length; i++) {
      const t = T.list[i]
      if (!t.dirty) continue
      if (i !== T.active) { tabSnapshot(); loadTab(i) }
      const ok = await doSave(false)
      if (!ok) return false
      t.dirty = false
    }
    renderTabs()
    return true
  }

  ;(async function boot () {
    window.cc.onOpenPath(p => { if (p) openPath(p) })
    let info = { settings: { general: {}, ui: {}, recent: [] } }
    try { info = await window.cc.init() } catch (err) { console.error(err) }
    ST.settings = info.settings || { general: {}, ui: {}, recent: [] }
    CC.state.settings = ST.settings
    const verEl = document.getElementById('appVer')
    if (verEl && info.version) verEl.textContent = 'v' + info.version
    CC.applyDoc(CC.blankDoc(), '')
    T.list.push({ doc: ST.doc, view: { x: ST.view.x, y: ST.view.y, s: ST.view.s }, dirty: false })
    renderTabs()
    const meta = document.getElementById('docMeta')
    if (meta) meta.textContent = '未保存'

    window.cc.onSaveThenClose(async () => {
      const ok = await saveAllTabs()
      if (ok) window.cc.destroyWindow()
    })

    window.cc.onWinState(s => {
      const el = document.getElementById('winMax')
      if (el) el.classList.toggle('fs', !!(s && s.fullscreen))
    })

    if (info.pendingPath) { await openPath(info.pendingPath); return }
    // 恢复上次未保存的画布
    try {
      const r = await window.cc.recoveryTake()
      if (r.ok && r.data && Array.isArray(r.data.nodes) && r.data.nodes.length) {
        showModal({
          title: '恢复上次的画布',
          small: true,
          body: '<div style="font-size:12.5px;color:#a3a8ba;line-height:1.6">上次退出时还有未保存的画布，包含 ' + r.data.nodes.length + ' 张卡片。要恢复吗？</div>',
          foot: [
            { label: '丢弃', key: 'd', onClick: async () => { await window.cc.recoveryClear(); closeModal() } },
            { label: '恢复', key: 'r', cls: 'pri', onClick: () => {
              CC.applyDoc(r.data, '')
              const t = T.list[T.active]
              t.doc = ST.doc; t.view = { x: ST.view.x, y: ST.view.y, s: ST.view.s }; t.dirty = true
              CC.setDirty(true); CC.title(); renderTabs(); closeModal()
              CC.toast('已恢复上次的画布（未保存）')
            } }
          ]
        })
      }
    } catch (_) {}
  })()
})()
