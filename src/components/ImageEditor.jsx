import React, { useEffect, useRef, useState } from 'react'
import { I } from '../icons.jsx'

// Crop / pan / zoom / rotate an image into a fixed aspect frame.
// onSave receives a JPEG dataURL already cut to the frame.
export default function ImageEditor({ src, aspect, onSave, onClose }) {
  const [img, setImg] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [rot, setRot] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const frameRef = useRef(null)
  const dragRef = useRef(null)
  const [frameSize, setFrameSize] = useState({ w: 10, h: 10 })

  useEffect(() => {
    const im = new Image()
    im.onload = () => setImg(im)
    im.src = src
  }, [src])

  useEffect(() => {
    const measure = () => {
      const el = frameRef.current
      if (el) setFrameSize({ w: el.clientWidth, h: el.clientHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [aspect, img])

  const baseScale = img
    ? Math.max(frameSize.w / img.naturalWidth, frameSize.h / img.naturalHeight)
    : 1

  const onPointerDown = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
  }
  const onPointerMove = (e) => {
    if (!dragRef.current) return
    const d = dragRef.current
    setPos({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) })
  }
  const onPointerUp = () => (dragRef.current = null)

  const save = () => {
    if (!img) return
    const outW = 1200
    const outH = Math.round(1200 / aspect)
    const c = document.createElement('canvas')
    c.width = outW
    c.height = outH
    const ctx = c.getContext('2d')
    const sf = outW / frameSize.w
    ctx.fillStyle = '#eee'
    ctx.fillRect(0, 0, outW, outH)
    ctx.translate(outW / 2 + pos.x * sf, outH / 2 + pos.y * sf)
    ctx.rotate((rot * Math.PI) / 180)
    const s = zoom * baseScale * sf
    ctx.scale(s, s)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    onSave(c.toDataURL('image/jpeg', 0.88))
  }

  return (
    <div className="modal-back modal-back-dark" onClick={onClose}>
      <div className="modal modal-editor" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title"><I.image /> ضبط الصورة</h3>

        <div
          ref={frameRef}
          className="crop-frame"
          style={{ aspectRatio: `${aspect}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {img && (
            <img
              src={src}
              alt=""
              draggable={false}
              className="crop-img"
              style={{
                transform: `translate(-50%,-50%) translate(${pos.x}px, ${pos.y}px) rotate(${rot}deg) scale(${zoom * baseScale})`,
              }}
            />
          )}
          <div className="crop-grid" />
        </div>

        <label className="slider-row">
          <I.zoomIn />
          <input type="range" min="1" max="4" step="0.01" value={zoom}
                 onChange={(e) => setZoom(+e.target.value)} />
        </label>
        <label className="slider-row">
          <I.rotate />
          <input type="range" min="-180" max="180" step="1" value={rot}
                 onChange={(e) => setRot(+e.target.value)} />
          <button className="icon-btn" title="تدوير ٩٠°"
                  onClick={() => setRot((r) => (r + 90 > 180 ? r - 270 : r + 90))}>
            <I.rotate />
          </button>
        </label>

        <div className="modal-row">
          <button className="btn btn-primary" onClick={save}><I.check /> حفظ الصورة</button>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}

// Read a picked/dropped file, downscale to keep DB payloads sane
export function fileToDataUrl(file, maxDim = 1600) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = reject
    fr.onload = () => {
      const im = new Image()
      im.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(im.naturalWidth, im.naturalHeight))
        if (scale === 1 && file.size < 900_000) return resolve(fr.result)
        const c = document.createElement('canvas')
        c.width = Math.round(im.naturalWidth * scale)
        c.height = Math.round(im.naturalHeight * scale)
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', 0.9))
      }
      im.onerror = reject
      im.src = fr.result
    }
    fr.readAsDataURL(file)
  })
}
