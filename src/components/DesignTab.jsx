import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toPng } from 'html-to-image'
import { removeBackground } from '@imgly/background-removal'
import { pathRef, set, update } from '../firebase.js'
import {
  PAGE_W, PAGE_H, AREA, BGS, SWATCHES, uid, sanitize,
  defaultDesign, orderedSections, syncDesignWithWriting, expandBodyAfterPaperDelete,
} from '../model.js'
import {
  BRAND_FONTS, ARABIC_FONTS, fetchAllFonts, loadFont, fontWeightsFor, DEFAULT_FONT,
} from '../fonts.js'
import ImageEditor, { fileToDataUrl } from './ImageEditor.jsx'
import { I } from '../icons.jsx'
import { ToastCtx } from '../App.jsx'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const PAPER_PAD = 0.05
const PAPER_BOT = 0.16
const Z_MIN = 1
const Z_MAX = 140

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

const loadImage = (src) =>
  new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })

// --- font embedding for export (fetch Google CSS + inline woff2 as base64) ---
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
  const links = [...document.querySelectorAll('link[href*="fonts.googleapis.com/css2"]')]
  let css = ''
  for (const link of links) {
    try { css += '\n' + (await (await fetch(link.href)).text()) } catch { /* skip */ }
  }
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]))]
  await Promise.all(
    urls.map(async (u) => {
      try {
        const data = await blobToDataUrl(await (await fetch(u)).blob())
        css = css.split(u).join(data)
      } catch { /* leave remote url */ }
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

export default function DesignTab({ projectId, project, onLeave }) {
  const toast = useContext(ToastCtx)
  const [design, setDesign] = useState(() =>
    project.design || syncDesignWithWriting(defaultDesign(), orderedSections(project.writing)),
  )
  const [sel, setSel] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editorFor, setEditorFor] = useState(null)
  const [scale, setScale] = useState(0.4)
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [panelOpen, setPanelOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [bgBusy, setBgBusy] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [guides, setGuides] = useState([])
  const [allFonts, setAllFonts] = useState(null)

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
  const viewRef = useRef(view)
  const pointersRef = useRef(new Map())
  const gestureRef = useRef(null)
  const activeAbortRef = useRef(null)

  const images = project.images || {}
  const bg = BGS.find((b) => b.id === design.bg) || BGS[0]
  const sectionIds = orderedSections(project.writing).map((s) => s.id)
  const effScale = scale * view.zoom

  // ---------- font loading ----------
  useEffect(() => { fetchAllFonts().then(setAllFonts) }, [])
  useEffect(() => {
    // preload the fonts the page actually uses
    loadFont(design.pageFont || DEFAULT_FONT)
    Object.values(design.elements || {}).forEach((e) => e.font && loadFont(e.font))
  }, [design.pageFont, design.elements])

  // ---------- back-button guard (phone system back) ----------
  useEffect(() => {
    history.pushState({ dz: 1 }, '')
    const onPop = () => {
      setConfirmLeave(true)
      history.pushState({ dz: 1 }, '') // stay put until they confirm
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // ---------- sync in/out ----------
  useEffect(() => {
    const incoming = project.design
    if (!incoming) return
    const json = JSON.stringify(incoming)
    if (json === lastWrittenRef.current) return
    if (interactRef.current || editing) return
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

  const commit = (next, { history: keepHist = true } = {}) => {
    setDesign(next)
    designRef.current = next
    if (keepHist) {
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
    commit({ ...d, elements: { ...d.elements, [id]: { ...d.elements[id], ...patch } } }, opts)
  }

  // ---------- undo / redo ----------
  const canUndo = historyRef.current.idx > 0
  const canRedo = historyRef.current.idx < historyRef.current.stack.length - 1
  const undo = () => {
    const h = historyRef.current
    if (h.idx <= 0) return
    h.idx -= 1
    const next = JSON.parse(h.stack[h.idx])
    setDesign(next); designRef.current = next; setHistVer((v) => v + 1); scheduleWrite(next)
  }
  const redo = () => {
    const h = historyRef.current
    if (h.idx >= h.stack.length - 1) return
    h.idx += 1
    const next = JSON.parse(h.stack[h.idx])
    setDesign(next); designRef.current = next; setHistVer((v) => v + 1); scheduleWrite(next)
  }

  // ---------- fit page to viewport ----------
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const fit = () => {
      const pad = 28
      const s = Math.min((el.clientWidth - pad) / PAGE_W, (el.clientHeight - pad) / PAGE_H)
      setScale(clamp(s, 0.08, 1.2))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const applyView = (v) => {
    const nv = { zoom: clamp(v.zoom, 1, 6), x: v.x, y: v.y }
    viewRef.current = nv
    setView(nv)
  }
  const resetView = () => applyView({ zoom: 1, x: 0, y: 0 })

  // ---------- pinch-zoom / pan (capture phase, sees element touches too) ----------
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const pts = pointersRef.current

    const down = (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) {
        activeAbortRef.current?.() // cancel any element drag started by finger #1
        setSel(null); setEditing(null)
        const [a, b] = [...pts.values()]
        gestureRef.current = {
          mode: 'pinch', d0: dist(a, b), m0: mid(a, b),
          z0: viewRef.current.zoom, x0: viewRef.current.x, y0: viewRef.current.y,
        }
        e.preventDefault()
      } else if (pts.size === 1) {
        const onEl = e.target.closest && e.target.closest('.el')
        if (!onEl) {
          gestureRef.current = {
            mode: 'pan', px: e.clientX, py: e.clientY,
            x0: viewRef.current.x, y0: viewRef.current.y,
          }
        }
      }
    }
    const move = (e) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const g = gestureRef.current
      if (!g) return
      if (g.mode === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()]
        const zoom = clamp(g.z0 * (dist(a, b) / g.d0), 1, 6)
        const m = mid(a, b)
        applyView({ zoom, x: g.x0 + (m.x - g.m0.x), y: g.y0 + (m.y - g.m0.y) })
        e.preventDefault()
      } else if (g.mode === 'pan') {
        applyView({ zoom: viewRef.current.zoom, x: g.x0 + (e.clientX - g.px), y: g.y0 + (e.clientY - g.py) })
        e.preventDefault()
      }
    }
    const up = (e) => {
      pts.delete(e.pointerId)
      if (pts.size === 0 || (gestureRef.current?.mode === 'pinch' && pts.size < 2)) gestureRef.current = null
    }
    const wheel = (e) => {
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.0016)
      applyView({ zoom: clamp(viewRef.current.zoom * factor, 1, 6), x: viewRef.current.x, y: viewRef.current.y })
    }

    stage.addEventListener('pointerdown', down, true)
    stage.addEventListener('pointermove', move, true)
    stage.addEventListener('pointerup', up, true)
    stage.addEventListener('pointercancel', up, true)
    stage.addEventListener('wheel', wheel, { passive: false })
    return () => {
      stage.removeEventListener('pointerdown', down, true)
      stage.removeEventListener('pointermove', move, true)
      stage.removeEventListener('pointerup', up, true)
      stage.removeEventListener('pointercancel', up, true)
      stage.removeEventListener('wheel', wheel)
    }
  }, [])

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteEl(sel) }
      if (e.key === 'Escape') { setEditing(null); setSel(null) }
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

  // ---------- coords ----------
  const toPage = (e) => {
    const r = pageRef.current.getBoundingClientRect()
    const s = r.width / PAGE_W
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
  }

  // ---------- alignment snapping ----------
  const snapMove = (id, el) => {
    const node = elNodes.current[id]
    const w = el.w
    const h = el.h ?? (node ? node.offsetHeight : 100)
    const thr = 8 / effScale
    // build target guide lines from page + other elements
    const vx = [0, PAGE_W / 2, PAGE_W, AREA.L, AREA.R]
    const hy = [0, PAGE_H / 2, PAGE_H, AREA.T, AREA.B]
    for (const [oid, oe] of Object.entries(designRef.current.elements)) {
      if (oid === id) continue
      const on = elNodes.current[oid]
      const ow = oe.w
      const oh = oe.h ?? (on ? on.offsetHeight : 100)
      vx.push(oe.x, oe.x + ow / 2, oe.x + ow)
      hy.push(oe.y, oe.y + oh / 2, oe.y + oh)
    }
    const shown = []
    // vertical (x) — test left / center / right of moving element
    let bestX = null
    for (const edge of [['l', el.x], ['c', el.x + w / 2], ['r', el.x + w]]) {
      for (const t of vx) {
        const d = Math.abs(edge[1] - t)
        if (d < thr && (!bestX || d < bestX.d)) bestX = { d, shift: t - edge[1], at: t }
      }
    }
    if (bestX) { el.x += bestX.shift; shown.push({ axis: 'x', at: bestX.at }) }
    let bestY = null
    for (const edge of [['t', el.y], ['c', el.y + h / 2], ['b', el.y + h]]) {
      for (const t of hy) {
        const d = Math.abs(edge[1] - t)
        if (d < thr && (!bestY || d < bestY.d)) bestY = { d, shift: t - edge[1], at: t }
      }
    }
    if (bestY) { el.y += bestY.shift; shown.push({ axis: 'y', at: bestY.at }) }
    return shown
  }

  // ---------- element interaction ----------
  const startInteract = (e, id, mode, handle) => {
    if (editing === id && mode === 'move') return
    if (pointersRef.current.size >= 2) return // pinch owns this
    e.stopPropagation(); e.preventDefault()
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
        setGuides(snapMove(id, el))
      } else if (mode === 'rotate') {
        let ang = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90
        ang = ((ang + 540) % 360) - 180
        const snap = Math.round(ang / 15) * 15
        if (Math.abs(ang - snap) < 4) ang = snap
        el.rot = Math.round(ang * 10) / 10
      } else if (el.kind === 'text') {
        if (handle === 'r') el.w = clamp(el0.w + dx, 90, PAGE_W)
        else if (handle === 'l') { el.w = clamp(el0.w - dx, 90, PAGE_W); el.x = el0.x + (el0.w - el.w) }
        else {
          const sgn = handle.includes('r') ? 1 : -1
          const w = clamp(el0.w + sgn * dx, 90, PAGE_W)
          el.w = w
          el.fs = clamp(el0.fs * (w / el0.w), 12, 260)
          if (sgn < 0) el.x = el0.x + (el0.w - w)
        }
      } else {
        // paper / image
        if (handle === 'r') el.w = clamp(el0.w + dx, 90, PAGE_W)
        else if (handle === 'l') { el.w = clamp(el0.w - dx, 90, PAGE_W); el.x = el0.x + (el0.w - el.w) }
        else if (handle === 'b') el.h = clamp(el0.h + dy, 90, PAGE_H)
        else if (handle === 't') { el.h = clamp(el0.h - dy, 90, PAGE_H); el.y = el0.y + (el0.h - el.h) }
        else {
          const sgn = handle.includes('r') ? 1 : -1
          const s = clamp((el0.w + sgn * dx) / el0.w, 0.2, 6)
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

    const cleanup = (doCommit) => {
      window.removeEventListener('pointermove', mm)
      window.removeEventListener('pointerup', mu)
      interactRef.current = false
      activeAbortRef.current = null
      setGuides([])
      if (doCommit && moved) commit(designRef.current)
    }
    const mu = () => cleanup(true)
    activeAbortRef.current = () => cleanup(false)
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
        r.selectNodeContents(node); r.collapse(false)
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
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
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
    return true
  }
  const hasLiveSelection = () => {
    if (!editing) return false
    const s = window.getSelection()
    return s && s.rangeCount > 0 && !s.isCollapsed && elNodes.current[editing]?.contains(s.anchorNode)
  }
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
    setSel(null); setEditing(null); commit(next)
  }

  const maxZ = () =>
    clamp(Math.max(0, ...Object.values(designRef.current.elements || {}).map((e) => e.z || 0)) + 1, Z_MIN, Z_MAX)

  // move one step over the immediate neighbour, never below the background
  const layerMove = (id, dir) => {
    const d = designRef.current
    const sorted = Object.entries(d.elements).sort((a, b) => (a[1].z || 0) - (b[1].z || 0))
    const idx = sorted.findIndex(([eid]) => eid === id)
    if (idx < 0) return
    let nz
    if (dir === 'up' && idx < sorted.length - 1) nz = (sorted[idx + 1][1].z || 0) + 0.5
    else if (dir === 'down' && idx > 0) nz = (sorted[idx - 1][1].z || 0) - 0.5
    else return
    patchEl(id, { z: clamp(nz, Z_MIN, Z_MAX) })
  }

  const addPaper = () => {
    const id = 'paper_x' + uid()
    const d = designRef.current
    commit({ ...d, elements: { ...d.elements, [id]: {
      kind: 'paper', sid: null, auto: false, z: maxZ(),
      x: PAGE_W / 2 - 170, y: PAGE_H / 2 - 190, w: 340, h: 390, rot: 2.5, img: null,
    } } })
    setSel(id); setPanelOpen(false)
  }
  const addImage = () => {
    const id = 'image_x' + uid()
    const d = designRef.current
    commit({ ...d, elements: { ...d.elements, [id]: {
      kind: 'image', sid: null, auto: false, z: maxZ(),
      x: PAGE_W / 2 - 250, y: PAGE_H / 2 - 180, w: 500, h: 360, rot: 0, img: null,
    } } })
    setSel(id); setPanelOpen(false)
    openPicker(id)
  }
  const addText = () => {
    const id = 'text_x' + uid()
    const d = designRef.current
    commit({ ...d, elements: { ...d.elements, [id]: {
      kind: 'text', role: 'free', sid: null, auto: false, z: maxZ(),
      x: PAGE_W / 2 - 260, y: PAGE_H / 2 - 40, w: 520, fs: 40,
      rot: 0, align: 'center', bold: false, html: 'نص جديد…',
    } } })
    setSel(id); setPanelOpen(false); enterEditing(id)
  }

  // ---------- images ----------
  const openPicker = (elId) => { pendingImgElRef.current = elId; fileInputRef.current?.click() }

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const elId = pendingImgElRef.current
    const el = designRef.current.elements[elId]
    try {
      const src = await fileToDataUrl(file)
      if (el?.kind === 'image') {
        // plain picture: no crop, keep natural aspect
        const im = await loadImage(src)
        const asp = im.naturalWidth / Math.max(1, im.naturalHeight)
        const imgId = 'img_' + uid()
        await set(pathRef(`projects/${projectId}/images/${imgId}`), src)
        patchEl(elId, { img: imgId, h: Math.round(el.w / asp) })
      } else {
        setEditorFor({ elId, src }) // paper → crop editor
      }
    } catch { toast('تعذّر فتح الصورة', 'warn') }
  }

  const onEditorSave = async (dataUrl) => {
    const { elId } = editorFor
    setEditorFor(null)
    const imgId = 'img_' + uid()
    try {
      await set(pathRef(`projects/${projectId}/images/${imgId}`), dataUrl)
      patchEl(elId, { img: imgId })
    } catch { toast('تعذّر رفع الصورة', 'warn') }
  }

  const removeImgBg = async () => {
    const el = designRef.current.elements[sel]
    if (!el?.img || !images[el.img]) return
    setBgBusy(true)
    toast('نزيل الخلفية… قد يستغرق لحظات ✦')
    try {
      const blob = await removeBackground(images[el.img])
      const out = await blobToDataUrl(blob)
      const imgId = 'img_' + uid()
      await set(pathRef(`projects/${projectId}/images/${imgId}`), out)
      patchEl(sel, { img: imgId })
      toast('أُزيلت الخلفية ✦')
    } catch (err) {
      console.error(err)
      toast('تعذّرت إزالة الخلفية', 'warn')
    } finally { setBgBusy(false) }
  }

  const onDropOnStage = async (e) => {
    e.preventDefault()
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'))
    if (!file) return
    const p = toPage(e)
    const id = 'paper_x' + uid()
    const d = designRef.current
    commit({ ...d, elements: { ...d.elements, [id]: {
      kind: 'paper', sid: null, auto: false, z: maxZ(),
      x: clamp(p.x - 170, 0, PAGE_W - 340), y: clamp(p.y - 190, 0, PAGE_H - 390),
      w: 340, h: 390, rot: -2, img: null,
    } } })
    setSel(id)
    try { setEditorFor({ elId: id, src: await fileToDataUrl(file) }) }
    catch { toast('تعذّر فتح الصورة', 'warn') }
  }

  // ---------- export ----------
  const exportPng = async () => {
    setSel(null); setEditing(null); setExporting(true)
    const prevView = viewRef.current
    applyView({ zoom: 1, x: 0, y: 0 })
    await new Promise((r) => setTimeout(r, 60))
    try {
      const node = pageRef.current
      await Promise.all([...node.querySelectorAll('img')].map((im) =>
        im.decode ? im.decode().catch(() => {}) : Promise.resolve()))
      if (document.fonts?.ready) await document.fonts.ready
      const fontEmbedCSS = await buildFontEmbedCSS().catch(() => '')
      await new Promise((r) => setTimeout(r, 150))
      const opts = {
        width: PAGE_W, height: PAGE_H, pixelRatio: 1, backgroundColor: '#b9906b',
        fontEmbedCSS, style: { transform: 'none' },
        filter: (n) => !(n.classList && n.classList.contains('no-export')),
      }
      await toPng(node, opts)
      const dataUrl = await toPng(node, opts)
      const a = document.createElement('a')
      a.href = dataUrl; a.download = `${project.name || 'صحيفة'}.png`; a.click()
      toast('صُدّرت الصفحة بجودة كاملة ✦')
    } catch (err) {
      console.error(err); toast('تعذّر التصدير، جرّبوا مرة أخرى', 'warn')
    } finally {
      setExporting(false); applyView(prevView)
    }
  }

  // ---------- render ----------
  const selEl = sel ? design.elements?.[sel] : null
  const elements = Object.entries(design.elements || {}).sort((a, b) => (a[1].z || 0) - (b[1].z || 0))

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
              <button key={b.id} className={`bg-thumb ${design.bg === b.id ? 'bg-on' : ''}`} title={b.name}
                      onClick={() => commit({ ...designRef.current, bg: b.id })}>
                <img src={b.src} alt={b.name} />
                <span>{b.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel-group">
          <span className="panel-label">ظلال القماش</span>
          <label className="slider-row">
            <input type="range" min="0" max="1" step="0.01" value={design.shadow ?? 0.45}
              onChange={(e) => { const next = { ...designRef.current, shadow: +e.target.value }; designRef.current = next; setDesign(next); scheduleWrite(next) }}
              onPointerUp={() => commit(designRef.current)} />
            <b className="slider-val">{Math.round((design.shadow ?? 0.45) * 100)}٪</b>
          </label>
        </div>

        <div className="panel-group">
          <span className="panel-label">خط الصفحة</span>
          <PageFontSelect value={design.pageFont || DEFAULT_FONT} allFonts={allFonts}
            onChange={(f) => { loadFont(f); commit({ ...designRef.current, pageFont: f }) }} />
        </div>

        <div className="panel-group">
          <span className="panel-label">إضافة عناصر</span>
          <div className="panel-row">
            <button className="btn btn-ghost btn-s" onClick={addText}><I.text /> نص</button>
            <button className="btn btn-ghost btn-s" onClick={addPaper}><I.paper /> ورقة</button>
            <button className="btn btn-ghost btn-s" onClick={addImage}><I.image /> صورة</button>
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
                <TextTools el={selEl} design={design} allFonts={allFonts} editing={editing === sel}
                  onEdit={() => enterEditing(sel)} applyStyle={applyStyle}
                  patch={(p) => patchEl(sel, p)} saveSelection={saveSelection}
                  onLayer={(d) => layerMove(sel, d)} onDelete={() => deleteEl(sel)} />
              ) : (
                <div className="tools">
                  <button className="btn btn-ghost btn-s" onClick={() => openPicker(sel)}>
                    <I.image /> {selEl.img ? 'تغيير الصورة' : 'إضافة صورة'}
                  </button>
                  {selEl.img && images[selEl.img] && (
                    <button className="btn btn-ghost btn-s"
                            onClick={() => setEditorFor({ elId: sel, src: images[selEl.img] })}>
                      <I.rotate /> قصّ
                    </button>
                  )}
                  {selEl.kind === 'image' && selEl.img && (
                    <button className="btn btn-ghost btn-s" disabled={bgBusy} onClick={removeImgBg}>
                      {bgBusy ? <span className="spinner spinner-s spinner-dark" /> : <I.spark />} إزالة الخلفية
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
              <span className="selbar-hint">اختاروا أي عنصر لتخصيصه — اسحبوا بإصبعين للتكبير، أو اسحبوا الفراغ للتحريك</span>
            )}
          </div>
        </div>

        <div className="stage" ref={stageRef} onDragOver={(e) => e.preventDefault()} onDrop={onDropOnStage}>
          <div className="page-holder"
            style={{ width: PAGE_W * scale, height: PAGE_H * scale,
                     transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            <div ref={pageRef} className={`page ${exporting ? 'exporting' : ''}`} data-light={bg.light}
              style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`,
                       '--page-font': `'${design.pageFont || DEFAULT_FONT}', sans-serif` }}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget || e.target.classList.contains('page-bg')) { exitEditing(); setSel(null) }
              }}>
              <img className="page-bg" src={bg.src} alt="" draggable={false} style={{ zIndex: 0 }} />

              {elements.map(([id, el]) =>
                el.kind === 'text' ? (
                  <TextEl key={id} id={id} el={el} selected={sel === id} editing={editing === id}
                    nodeRef={(n) => (elNodes.current[id] = n)}
                    onDown={(e) => startInteract(e, id, 'move')}
                    onHandle={(e, h) => startInteract(e, id, h === 'rot' ? 'rotate' : 'resize', h)}
                    onDbl={() => enterEditing(id)} onExit={exitEditing} scale={effScale} />
                ) : (
                  <FrameEl key={id} id={id} el={el} img={el.img ? images[el.img] : null} selected={sel === id}
                    nodeRef={(n) => (elNodes.current[id] = n)}
                    onDown={(e) => startInteract(e, id, 'move')}
                    onHandle={(e, h) => startInteract(e, id, h === 'rot' ? 'rotate' : 'resize', h)}
                    onPick={() => openPicker(id)}
                    onDropImage={async (file) => {
                      setSel(id)
                      try { setEditorFor({ elId: id, src: await fileToDataUrl(file) }) }
                      catch { toast('تعذّر فتح الصورة', 'warn') }
                    }}
                    scale={effScale} />
                ),
              )}

              {guides.map((g, i) => (
                <div key={i} className="guide no-export"
                  style={g.axis === 'x'
                    ? { left: g.at, top: 0, width: Math.max(1, 2 / effScale), height: PAGE_H }
                    : { top: g.at, left: 0, height: Math.max(1, 2 / effScale), width: PAGE_W }} />
              ))}

              <img className="shadow-ol" src="./assets/shadow.png" alt="" draggable={false}
                style={{ opacity: design.shadow ?? 0.45 }} />
            </div>
          </div>

          {view.zoom !== 1 && (
            <button className="zoom-reset no-export" onClick={resetView} title="إعادة الضبط">
              {Math.round(view.zoom * 100)}٪ ⟲
            </button>
          )}
        </div>

        <button className="btn btn-primary fab-panel" onClick={() => setPanelOpen(true)}>
          <I.palette /> تخصيص
        </button>
      </div>

      {editorFor && (
        <ImageEditor src={editorFor.src}
          aspect={(() => { const el = design.elements[editorFor.elId]; return el?.kind === 'image' ? (el.w / el.h) : paperAspect(el || { w: 340, h: 390 }) })()}
          onSave={onEditorSave} onClose={() => setEditorFor(null)} />
      )}

      {confirmLeave && (
        <div className="modal-back" onClick={() => setConfirmLeave(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">الخروج من التصميم؟</h3>
            <p className="modal-sub">تغييراتك محفوظة تلقائيًا. هل تريد العودة إلى قائمة الأعداد؟</p>
            <div className="modal-row">
              <button className="btn btn-primary" onClick={() => { setConfirmLeave(false); onLeave?.() }}>نعم، اخرج</button>
              <button className="btn btn-ghost" onClick={() => setConfirmLeave(false)}>البقاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------- text element ----------------
function TextEl({ id, el, selected, editing, nodeRef, onDown, onHandle, onDbl, onExit, scale }) {
  const rtRef = useRef(null)
  const htmlRef = useRef(el.html)
  useEffect(() => {
    if (!editing && rtRef.current && rtRef.current.innerHTML !== el.html) rtRef.current.innerHTML = el.html
  }, [el.html, editing])

  return (
    <div ref={nodeRef}
      className={`el el-text ${selected ? 'el-sel' : ''} ${editing ? 'el-editing' : ''} ${el.role === 'head' ? 'el-head' : ''}`}
      style={{
        left: el.x, top: el.y, width: el.w, fontSize: el.fs,
        transform: `rotate(${el.rot || 0}deg)`, textAlign: el.align || 'right',
        zIndex: Math.round((el.z || 0) * 10) + (selected ? 1 : 0),
        fontFamily: el.font ? `'${el.font}', sans-serif` : undefined,
        color: el.color || undefined,
        fontWeight: el.weight || (el.bold ? 800 : 500),
        fontStyle: el.italic ? 'italic' : undefined,
      }}
      onPointerDown={onDown} onDoubleClick={onDbl}>
      <div ref={rtRef} className="rt" contentEditable={editing} suppressContentEditableWarning
        onBlur={editing ? onExit : undefined} dangerouslySetInnerHTML={{ __html: htmlRef.current }} />
      {selected && !editing && <Handles kind="text" onHandle={onHandle} scale={scale} />}
    </div>
  )
}

// ---------------- paper / plain-image element ----------------
function FrameEl({ id, el, img, selected, nodeRef, onDown, onHandle, onPick, onDropImage, scale }) {
  const [over, setOver] = useState(false)
  const isPaper = el.kind === 'paper'
  return (
    <div ref={nodeRef}
      className={`el ${isPaper ? 'el-paper' : 'el-image'} ${selected ? 'el-sel' : ''} ${over ? 'el-over' : ''}`}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h,
               transform: `rotate(${el.rot || 0}deg)`, zIndex: Math.round((el.z || 0) * 10) + (selected ? 1 : 0) }}
      onPointerDown={onDown}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setOver(false)
        const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'))
        if (f) onDropImage(f)
      }}>
      {isPaper ? (
        <>
          <div className="paper-body">
            <div className="paper-img-wrap">
              {img ? <img src={img} alt="" draggable={false} />
                : <button className="paper-empty no-export" onPointerDown={(e) => e.stopPropagation()} onClick={onPick}>
                    <I.image /><span>أضيفوا صورة</span>
                  </button>}
            </div>
          </div>
          <span className="tape tape-a" />
          <span className="tape tape-b" />
        </>
      ) : (
        <div className="image-wrap">
          {img ? <img src={img} alt="" draggable={false} />
            : <button className="paper-empty no-export" onPointerDown={(e) => e.stopPropagation()} onClick={onPick}>
                <I.image /><span>أضيفوا صورة</span>
              </button>}
        </div>
      )}
      {selected && <Handles kind={isPaper ? 'paper' : 'image'} onHandle={onHandle} scale={scale} />}
    </div>
  )
}

// ---------------- selection handles ----------------
const HANDLE_SETS = {
  text: ['tl', 'tr', 'bl', 'br', 'l', 'r', 'rot'],
  paper: ['tl', 'tr', 'bl', 'br', 'l', 'r', 't', 'b', 'rot'],
  image: ['tl', 'tr', 'bl', 'br', 'l', 'r', 't', 'b', 'rot'],
}
function Handles({ kind, onHandle, scale }) {
  const s = clamp(16 / scale, 14, 90)
  return (
    <div className="handles no-export" style={{ '--hs': `${s}px` }}>
      <div className="sel-outline" />
      {HANDLE_SETS[kind].map((h) => (
        <span key={h} className={`handle handle-${h}`} onPointerDown={(e) => onHandle(e, h)} />
      ))}
    </div>
  )
}

// ---------------- font helpers ----------------
const NAMED = Object.fromEntries([...BRAND_FONTS, ...ARABIC_FONTS].map((f) => [f.id, f.name]))
const fontLabel = (id) => NAMED[id] || id

function PageFontSelect({ value, allFonts, onChange }) {
  return (
    <select className="input select" value={value} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="خطوط المدونة">
        {BRAND_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </optgroup>
      <optgroup label="خطوط عربية">
        {ARABIC_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </optgroup>
      <optgroup label="كل خطوط جوجل">
        {(allFonts || []).map((f) => <option key={f} value={f}>{f}</option>)}
      </optgroup>
    </select>
  )
}

// searchable font dropdown for the text toolbar
function FontMenu({ open, anchorRef, allFonts, current, onPick, onClose }) {
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? (allFonts || []).filter((f) => f.toLowerCase().includes(q.toLowerCase())).slice(0, 80)
    : null
  return (
    <Pop open={open} anchorRef={anchorRef} onClose={onClose} className="pop-fonts">
      <input className="font-search" placeholder="ابحث عن خط…" value={q} autoFocus
        onPointerDown={(e) => e.stopPropagation()} onChange={(e) => setQ(e.target.value)} />
      <div className="font-list">
        {!filtered && (
          <>
            <div className="font-sec">خطوط المدونة</div>
            {BRAND_FONTS.map((f) => (
              <button key={f.id} className={`pop-item ${current === f.id ? 'pop-on' : ''}`}
                style={{ fontFamily: `'${f.id}'` }} onPointerDown={(e) => e.preventDefault()}
                onClick={() => onPick(f.id)}>{f.name}</button>
            ))}
            <div className="font-sec">خطوط عربية</div>
            {ARABIC_FONTS.map((f) => (
              <button key={f.id} className={`pop-item ${current === f.id ? 'pop-on' : ''}`}
                style={{ fontFamily: `'${f.id}'` }} onPointerDown={(e) => e.preventDefault()}
                onClick={() => onPick(f.id)}>{f.name}</button>
            ))}
            <div className="font-sec">كل خطوط جوجل</div>
          </>
        )}
        {(filtered || allFonts || []).slice(0, filtered ? 80 : 120).map((f) => (
          <button key={f} className={`pop-item ${current === f ? 'pop-on' : ''}`}
            onPointerDown={(e) => e.preventDefault()} onClick={() => onPick(f)}>{f}</button>
        ))}
      </div>
    </Pop>
  )
}

// ---------------- text toolbar ----------------
function TextTools({ el, design, allFonts, editing, onEdit, applyStyle, patch, saveSelection, onLayer, onDelete }) {
  const [fontsOpen, setFontsOpen] = useState(false)
  const [colorsOpen, setColorsOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  const fontBtnRef = useRef(null)
  const colorBtnRef = useRef(null)
  const weightBtnRef = useRef(null)
  const noFocus = (e) => e.preventDefault()

  const curFont = el.font || design.pageFont || DEFAULT_FONT
  const align = el.align || 'right'
  const alignNext = { right: 'center', center: 'left', left: 'right' }
  const AlignIcon = align === 'right' ? I.alignR : align === 'center' ? I.alignC : I.alignL
  const weights = fontWeightsFor(curFont)
  const curWeight = el.weight || (el.bold ? 700 : 400)

  const pickFont = (f) => { loadFont(f); applyStyle('fontName', f, { font: f }); setFontsOpen(false) }

  return (
    <div className="tools">
      {!editing && (
        <button className="btn btn-ghost btn-s" onPointerDown={noFocus} onClick={onEdit}>
          <I.pencil /> تحرير النص
        </button>
      )}

      <button ref={fontBtnRef} className="btn btn-ghost btn-s font-btn"
        onPointerDown={(e) => { noFocus(e); saveSelection() }}
        onClick={() => { setFontsOpen((o) => !o); setColorsOpen(false); setWeightOpen(false) }}
        style={{ fontFamily: `'${curFont}'` }}>
        {fontLabel(curFont)} ▾
      </button>
      <FontMenu open={fontsOpen} anchorRef={fontBtnRef} allFonts={allFonts} current={curFont}
        onPick={pickFont} onClose={() => setFontsOpen(false)} />

      {/* weight */}
      <button ref={weightBtnRef} className="btn btn-ghost btn-s" onPointerDown={noFocus}
        onClick={() => { setWeightOpen((o) => !o); setFontsOpen(false); setColorsOpen(false) }}>
        {curWeight} ▾
      </button>
      <Pop open={weightOpen} anchorRef={weightBtnRef} onClose={() => setWeightOpen(false)}>
        {weights.map((w) => (
          <button key={w} className={`pop-item ${curWeight === w ? 'pop-on' : ''}`}
            style={{ fontWeight: w }} onPointerDown={noFocus}
            onClick={() => { patch({ weight: w, bold: w >= 600 }); setWeightOpen(false) }}>
            {w}
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

      <button className={`icon-btn ${el.bold ? 'icon-on' : ''}`} title="عريض" onPointerDown={noFocus}
        onClick={() => applyStyle('bold', null, { bold: !el.bold, weight: !el.bold ? 700 : 400 })}><I.bold /></button>
      <button className={`icon-btn ${el.italic ? 'icon-on' : ''}`} title="مائل" onPointerDown={noFocus}
        onClick={() => applyStyle('italic', null, { italic: !el.italic })}><I.italic /></button>

      {/* color */}
      <button ref={colorBtnRef} className="icon-btn color-btn" title="لون النص"
        onPointerDown={(e) => { noFocus(e); saveSelection() }}
        onClick={() => { setColorsOpen((o) => !o); setFontsOpen(false); setWeightOpen(false) }}>
        <span className="color-dot" style={{ background: el.color || 'var(--ink-ui)' }} />
      </button>
      <Pop open={colorsOpen} anchorRef={colorBtnRef} onClose={() => setColorsOpen(false)} className="pop-colors">
        {SWATCHES.map((c) => (
          <button key={c} className="swatch" style={{ background: c }} onPointerDown={noFocus}
            onClick={() => { applyStyle('foreColor', c, { color: c }); setColorsOpen(false) }} />
        ))}
        <label className="swatch swatch-custom" onPointerDown={saveSelection} title="لون مخصص">
          <input type="color" onChange={(e) => applyStyle('foreColor', e.target.value, { color: e.target.value })} />
          +
        </label>
        <button className="pop-item pop-reset" onPointerDown={noFocus}
          onClick={() => { patch({ color: null }); setColorsOpen(false) }}>اللون التلقائي</button>
      </Pop>

      <button className="icon-btn" title="المحاذاة" onPointerDown={noFocus}
        onClick={() => patch({ align: alignNext[align] })}><AlignIcon /></button>

      <span className="selbar-sep" />
      <button className="icon-btn" title="للأمام" onPointerDown={noFocus} onClick={() => onLayer('up')}><I.up /></button>
      <button className="icon-btn" title="للخلف" onPointerDown={noFocus} onClick={() => onLayer('down')}><I.down /></button>
      <button className="icon-btn icon-btn-danger" title="حذف" onPointerDown={noFocus} onClick={onDelete}><I.trash /></button>
    </div>
  )
}

// Portal dropdown anchored under a trigger (toolbar has overflow that would clip it).
function Pop({ open, anchorRef, onClose, className = '', children }) {
  const [pos, setPos] = useState(null)
  const popRef = useRef(null)
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const a = anchorRef.current
      if (!a) return
      const r = a.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
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
    <div ref={popRef} className={`pop pop-portal ${className}`} style={{ top: pos.top, right: pos.right }}>
      {children}
    </div>,
    document.body,
  )
}
