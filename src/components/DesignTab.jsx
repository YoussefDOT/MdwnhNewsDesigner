import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toPng } from 'html-to-image'
import { pathRef, set, update } from '../firebase.js'
import {
  PAGE_W, PAGE_H, BGS, FONTS, SWATCHES, uid, sanitize,
  defaultDesign, orderedSections, syncDesignWithWriting, expandBodyAfterPaperDelete,
} from '../model.js'
import ImageEditor, { fileToDataUrl } from './ImageEditor.jsx'
import { I } from '../icons.jsx'
import { ToastCtx } from '../App.jsx'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const PAPER_PAD = 0.05 // side padding, fraction of paper width
const PAPER_BOT = 0.16 // bottom strip, fraction of paper width

// html-to-image can't read the cross-origin Google Fonts stylesheet, so for a
// faithful export we fetch that CSS ourselves, download each woff2 file, inline
// it as a base64 data URL, and hand the finished CSS to toPng via `fontEmbedCSS`.
// Result is cached so the (heavy) fetch only happens once per session.
let fontEmbedCache = null
const blobToDataUrl = (blob) =>
  new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = rej
    fr.readAsDataURL(blob)
  })

async function buildFontEmbedCSS() {
  if (fontEmbedCache != null) return fontEmbedCache
  const link = document.querySelector('link[href*="fonts.googleapis.com/css2"]')
  if (!link) return (fontEmbedCache = '')
  let css = await (await fetch(link.href)).text()
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]))]
  await Promise.all(
    urls.map(async (u) => {
      try {
        const data = await blobToDataUrl(await (await fetch(u)).blob())
        css = css.split(u).join(data)
      } catch {
        /* leave the remote url; that subset just won't embed */
      }
    }),
  )
  fontEmbedCache = css
  return css
}

const paperAspect = (el) => {
  const innerW = el.w * (1 - PAPER_PAD * 2)
  const innerH = el.h - el.w * (PAPER_PAD + PAPER_BOT)
  return Math.max(0.2, innerW / Math.max(40, innerH))
}

export default function DesignTab({ projectId, project }) {
  const toast = useContext(ToastCtx)
  const [design, setDesign] = useState(() =>
    project.design || syncDesignWithWriting(defaultDesign(), orderedSections(project.writing)),
  )
  const [sel, setSel] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editorFor, setEditorFor] = useState(null) // {elId, src}
  const [scale, setScale] = useState(0.4)
  const [panelOpen, setPanelOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const designRef = useRef(design)
  designRef.current = design
  const pageRef = useRef(null)
  const stageRef = useRef(null)
  const fileInputRef = useRef(null)
  const pendingImgElRef = useRef(null)
  const elNodes = useRef({})
  const interactRef = useRef(false)
  const lastWrittenRef = useRef('')
  const writeTimerRef = useRef(null)
  const historyRef = useRef({ stack: [JSON.stringify(design)], idx: 0 })
  const [histVer, setHistVer] = useState(0)
  const savedRangeRef = useRef(null)

  const images = project.images || {}
  const bg = BGS.find((b) => b.id === design.bg) || BGS[0]
  const sectionIds = orderedSections(project.writing).map((s) => s.id)

  // ---------- sync in/out ----------
  useEffect(() => {
    const incoming = project.design
    if (!incoming) return
    const json = JSON.stringify(incoming)
    if (json === lastWrittenRef.current) return
    if (interactRef.current || editing) return // ours wins while hands-on
    setDesign(incoming)
    historyRef.current = { stack: [json], idx: 0 }
    setHistVer((v) => v + 1)
  }, [project.design]) // eslint-disable-line

  const scheduleWrite = (next) => {
    clearTimeout(writeTimerRef.current)
    writeTimerRef.current = setTimeout(() => {
      const json = JSON.stringify(next)
      lastWrittenRef.current = json
      set(pathRef(`projects/${projectId}/design`), next)
      update(pathRef(`projects/${projectId}`), { updatedAt: Date.now() })
    }, 450)
  }

  const commit = (next, { history = true } = {}) => {
    setDesign(next)
    designRef.current = next
    if (history) {
      const h = historyRef.current
      const json = JSON.stringify(next)
      if (h.stack[h.idx] !== json) {
        h.stack = h.stack.slice(0, h.idx + 1)
        h.stack.push(json)
        if (h.stack.length > 60) h.stack.shift()
        h.idx = h.stack.length - 1
        setHistVer((v) => v + 1)
      }
    }
    scheduleWrite(next)
  }

  const patchEl = (id, patch, opts) => {
    const d = designRef.current
    if (!d.elements?.[id]) return
    commit(
      { ...d, elements: { ...d.elements, [id]: { ...d.elements[id], ...patch } } },
      opts,
    )
  }

  // ---------- undo / redo ----------
  const canUndo = historyRef.current.idx > 0
  const canRedo = historyRef.current.idx < historyRef.current.stack.length - 1
  const undo = () => {
    const h = historyRef.current
    if (h.idx <= 0) return
    h.idx -= 1
    const next = JSON.parse(h.stack[h.idx])
    setDesign(next)
    designRef.current = next
    setHistVer((v) => v + 1)
    scheduleWrite(next)
  }
  const redo = () => {
    const h = historyRef.current
    if (h.idx >= h.stack.length - 1) return
    h.idx += 1
    const next = JSON.parse(h.stack[h.idx])
    setDesign(next)
    designRef.current = next
    setHistVer((v) => v + 1)
    scheduleWrite(next)
  }

  // ---------- fit page to viewport ----------
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const fit = () => {
      const pad = 28
      const s = Math.min(
        (el.clientWidth - pad) / PAGE_W,
        (el.clientHeight - pad) / PAGE_H,
      )
      setScale(clamp(s, 0.08, 1.2))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      const typing =
        t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        deleteEl(sel)
      }
      if (e.key === 'Escape') {
        setEditing(null)
        setSel(null)
      }
      if (sel && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 24 : 5
        const el = designRef.current.elements[sel]
        if (!el) return
        patchEl(sel, {
          x: el.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0),
          y: el.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0),
          auto: false,
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, editing]) // eslint-disable-line

  // ---------- pointer interactions ----------
  const toPage = (e) => {
    const r = pageRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }

  const startInteract = (e, id, mode, handle) => {
    if (editing === id && mode === 'move') return
    e.stopPropagation()
    e.preventDefault()
    setSel(id)
    if (editing && editing !== id) exitEditing()
    const el0 = { ...designRef.current.elements[id] }
    if (!el0) return
    const p0 = toPage(e)
    const node = elNodes.current[id]
    const elH = el0.h ?? node?.offsetHeight ?? 100
    const cx = el0.x + el0.w / 2
    const cy = el0.y + elH / 2
    interactRef.current = true
    let moved = false

    const mm = (ev) => {
      const p = toPage(ev)
      const dxp = p.x - p0.x
      const dyp = p.y - p0.y
      if (Math.abs(dxp) + Math.abs(dyp) > 1.5) moved = true
      const rad = ((el0.rot || 0) * Math.PI) / 180
      const dx = dxp * Math.cos(rad) + dyp * Math.sin(rad)
      const dy = -dxp * Math.sin(rad) + dyp * Math.cos(rad)
      const els = designRef.current.elements
      let el = { ...els[id] }

      if (mode === 'move') {
        el.x = el0.x + dxp
        el.y = el0.y + dyp
      } else if (mode === 'rotate') {
        let ang = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90
        ang = ((ang + 540) % 360) - 180
        const snap = Math.round(ang / 15) * 15
        if (Math.abs(ang - snap) < 4) ang = snap
        el.rot = Math.round(ang * 10) / 10
      } else if (el.kind === 'text') {
        if (handle === 'r') {
          el.w = clamp(el0.w + dx, 90, PAGE_W)
        } else if (handle === 'l') {
          el.w = clamp(el0.w - dx, 90, PAGE_W)
          el.x = el0.x + (el0.w - el.w)
        } else {
          const sgn = handle.includes('r') ? 1 : -1
          const w = clamp(el0.w + sgn * dx, 90, PAGE_W)
          const ratio = w / el0.w
          el.w = w
          el.fs = clamp(el0.fs * ratio, 12, 260)
          if (sgn < 0) el.x = el0.x + (el0.w - w)
        }
      } else {
        // paper
        if (handle === 'r') el.w = clamp(el0.w + dx, 110, PAGE_W)
        else if (handle === 'l') {
          el.w = clamp(el0.w - dx, 110, PAGE_W)
          el.x = el0.x + (el0.w - el.w)
        } else if (handle === 'b') el.h = clamp(el0.h + dy, 110, PAGE_H)
        else if (handle === 't') {
          el.h = clamp(el0.h - dy, 110, PAGE_H)
          el.y = el0.y + (el0.h - el.h)
        } else {
          const sgn = handle.includes('r') ? 1 : -1
          const s = clamp((el0.w + sgn * dx) / el0.w, 0.25, 6)
          el.w = el0.w * s
          el.h = el0.h * s
          if (handle.includes('l')) el.x = el0.x + (el0.w - el.w)
          if (handle.includes('t')) el.y = el0.y + (el0.h - el.h)
        }
      }
      if (mode !== 'rotate') el.auto = false
      const next = { ...designRef.current, elements: { ...els, [id]: el } }
      designRef.current = next
      setDesign(next)
    }

    const mu = () => {
      window.removeEventListener('pointermove', mm)
      window.removeEventListener('pointerup', mu)
      interactRef.current = false
      if (moved) commit(designRef.current)
    }
    window.addEventListener('pointermove', mm)
    window.addEventListener('pointerup', mu)
  }

  // ---------- text editing ----------
  const exitEditing = () => {
    const id = editing
    if (!id) return
    const node = elNodes.current[id]?.querySelector('.rt')
    setEditing(null)
    if (node) {
      const html = sanitize(node.innerHTML)
      if (html !== designRef.current.elements[id]?.html) patchEl(id, { html })
    }
  }

  const enterEditing = (id) => {
    setEditing(id)
    requestAnimationFrame(() => {
      const node = elNodes.current[id]?.querySelector('.rt')
      if (node) {
        node.focus()
        const r = document.createRange()
        r.selectNodeContents(node)
        r.collapse(false)
        const s = window.getSelection()
        s.removeAllRanges()
        s.addRange(r)
      }
    })
  }

  const saveSelection = () => {
    const s = window.getSelection()
    if (s && s.rangeCount && !s.isCollapsed) savedRangeRef.current = s.getRangeAt(0).cloneRange()
  }
  const restoreSelection = () => {
    const r = savedRangeRef.current
    if (!r) return false
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
    return true
  }

  const hasLiveSelection = () => {
    if (!editing) return false
    const s = window.getSelection()
    return s && s.rangeCount > 0 && !s.isCollapsed &&
      elNodes.current[editing]?.contains(s.anchorNode)
  }

  // apply to selected characters when possible, otherwise to the whole element
  const applyStyle = (cmd, value, elPatch) => {
    if (hasLiveSelection() || (editing && restoreSelection())) {
      document.execCommand('styleWithCSS', false, true)
      document.execCommand(cmd, false, value)
      const node = elNodes.current[editing]?.querySelector('.rt')
      if (node) patchEl(editing, { html: sanitize(node.innerHTML) })
    } else if (sel) {
      patchEl(sel, elPatch)
    }
  }

  // ---------- element ops ----------
  const deleteEl = (id) => {
    const d = designRef.current
    const el = d.elements[id]
    if (!el) return
    const next = JSON.parse(JSON.stringify(d))
    delete next.elements[id]
    if (el.kind === 'paper' && el.sid) {
      next.deletedPapers = next.deletedPapers || {}
      next.deletedPapers[el.sid] = true
      expandBodyAfterPaperDelete(next, el.sid, sectionIds)
    }
    setSel(null)
    setEditing(null)
    commit(next)
  }

  const maxZ = () =>
    Math.max(0, ...Object.values(designRef.current.elements || {}).map((e) => e.z || 0))

  const addPaper = () => {
    const id = 'paper_x' + uid()
    const d = designRef.current
    commit({
      ...d,
      elements: {
        ...d.elements,
        [id]: {
          kind: 'paper', sid: null, auto: false, z: maxZ() + 1,
          x: PAGE_W / 2 - 170, y: PAGE_H / 2 - 190, w: 340, h: 390,
          rot: 2.5, img: null,
        },
      },
    })
    setSel(id)
    setPanelOpen(false)
  }

  const addText = () => {
    const id = 'text_x' + uid()
    const d = designRef.current
    commit({
      ...d,
      elements: {
        ...d.elements,
        [id]: {
          kind: 'text', role: 'free', sid: null, auto: false, z: maxZ() + 1,
          x: PAGE_W / 2 - 260, y: PAGE_H / 2 - 40, w: 520, fs: 40,
          rot: 0, align: 'center', bold: false, html: 'نص جديد…',
        },
      },
    })
    setSel(id)
    setPanelOpen(false)
    enterEditing(id)
  }

  const layerMove = (id, dir) => {
    const el = designRef.current.elements[id]
    if (!el) return
    patchEl(id, { z: (el.z || 0) + (dir === 'up' ? 1.5 : -1.5) })
  }

  // ---------- images ----------
  const openPicker = (elId) => {
    pendingImgElRef.current = elId
    fileInputRef.current?.click()
  }

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    try {
      const src = await fileToDataUrl(file)
      setEditorFor({ elId: pendingImgElRef.current, src })
    } catch {
      toast('تعذّر فتح الصورة', 'warn')
    }
  }

  const onEditorSave = async (dataUrl) => {
    const { elId } = editorFor
    setEditorFor(null)
    const imgId = 'img_' + uid()
    try {
      await set(pathRef(`projects/${projectId}/images/${imgId}`), dataUrl)
      patchEl(elId, { img: imgId })
    } catch {
      toast('تعذّر رفع الصورة', 'warn')
    }
  }

  const onDropOnStage = async (e) => {
    e.preventDefault()
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'))
    if (!file) return
    const p = toPage(e)
    const id = 'paper_x' + uid()
    const d = designRef.current
    commit({
      ...d,
      elements: {
        ...d.elements,
        [id]: {
          kind: 'paper', sid: null, auto: false, z: maxZ() + 1,
          x: clamp(p.x - 170, 0, PAGE_W - 340), y: clamp(p.y - 190, 0, PAGE_H - 390),
          w: 340, h: 390, rot: -2, img: null,
        },
      },
    })
    setSel(id)
    try {
      const src = await fileToDataUrl(file)
      setEditorFor({ elId: id, src })
    } catch {
      toast('تعذّر فتح الصورة', 'warn')
    }
  }

  // ---------- export ----------
  const exportPng = async () => {
    setSel(null)
    setEditing(null)
    setExporting(true)
    try {
      const node = pageRef.current
      // make sure every image + font is fully decoded before capture,
      // otherwise the first snapshot silently drops the background/shadow
      await Promise.all(
        [...node.querySelectorAll('img')].map((im) =>
          im.decode ? im.decode().catch(() => {}) : Promise.resolve(),
        ),
      )
      if (document.fonts?.ready) await document.fonts.ready

      // Build a self-contained @font-face stylesheet (woff2 inlined as base64).
      // Passing it as `fontEmbedCSS` both (a) stops html-to-image from reading
      // the cross-origin Google stylesheet (which throws + aborts the capture)
      // and (b) makes the Arabic fonts actually render in the rasterized SVG
      // instead of a fallback. Empty string = skip fonts (still a valid export).
      const fontEmbedCSS = await buildFontEmbedCSS().catch(() => '')
      await new Promise((r) => setTimeout(r, 150))

      const opts = {
        width: PAGE_W,
        height: PAGE_H,
        pixelRatio: 1,
        backgroundColor: '#b9906b',
        fontEmbedCSS,
        style: { transform: 'none' },
        filter: (n) => !(n.classList && n.classList.contains('no-export')),
      }
      // first pass warms html-to-image's internal image cache, second is clean
      await toPng(node, opts)
      const dataUrl = await toPng(node, opts)

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${project.name || 'صحيفة'}.png`
      a.click()
      toast('صُدّرت الصفحة بجودة كاملة ✦')
    } catch (err) {
      console.error(err)
      toast('تعذّر التصدير، جرّبوا مرة أخرى', 'warn')
    } finally {
      setExporting(false)
    }
  }

  // ---------- render ----------
  const selEl = sel ? design.elements?.[sel] : null
  const elements = Object.entries(design.elements || {}).sort(
    (a, b) => (a[1].z || 0) - (b[1].z || 0),
  )

  return (
    <div className="design">
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFilePicked} />

      {/* ---- edit panel ---- */}
      <aside className={`panel ${panelOpen ? 'panel-open' : ''}`}>
        <div className="panel-head">
          <I.palette /> لوحة التحكم
          <button className="icon-btn panel-close" onClick={() => setPanelOpen(false)}><I.x /></button>
        </div>

        <div className="panel-group">
          <span className="panel-label">الخلفية</span>
          <div className="bg-grid">
            {BGS.map((b) => (
              <button
                key={b.id}
                className={`bg-thumb ${design.bg === b.id ? 'bg-on' : ''}`}
                title={b.name}
                onClick={() => commit({ ...designRef.current, bg: b.id })}
              >
                <img src={b.src} alt={b.name} />
                <span>{b.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel-group">
          <span className="panel-label">ظلال القماش</span>
          <label className="slider-row">
            <input
              type="range" min="0" max="1" step="0.01"
              value={design.shadow ?? 0.45}
              onChange={(e) => {
                const next = { ...designRef.current, shadow: +e.target.value }
                designRef.current = next
                setDesign(next)
                scheduleWrite(next)
              }}
              onPointerUp={() => commit(designRef.current)}
            />
            <b className="slider-val">{Math.round((design.shadow ?? 0.45) * 100)}٪</b>
          </label>
        </div>

        <div className="panel-group">
          <span className="panel-label">خط الصفحة</span>
          <select
            className="input select"
            value={design.pageFont || FONTS[0].id}
            onChange={(e) => commit({ ...designRef.current, pageFont: e.target.value })}
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.id }}>{f.name}</option>
            ))}
          </select>
        </div>

        <div className="panel-group">
          <span className="panel-label">إضافة عناصر</span>
          <div className="panel-row">
            <button className="btn btn-ghost btn-s" onClick={addPaper}><I.paper /> ورقة</button>
            <button className="btn btn-ghost btn-s" onClick={addText}><I.text /> نص</button>
          </div>
        </div>

        <div className="panel-group panel-bottom">
          <button className="btn btn-primary btn-export" disabled={exporting} onClick={exportPng}>
            {exporting ? <span className="spinner spinner-s" /> : <I.download />}
            تصدير PNG
          </button>
        </div>
      </aside>

      {/* ---- canvas side ---- */}
      <div className="design-main">
        <div className="selbar-wrap">
          <div className="selbar">
            <button className="icon-btn" disabled={!canUndo} onClick={undo} title="تراجع (Ctrl+Z)"><I.undo /></button>
            <button className="icon-btn" disabled={!canRedo} onClick={redo} title="إعادة (Ctrl+Shift+Z)"><I.redo /></button>
            <span className="selbar-sep" />
            {selEl ? (
              selEl.kind === 'text' ? (
                <TextTools
                  el={selEl}
                  design={design}
                  editing={editing === sel}
                  onEdit={() => enterEditing(sel)}
                  applyStyle={applyStyle}
                  patch={(p) => patchEl(sel, p)}
                  saveSelection={saveSelection}
                  onLayer={(d) => layerMove(sel, d)}
                  onDelete={() => deleteEl(sel)}
                />
              ) : (
                <div className="tools">
                  <button className="btn btn-ghost btn-s" onClick={() => openPicker(sel)}>
                    <I.image /> {selEl.img ? 'تغيير الصورة' : 'إضافة صورة'}
                  </button>
                  {selEl.img && images[selEl.img] && (
                    <button className="btn btn-ghost btn-s"
                            onClick={() => setEditorFor({ elId: sel, src: images[selEl.img] })}>
                      <I.rotate /> قصّ وتحرير
                    </button>
                  )}
                  {selEl.img && (
                    <button className="btn btn-ghost btn-s" onClick={() => patchEl(sel, { img: null })}>
                      <I.x /> إزالة الصورة
                    </button>
                  )}
                  <span className="selbar-sep" />
                  <button className="icon-btn" title="للأمام" onClick={() => layerMove(sel, 'up')}><I.up /></button>
                  <button className="icon-btn" title="للخلف" onClick={() => layerMove(sel, 'down')}><I.down /></button>
                  <button className="icon-btn icon-btn-danger" title="حذف" onClick={() => deleteEl(sel)}><I.trash /></button>
                </div>
              )
            ) : (
              <span className="selbar-hint">اختاروا أي عنصر في الصفحة لتخصيصه — أو اسحبوا صورة وأفلتوها</span>
            )}
          </div>
        </div>

        <div
          className="stage"
          ref={stageRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropOnStage}
        >
          <div className="page-holder" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
            <div
              ref={pageRef}
              className={`page ${exporting ? 'exporting' : ''}`}
              data-light={bg.light}
              style={{
                width: PAGE_W, height: PAGE_H,
                transform: `scale(${scale})`,
                '--page-font': `'${design.pageFont || FONTS[0].id}', sans-serif`,
              }}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget || e.target.classList.contains('page-bg')) {
                  exitEditing()
                  setSel(null)
                }
              }}
            >
              <img className="page-bg" src={bg.src} alt="" draggable={false} />

              {elements.map(([id, el]) =>
                el.kind === 'text' ? (
                  <TextEl
                    key={id} id={id} el={el}
                    selected={sel === id} editing={editing === id}
                    nodeRef={(n) => (elNodes.current[id] = n)}
                    onDown={(e) => startInteract(e, id, 'move')}
                    onHandle={(e, h) => startInteract(e, id, h === 'rot' ? 'rotate' : 'resize', h)}
                    onDbl={() => enterEditing(id)}
                    onExit={exitEditing}
                    scale={scale}
                  />
                ) : (
                  <PaperEl
                    key={id} id={id} el={el} img={el.img ? images[el.img] : null}
                    selected={sel === id}
                    nodeRef={(n) => (elNodes.current[id] = n)}
                    onDown={(e) => startInteract(e, id, 'move')}
                    onHandle={(e, h) => startInteract(e, id, h === 'rot' ? 'rotate' : 'resize', h)}
                    onPick={() => openPicker(id)}
                    onDropImage={async (file) => {
                      setSel(id)
                      try {
                        const src = await fileToDataUrl(file)
                        setEditorFor({ elId: id, src })
                      } catch { toast('تعذّر فتح الصورة', 'warn') }
                    }}
                    scale={scale}
                  />
                ),
              )}

              <img
                className="shadow-ol"
                src="./assets/shadow.png"
                alt=""
                draggable={false}
                style={{ opacity: design.shadow ?? 0.45 }}
              />
            </div>
          </div>
        </div>

        <button className="btn btn-primary fab-panel" onClick={() => setPanelOpen(true)}>
          <I.palette /> تخصيص
        </button>
      </div>

      {editorFor && (
        <ImageEditor
          src={editorFor.src}
          aspect={paperAspect(design.elements[editorFor.elId] || { w: 340, h: 390 })}
          onSave={onEditorSave}
          onClose={() => setEditorFor(null)}
        />
      )}
    </div>
  )
}

// ---------------- text element ----------------
function TextEl({ id, el, selected, editing, nodeRef, onDown, onHandle, onDbl, onExit, scale }) {
  const rtRef = useRef(null)
  const htmlRef = useRef(el.html)

  // keep DOM in sync with state unless the user is typing in it
  useEffect(() => {
    if (!editing && rtRef.current && rtRef.current.innerHTML !== el.html) {
      rtRef.current.innerHTML = el.html
    }
  }, [el.html, editing])

  return (
    <div
      ref={nodeRef}
      className={`el el-text ${selected ? 'el-sel' : ''} ${editing ? 'el-editing' : ''} ${el.role === 'head' ? 'el-head' : ''}`}
      style={{
        left: el.x, top: el.y, width: el.w,
        fontSize: el.fs,
        transform: `rotate(${el.rot || 0}deg)`,
        textAlign: el.align || 'right',
        zIndex: selected ? 700 : Math.round((el.z || 0) * 10),
        fontFamily: el.font ? `'${el.font}', sans-serif` : undefined,
        color: el.color || undefined,
        fontWeight: el.bold ? 800 : 500,
        fontStyle: el.italic ? 'italic' : undefined,
      }}
      onPointerDown={onDown}
      onDoubleClick={onDbl}
    >
      <div
        ref={rtRef}
        className="rt"
        contentEditable={editing}
        suppressContentEditableWarning
        onBlur={editing ? onExit : undefined}
        dangerouslySetInnerHTML={{ __html: htmlRef.current }}
      />
      {selected && !editing && (
        <Handles kind="text" onHandle={onHandle} scale={scale} />
      )}
    </div>
  )
}

// ---------------- taped paper element ----------------
function PaperEl({ id, el, img, selected, nodeRef, onDown, onHandle, onPick, onDropImage, scale }) {
  const [over, setOver] = useState(false)
  return (
    <div
      ref={nodeRef}
      className={`el el-paper ${selected ? 'el-sel' : ''} ${over ? 'el-over' : ''}`}
      style={{
        left: el.x, top: el.y, width: el.w, height: el.h,
        transform: `rotate(${el.rot || 0}deg)`,
        zIndex: selected ? 700 : Math.round((el.z || 0) * 10),
      }}
      onPointerDown={onDown}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setOver(false)
        const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'))
        if (f) onDropImage(f)
      }}
    >
      <div className="paper-body">
        <div className="paper-img-wrap">
          {img ? (
            <img src={img} alt="" draggable={false} />
          ) : (
            <button
              className="paper-empty no-export"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onPick}
            >
              <I.image />
              <span>أضيفوا صورة</span>
            </button>
          )}
        </div>
      </div>
      <span className="tape tape-a" />
      <span className="tape tape-b" />
      {selected && <Handles kind="paper" onHandle={onHandle} scale={scale} />}
    </div>
  )
}

// ---------------- selection handles ----------------
const HANDLE_SETS = {
  text: ['tl', 'tr', 'bl', 'br', 'l', 'r', 'rot'],
  paper: ['tl', 'tr', 'bl', 'br', 'l', 'r', 't', 'b', 'rot'],
}

function Handles({ kind, onHandle, scale }) {
  const s = clamp(16 / scale, 14, 90)
  return (
    <div className="handles no-export" style={{ '--hs': `${s}px` }}>
      <div className="sel-outline" />
      {HANDLE_SETS[kind].map((h) => (
        <span
          key={h}
          className={`handle handle-${h}`}
          onPointerDown={(e) => onHandle(e, h)}
        />
      ))}
    </div>
  )
}

// ---------------- text toolbar ----------------
function TextTools({ el, design, editing, onEdit, applyStyle, patch, saveSelection, onLayer, onDelete }) {
  const [fontsOpen, setFontsOpen] = useState(false)
  const [colorsOpen, setColorsOpen] = useState(false)
  const fontBtnRef = useRef(null)
  const colorBtnRef = useRef(null)
  const noFocus = (e) => e.preventDefault()

  const curFont = el.font || design.pageFont || FONTS[0].id
  const align = el.align || 'right'
  const alignNext = { right: 'center', center: 'left', left: 'right' }
  const AlignIcon = align === 'right' ? I.alignR : align === 'center' ? I.alignC : I.alignL

  return (
    <div className="tools">
      {!editing && (
        <button className="btn btn-ghost btn-s" onPointerDown={noFocus} onClick={onEdit}>
          <I.pencil /> تحرير النص
        </button>
      )}

      {/* font */}
      <button
        ref={fontBtnRef}
        className="btn btn-ghost btn-s"
        onPointerDown={(e) => { noFocus(e); saveSelection() }}
        onClick={() => { setFontsOpen((o) => !o); setColorsOpen(false) }}
        style={{ fontFamily: `'${curFont}'` }}
      >
        {FONTS.find((f) => f.id === curFont)?.name || curFont} ▾
      </button>
      <Pop open={fontsOpen} anchorRef={fontBtnRef} onClose={() => setFontsOpen(false)}>
        {FONTS.map((f) => (
          <button
            key={f.id}
            className="pop-item"
            style={{ fontFamily: `'${f.id}'` }}
            onPointerDown={noFocus}
            onClick={() => { applyStyle('fontName', f.id, { font: f.id }); setFontsOpen(false) }}
          >
            {f.name}
          </button>
        ))}
      </Pop>

      {/* size */}
      <div className="size-ctl">
        <button className="icon-btn" onPointerDown={noFocus}
                onClick={() => patch({ fs: clamp((el.fs || 34) - 3, 12, 260) })}>−</button>
        <b>{Math.round(el.fs || 34)}</b>
        <button className="icon-btn" onPointerDown={noFocus}
                onClick={() => patch({ fs: clamp((el.fs || 34) + 3, 12, 260) })}>+</button>
      </div>

      <button className={`icon-btn ${el.bold ? 'icon-on' : ''}`} title="عريض"
              onPointerDown={noFocus}
              onClick={() => applyStyle('bold', null, { bold: !el.bold })}>
        <I.bold />
      </button>
      <button className={`icon-btn ${el.italic ? 'icon-on' : ''}`} title="مائل"
              onPointerDown={noFocus}
              onClick={() => applyStyle('italic', null, { italic: !el.italic })}>
        <I.italic />
      </button>

      {/* color */}
      <button
        ref={colorBtnRef}
        className="icon-btn color-btn"
        title="لون النص"
        onPointerDown={(e) => { noFocus(e); saveSelection() }}
        onClick={() => { setColorsOpen((o) => !o); setFontsOpen(false) }}
      >
        <span className="color-dot" style={{ background: el.color || 'var(--ink-ui)' }} />
      </button>
      <Pop open={colorsOpen} anchorRef={colorBtnRef} onClose={() => setColorsOpen(false)} className="pop-colors">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            onPointerDown={noFocus}
            onClick={() => { applyStyle('foreColor', c, { color: c }); setColorsOpen(false) }}
          />
        ))}
        <label className="swatch swatch-custom" onPointerDown={saveSelection} title="لون مخصص">
          <input
            type="color"
            onChange={(e) => { applyStyle('foreColor', e.target.value, { color: e.target.value }) }}
          />
          +
        </label>
        <button className="pop-item pop-reset" onPointerDown={noFocus}
                onClick={() => { patch({ color: null }); setColorsOpen(false) }}>
          اللون التلقائي
        </button>
      </Pop>

      <button className="icon-btn" title="المحاذاة" onPointerDown={noFocus}
              onClick={() => patch({ align: alignNext[align] })}>
        <AlignIcon />
      </button>

      <span className="selbar-sep" />
      <button className="icon-btn" title="للأمام" onPointerDown={noFocus} onClick={() => onLayer('up')}><I.up /></button>
      <button className="icon-btn" title="للخلف" onPointerDown={noFocus} onClick={() => onLayer('down')}><I.down /></button>
      <button className="icon-btn icon-btn-danger" title="حذف" onPointerDown={noFocus} onClick={onDelete}><I.trash /></button>
    </div>
  )
}

// Portal-rendered dropdown anchored under a trigger button, so the parent
// toolbar's horizontal scroll (overflow) can never clip it.
function Pop({ open, anchorRef, onClose, className = '', children }) {
  const [pos, setPos] = useState(null)
  const popRef = useRef(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const a = anchorRef.current
      if (!a) return
      const r = a.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return
      onClose()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [open, onClose, anchorRef])

  if (!open || !pos) return null
  return createPortal(
    <div
      ref={popRef}
      className={`pop pop-portal ${className}`}
      style={{ top: pos.top, right: pos.right }}
    >
      {children}
    </div>,
    document.body,
  )
}
