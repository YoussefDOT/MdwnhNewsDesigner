import React, { useEffect, useRef, useState } from 'react'
import { projectRef, onValue } from '../firebase.js'
import WritingTab from './WritingTab.jsx'
import DesignTab from './DesignTab.jsx'
import { I } from '../icons.jsx'

export default function ProjectView({ projectId, onBack }) {
  const [project, setProject] = useState(undefined)
  const [tab, setTab] = useState('write')
  const barRef = useRef(null)

  useEffect(() => {
    const off = onValue(projectRef(projectId), (snap) => setProject(snap.val()))
    return off
  }, [projectId])

  // the design toolbar sticks *below* the sticky topbar — publish the topbar's
  // real height (it wraps to two rows on mobile) so it can offset itself
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const apply = () =>
      el.parentElement?.style.setProperty('--topbar-h', el.offsetHeight + 'px')
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [project === undefined || project === null])

  // switching tabs while scrolled down otherwise lands mid-page, with the
  // design toolbar tucked out of sight under the topbar
  useEffect(() => { window.scrollTo(0, 0) }, [tab])

  if (project === undefined)
    return <div className="loading full"><span className="spinner" /> نفتح العدد…</div>
  if (project === null)
    return (
      <div className="loading full">
        هذا العدد لم يعد موجودًا
        <button className="btn btn-primary" onClick={onBack}>عودة</button>
      </div>
    )

  return (
    <div className="project">
      <header className="topbar" ref={barRef}>
        <button className="icon-btn" onClick={onBack} title="كل الأعداد"><I.back /></button>
        <div className="topbar-name" title={project.name}>{project.name}</div>
        <nav className="tabs">
          <button className={`tab ${tab === 'write' ? 'tab-on' : ''}`} onClick={() => setTab('write')}>
            <I.pencil /> الكتابة
          </button>
          <button className={`tab ${tab === 'design' ? 'tab-on' : ''}`} onClick={() => setTab('design')}>
            <I.palette /> التصميم
          </button>
        </nav>
        <img src="./assets/logo.svg" alt="" className="topbar-logo" />
      </header>

      {tab === 'write' ? (
        <WritingTab projectId={projectId} project={project}
          onSaved={() => setTab('design')} onGoDesign={() => setTab('design')} />
      ) : (
        <DesignTab projectId={projectId} project={project} onLeave={onBack} />
      )}
    </div>
  )
}
