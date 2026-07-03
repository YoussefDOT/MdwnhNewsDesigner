import React, { useEffect, useState } from 'react'
import { projectRef, onValue } from '../firebase.js'
import WritingTab from './WritingTab.jsx'
import DesignTab from './DesignTab.jsx'
import { I } from '../icons.jsx'

export default function ProjectView({ projectId, onBack }) {
  const [project, setProject] = useState(undefined)
  const [tab, setTab] = useState('write')

  useEffect(() => {
    const off = onValue(projectRef(projectId), (snap) => setProject(snap.val()))
    return off
  }, [projectId])

  if (project === undefined)
    return <div className="loading full"><span className="spinner" /> نفتح العدد…</div>
  if (project === null)
    return (
      <div className="loading full">
        هذا العدد لم يعد موجودًا
        <button className="btn btn-primary" onClick={onBack}>عودة</button>
      </div>
    )

  const designUnlocked = !!project.writing?.saved

  return (
    <div className="project">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} title="كل الأعداد"><I.back /></button>
        <div className="topbar-name" title={project.name}>{project.name}</div>
        <nav className="tabs">
          <button className={`tab ${tab === 'write' ? 'tab-on' : ''}`} onClick={() => setTab('write')}>
            <I.pencil /> الكتابة
          </button>
          <button
            className={`tab ${tab === 'design' ? 'tab-on' : ''} ${!designUnlocked ? 'tab-locked' : ''}`}
            onClick={() => designUnlocked && setTab('design')}
            title={designUnlocked ? '' : 'احفظوا الكتابة أولًا لفتح التصميم'}
          >
            <I.palette /> التصميم {!designUnlocked && <span className="lock">🔒</span>}
          </button>
        </nav>
        <img src="./assets/logo.svg" alt="" className="topbar-logo" />
      </header>

      {tab === 'write' ? (
        <WritingTab projectId={projectId} project={project} onSaved={() => setTab('design')} />
      ) : (
        <DesignTab projectId={projectId} project={project} />
      )}
    </div>
  )
}
