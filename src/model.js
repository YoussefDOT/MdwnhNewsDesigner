// ---------- constants ----------
export const PAGE_W = 2048
export const PAGE_H = 1365

// Safe content area measured from the baked-in header/footer of the backgrounds
export const AREA = { L: 72, R: 1976, T: 275, B: 1175 }

export const BGS = [
  { id: 1, name: 'ورق كرافت', light: false, src: './assets/bg1.png' },
  { id: 2, name: 'أزرق ليلي', light: true, src: './assets/bg2.png' },
  { id: 3, name: 'أخضر سبورة', light: true, src: './assets/bg3.png' },
  { id: 4, name: 'أسود فحمي', light: true, src: './assets/bg4.png' },
]

export const FONTS = [
  { id: 'Baloo Bhaijaan 2', name: 'بالو (الأساسي)' },
  { id: 'Cairo', name: 'القاهرة' },
  { id: 'Amiri', name: 'أميري' },
  { id: 'Reem Kufi', name: 'ريم كوفي' },
  { id: 'Marhey', name: 'مرحي' },
  { id: 'Lalezar', name: 'لاله زار' },
]

export const ACCENTS = ['#E54B2A', '#F3C02B', '#41B9A6', '#0B6EB9']

export const SWATCHES = [
  '#262626', '#ffffff', '#E54B2A', '#F3C02B', '#41B9A6', '#0B6EB9',
  '#8E44AD', '#E91E8C',
]

export const MAX_SECTIONS = 4

export const uid = () => Math.random().toString(36).slice(2, 9)

// ---------- html helpers ----------
export const esc = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const textToHtml = (s = '') => esc(s.trim()).replace(/\n/g, '<br>')

// strip scripts / event handlers from html coming back from the DB
export const sanitize = (html = '') =>
  html
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')

// ---------- default layout ----------
// Sections flow newspaper-style (RTL): first fills the right column, then left.
// Returns { [sid]: { head:{x,y,w,fs}, body:{x,y,w,h,fs}, paper:{x,y,w,h,rot} } }
export function defaultLayout(sectionIds, hasPaper = {}) {
  const n = sectionIds.length
  const W = AREA.R - AREA.L
  const H = AREA.B - AREA.T
  const GX = 56
  const GY = 44

  // cell list in order: [x, y, w, h]
  let cells = []
  const colW = (W - GX) / 2
  const rowH = (H - GY) / 2
  const rightX = AREA.L + colW + GX // right column (RTL first)
  if (n === 1) {
    cells = [[AREA.L + W * 0.1, AREA.T + 30, W * 0.8, H - 60]]
  } else if (n === 2) {
    cells = [
      [rightX, AREA.T, colW, H],
      [AREA.L, AREA.T, colW, H],
    ]
  } else if (n === 3) {
    cells = [
      [rightX, AREA.T, colW, rowH],
      [rightX, AREA.T + rowH + GY, colW, rowH],
      [AREA.L, AREA.T, colW, H],
    ]
  } else {
    cells = [
      [rightX, AREA.T, colW, rowH],
      [rightX, AREA.T + rowH + GY, colW, rowH],
      [AREA.L, AREA.T, colW, rowH],
      [AREA.L, AREA.T + rowH + GY, colW, rowH],
    ]
  }

  const out = {}
  sectionIds.forEach((sid, i) => {
    const [cx, cy, cw, ch] = cells[Math.min(i, cells.length - 1)]
    const tall = ch > rowH * 1.4
    const withPaper = hasPaper[sid] !== false
    const pw = tall ? 400 : 320
    const ph = tall ? 470 : 360
    const headH = tall ? 110 : 96
    const gap = 36
    const bodyW = withPaper ? cw - pw - gap : cw
    const rots = [-3.5, 2.8, -2.2, 3.6]
    out[sid] = {
      head: { x: cx, y: cy, w: cw, fs: tall ? 60 : 52 },
      body: {
        x: withPaper ? cx + pw + gap : cx,
        y: cy + headH,
        w: bodyW,
        fs: tall ? 36 : 33,
      },
      paper: {
        x: cx,
        y: cy + headH + 8,
        w: pw,
        h: ph,
        rot: rots[i % 4],
      },
    }
  })
  return out
}

// ---------- design state ----------
export const defaultDesign = () => ({
  bg: 1,
  shadow: 0.45,
  pageFont: 'Baloo Bhaijaan 2',
  elements: {},
  meta: {},
  deletedPapers: {},
})

export function orderedSections(writing) {
  if (!writing?.sections) return []
  return Object.entries(writing.sections)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => (a.order ?? 0) - (b.order ??  0))
}

// Merge freshly-saved writing content into an existing design.
// - creates missing elements at default layout positions
// - refreshes text of elements whose source text changed
// - re-flows elements still in "auto" position when section count changes
// - never resurrects papers the user deleted
export function syncDesignWithWriting(designIn, sections) {
  const d = designIn ? JSON.parse(JSON.stringify(designIn)) : defaultDesign()
  d.elements = d.elements || {}
  d.meta = d.meta || {}
  d.deletedPapers = d.deletedPapers || {}

  const ids = sections.map((s) => s.id)
  const hasPaper = {}
  ids.forEach((sid) => {
    hasPaper[sid] = !d.deletedPapers[sid]
  })
  const lay = defaultLayout(ids, hasPaper)

  // drop elements belonging to removed sections
  for (const [eid, el] of Object.entries(d.elements)) {
    if (el.sid && !ids.includes(el.sid)) delete d.elements[eid]
  }
  for (const sid of Object.keys(d.meta)) if (!ids.includes(sid)) delete d.meta[sid]

  const countChanged = (d.meta.__count ?? -1) !== ids.length

  sections.forEach((s, i) => {
    const sid = s.id
    const L = lay[sid]
    const prev = d.meta[sid] || {}
    const hid = `head_${sid}`
    const bid = `body_${sid}`
    const pid = `paper_${sid}`

    // headline
    if (!d.elements[hid]) {
      d.elements[hid] = {
        kind: 'text', role: 'head', sid, auto: true, z: 30 + i,
        x: L.head.x, y: L.head.y, w: L.head.w, fs: L.head.fs,
        rot: 0, align: 'right', bold: true,
        html: textToHtml(s.title),
      }
    } else {
      if (prev.title !== s.title) d.elements[hid].html = textToHtml(s.title)
      if (d.elements[hid].auto && countChanged)
        Object.assign(d.elements[hid], { x: L.head.x, y: L.head.y, w: L.head.w })
    }

    // body
    if (!d.elements[bid]) {
      d.elements[bid] = {
        kind: 'text', role: 'body', sid, auto: true, z: 20 + i,
        x: L.body.x, y: L.body.y, w: L.body.w, fs: L.body.fs,
        rot: 0, align: 'right', bold: false,
        html: textToHtml(s.body),
      }
    } else {
      if (prev.body !== s.body) d.elements[bid].html = textToHtml(s.body)
      if (d.elements[bid].auto && countChanged)
        Object.assign(d.elements[bid], { x: L.body.x, y: L.body.y, w: L.body.w })
    }

    // taped paper (unless user deleted it)
    if (!d.elements[pid] && !d.deletedPapers[sid]) {
      d.elements[pid] = {
        kind: 'paper', sid, auto: true, z: 10 + i,
        x: L.paper.x, y: L.paper.y, w: L.paper.w, h: L.paper.h,
        rot: L.paper.rot, img: null,
      }
    } else if (d.elements[pid]?.auto && countChanged) {
      Object.assign(d.elements[pid], {
        x: L.paper.x, y: L.paper.y, w: L.paper.w, h: L.paper.h,
      })
    }

    d.meta[sid] = { title: s.title, body: s.body }
  })

  d.meta.__count = ids.length
  return d
}

// When a section's default paper is deleted, let the text breathe into the space
export function expandBodyAfterPaperDelete(d, sid, sectionIds) {
  const bid = `body_${sid}`
  const el = d.elements[bid]
  if (!el || !el.auto) return
  const hasPaper = {}
  sectionIds.forEach((id) => {
    hasPaper[id] = id === sid ? false : !d.deletedPapers[id]
  })
  const lay = defaultLayout(sectionIds, hasPaper)
  if (lay[sid]) Object.assign(el, { x: lay[sid].body.x, w: lay[sid].body.w })
}

export const fmtDate = (ts) => {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }).format(ts)
  } catch {
    return ''
  }
}
