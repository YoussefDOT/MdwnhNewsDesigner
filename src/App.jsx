import React, { useEffect, useState } from 'react'
import ProjectChooser from './components/ProjectChooser.jsx'
import ProjectView from './components/ProjectView.jsx'
import Gate, { isUnlocked } from './components/Gate.jsx'

const parseHash = () => {
  const m = location.hash.match(/^#\/p\/([\w-]+)/)
  return m ? m[1] : null
}

export const ToastCtx = React.createContext(() => {})

export default function App() {
  const [projectId, setProjectId] = useState(parseHash)
  const [toast, setToast] = useState(null)
  const [unlocked, setUnlocked] = useState(isUnlocked)

  useEffect(() => {
    const onHash = () => setProjectId(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const showToast = (msg, kind = 'ok') => {
    setToast({ msg, kind, key: Date.now() })
  }
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  if (!unlocked) {
    return <Gate onUnlock={() => setUnlocked(true)} />
  }

  return (
    <ToastCtx.Provider value={showToast}>
      <div className="app">
        <Scatter />
        {projectId ? (
          <ProjectView key={projectId} projectId={projectId} onBack={() => (location.hash = '#/')} />
        ) : (
          <ProjectChooser onOpen={(id) => (location.hash = `#/p/${id}`)} />
        )}
        {toast && (
          <div key={toast.key} className={`toast toast-${toast.kind}`}>{toast.msg}</div>
        )}
      </div>
    </ToastCtx.Provider>
  )
}

// playful brand elements floating in the page background
const SCATTER = [
  ['el-star', '#E54B2A', '4%', '12%', 54, -12],
  ['el-spiral', '#0B6EB9', '90%', '18%', 64, 15],
  ['el-sparkle', '#F3C02B', '7%', '72%', 58, 8],
  ['el-smile', '#41B9A6', '88%', '78%', 66, -8],
  ['el-question', '#F3C02B', '48%', '88%', 44, 10],
  ['el-hatch', '#41B9A6', '30%', '6%', 48, 20],
  ['el-wave', '#E54B2A', '68%', '5%', 52, -6],
]

export function Scatter() {
  return (
    <div className="scatter" aria-hidden>
      {SCATTER.map(([img, c, x, y, s, r], i) => (
        <span
          key={i}
          className="scatter-el"
          style={{
            left: x, top: y, width: s, height: s,
            background: c,
            WebkitMaskImage: `url(./assets/${img}.png)`,
            maskImage: `url(./assets/${img}.png)`,
            transform: `rotate(${r}deg)`,
            animationDelay: `${i * 0.7}s`,
          }}
        />
      ))}
    </div>
  )
}
