import React, { useContext, useEffect, useState } from 'react'
import { projectsRef, projectRef, onValue, push, set, update, remove, pathRef } from '../firebase.js'
import { ACCENTS, BGS, fmtDate, uid } from '../model.js'
import { I } from '../icons.jsx'
import { ToastCtx } from '../App.jsx'

export default function ProjectChooser({ onOpen }) {
  const [projects, setProjects] = useState(null)
  const [naming, setNaming] = useState(false) // false | 'new' | projectId
  const [confirmDel, setConfirmDel] = useState(null)
  const toast = useContext(ToastCtx)

  useEffect(() => {
    const off = onValue(projectsRef(), (snap) => {
      const v = snap.val() || {}
      setProjects(
        Object.entries(v)
          .map(([id, p]) => ({ id, ...p }))
          .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)),
      )
    }, () => setProjects([]))
    return off
  }, [])

  const createProject = async (name) => {
    const sid = 's_' + uid()
    const r = push(projectsRef())
    await set(r, {
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      writing: {
        saved: false,
        sections: { [sid]: { title: '', body: '', order: 0 } },
      },
    })
    toast('انطلقنا! مشروع جديد ✦')
    onOpen(r.key)
  }

  const renameProject = async (id, name) => {
    await update(projectRef(id), { name, updatedAt: Date.now() })
    toast('تم تغيير الاسم')
  }

  const deleteProject = async (id) => {
    await remove(projectRef(id))
    setConfirmDel(null)
    toast('حُذف المشروع', 'warn')
  }

  return (
    <div className="chooser">
      <header className="chooser-head">
        <img src="./assets/logo.svg" alt="مدونة" className="brand-logo" />
        <h1 className="chooser-title">
          استوديو <span className="ttl-accent">الصحيفة</span>
        </h1>
        <p className="chooser-sub">اختاروا عددًا للعمل عليه معًا، أو ابدأوا عددًا جديدًا</p>
      </header>

      {projects === null ? (
        <div className="loading"><span className="spinner" /> نجهّز المكتب…</div>
      ) : (
        <div className="grid">
          <button className="card card-new" onClick={() => setNaming('new')}>
            <span className="card-new-plus"><I.plus /></span>
            <span className="card-new-label">عدد جديد</span>
          </button>

          {projects.map((p, i) => {
            const bg = BGS.find((b) => b.id === (p.design?.bg || 1)) || BGS[0]
            const accent = ACCENTS[i % ACCENTS.length]
            return (
              <div key={p.id} className="card card-project" style={{ '--accent': accent }}
                   onClick={() => onOpen(p.id)} role="button" tabIndex={0}
                   onKeyDown={(e) => e.key === 'Enter' && onOpen(p.id)}>
                <div className="card-cover">
                  <img src={bg.src} alt="" loading="lazy" />
                  <span className="card-badge" style={{ background: accent }}>
                    {p.writing?.saved ? 'جاهز للتصميم' : 'قيد الكتابة'}
                  </span>
                </div>
                <div className="card-info">
                  <h3 className="card-name">{p.name}</h3>
                  <span className="card-date">{fmtDate(p.updatedAt || p.createdAt)}</span>
                </div>
                <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn" title="إعادة تسمية" onClick={() => setNaming(p.id)}>
                    <I.pencil />
                  </button>
                  <button className="icon-btn icon-btn-danger" title="حذف" onClick={() => setConfirmDel(p)}>
                    <I.trash />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {naming && (
        <NameModal
          initial={naming === 'new' ? '' : projects?.find((p) => p.id === naming)?.name || ''}
          title={naming === 'new' ? 'ما اسم العدد الجديد؟' : 'الاسم الجديد'}
          cta={naming === 'new' ? 'إنشاء' : 'حفظ'}
          onClose={() => setNaming(false)}
          onSubmit={(name) => {
            if (naming === 'new') createProject(name)
            else renameProject(naming, name)
            setNaming(false)
          }}
        />
      )}

      {confirmDel && (
        <div className="modal-back" onClick={() => setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">حذف «{confirmDel.name}»؟</h3>
            <p className="modal-sub">سيختفي العدد نهائيًا لكل الفريق، ولا يمكن التراجع.</p>
            <div className="modal-row">
              <button className="btn btn-danger" onClick={() => deleteProject(confirmDel.id)}>
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

export function NameModal({ initial, title, cta, onSubmit, onClose }) {
  const [name, setName] = useState(initial)
  const ok = name.trim().length > 0
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <input
          autoFocus
          className="input"
          value={name}
          maxLength={60}
          placeholder="مثال: عدد شهر رجب"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok && onSubmit(name.trim())}
        />
        <div className="modal-row">
          <button className="btn btn-primary" disabled={!ok} onClick={() => onSubmit(name.trim())}>
            {cta}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}
