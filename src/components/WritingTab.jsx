import React, { useContext, useEffect, useRef, useState } from 'react'
import { pathRef, update, get } from '../firebase.js'
import { ACCENTS, MAX_SECTIONS, orderedSections, syncDesignWithWriting, uid } from '../model.js'
import { I } from '../icons.jsx'
import { ToastCtx } from '../App.jsx'

export default function WritingTab({ projectId, project, onSaved }) {
  const toast = useContext(ToastCtx)
  const [sections, setSections] = useState(() => orderedSections(project.writing))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null) // section id pending delete
  const focusedRef = useRef(null) // "sid:title" | "sid:body" | null

  // merge live edits from teammates, but never clobber the field being typed in
  useEffect(() => {
    const incoming = orderedSections(project.writing)
    setSections((cur) => {
      const focused = focusedRef.current
      return incoming.map((inc) => {
        const mine = cur.find((s) => s.id === inc.id)
        if (!mine) return inc
        const out = { ...inc }
        if (focused === `${inc.id}:title`) out.title = mine.title
        if (focused === `${inc.id}:body`) out.body = mine.body
        return out
      })
    })
  }, [project.writing])

  const patch = (sid, field, value) => {
    setSections((cur) => cur.map((s) => (s.id === sid ? { ...s, [field]: value } : s)))
    setErrors((e) => ({ ...e, [`${sid}:${field}`]: false }))
    // lightweight live sync while typing (no save semantics)
    clearTimeout(patch._t?.[`${sid}${field}`])
    patch._t = patch._t || {}
    patch._t[`${sid}${field}`] = setTimeout(() => {
      update(pathRef(`projects/${projectId}/writing/sections/${sid}`), { [field]: value })
    }, 600)
  }

  const addSection = () => {
    if (sections.length >= MAX_SECTIONS) return
    const s = { id: 's_' + uid(), title: '', body: '', order: sections.length }
    setSections((c) => [...c, s])
    update(pathRef(`projects/${projectId}/writing/sections/${s.id}`), {
      title: '', body: '', order: s.order,
    })
  }

  const removeSection = (sid) => {
    if (sections.length <= 1) return
    const rest = sections.filter((s) => s.id !== sid)
    setSections(rest)
    const writes = { [`projects/${projectId}/writing/sections/${sid}`]: null }
    rest.forEach((s, i) => {
      writes[`projects/${projectId}/writing/sections/${s.id}/order`] = i
    })
    update(pathRef(''), writes)
  }

  const save = async () => {
    const errs = {}
    sections.forEach((s) => {
      if (!s.title.trim()) errs[`${s.id}:title`] = true
      if (!s.body.trim()) errs[`${s.id}:body`] = true
    })
    setErrors(errs)
    if (Object.keys(errs).length) {
      toast('أكملوا كل العناوين والنصوص قبل الحفظ', 'warn')
      return
    }
    setSaving(true)
    try {
      const secObj = {}
      sections.forEach((s, i) => {
        secObj[s.id] = { title: s.title.trim(), body: s.body.trim(), order: i }
      })
      // rebuild design from the latest stored copy, then merge new text into it
      const dSnap = await get(pathRef(`projects/${projectId}/design`))
      const design = syncDesignWithWriting(
        dSnap.val(),
        sections.map((s, i) => ({ id: s.id, title: s.title.trim(), body: s.body.trim(), order: i })),
      )
      await update(pathRef(`projects/${projectId}`), {
        writing: { saved: true, sections: secObj },
        design,
        updatedAt: Date.now(),
      })
      toast('حُفظت الكتابة — تم فتح التصميم ✦')
      onSaved?.()
    } catch (e) {
      console.error(e)
      toast('تعذّر الحفظ، تحققوا من الاتصال', 'warn')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="write">
      <div className="write-inner">
        {sections.map((s, i) => (
          <section key={s.id} className="sheet" style={{ '--accent': ACCENTS[i % 4] }}>
            <div className="sheet-top">
              <span className="sheet-num">{i + 1}</span>
              <span className="sheet-label">مقطع</span>
              {sections.length > 1 && (
                <button className="icon-btn icon-btn-danger sheet-del" title="حذف المقطع"
                        onClick={() => setConfirmDel(s.id)}>
                  <I.trash />
                </button>
              )}
            </div>
            <input
              className={`sheet-title ${errors[`${s.id}:title`] ? 'field-err' : ''}`}
              placeholder="عنوان المقطع…"
              value={s.title}
              maxLength={120}
              dir="rtl"
              onFocus={() => (focusedRef.current = `${s.id}:title`)}
              onBlur={() => (focusedRef.current = null)}
              onChange={(e) => patch(s.id, 'title', e.target.value)}
            />
            <AutoTextarea
              className={`sheet-body ${errors[`${s.id}:body`] ? 'field-err' : ''}`}
              placeholder="اكتبوا نص الخبر هنا… اجعلوه قصيرًا وممتعًا"
              value={s.body}
              dir="rtl"
              onFocus={() => (focusedRef.current = `${s.id}:body`)}
              onBlur={() => (focusedRef.current = null)}
              onChange={(e) => patch(s.id, 'body', e.target.value)}
            />
          </section>
        ))}

        <div className="write-actions">
          {sections.length < MAX_SECTIONS && (
            <button className="btn btn-ghost btn-add" onClick={addSection}>
              <I.plus /> إضافة مقطع ({sections.length}/{MAX_SECTIONS})
            </button>
          )}
          <button className="btn btn-primary btn-save" disabled={saving} onClick={save}>
            {saving ? <span className="spinner spinner-s" /> : <I.check />}
            حفظ وفتح التصميم
          </button>
        </div>
      </div>

      {confirmDel && (
        <div className="modal-back" onClick={() => setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">حذف هذا المقطع؟</h3>
            <p className="modal-sub">سيُحذف عنوان المقطع ونصّه، ولا يمكن التراجع.</p>
            <div className="modal-row">
              <button className="btn btn-danger" onClick={() => { removeSection(confirmDel); setConfirmDel(null) }}>
                <I.trash /> نعم، احذفه
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>تراجع</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AutoTextarea(props) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 2 + 'px'
  }, [props.value])
  return <textarea ref={ref} rows={4} {...props} />
}
