import React, { useEffect, useRef, useState } from 'react'

const PASSCODE = '1445'
const SESSION_KEY = 'mdwnh_unlocked'

// Accept both Latin (0-9) and Arabic-Indic (٠-٩) digits, normalize to Latin.
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const normalizeDigit = (ch) => {
  if (/[0-9]/.test(ch)) return ch
  const i = ARABIC_DIGITS.indexOf(ch)
  return i >= 0 ? String(i) : ''
}

export function isUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === '1'
}

export default function Gate({ onUnlock }) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [shake, setShake] = useState(false)
  const inputRefs = useRef([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const tryUnlock = (arr) => {
    if (arr.join('') === PASSCODE) {
      sessionStorage.setItem(SESSION_KEY, '1')
      onUnlock()
    } else {
      setShake(true)
      setTimeout(() => {
        setShake(false)
        setDigits(['', '', '', ''])
        inputRefs.current[0]?.focus()
      }, 420)
    }
  }

  const setAt = (i, val) => {
    const next = [...digits]
    next[i] = val
    setDigits(next)
    if (val && i < 3) inputRefs.current[i + 1]?.focus()
    if (next.every((d) => d !== '')) tryUnlock(next)
  }

  const onChange = (i, e) => {
    const raw = e.target.value
    const last = raw.slice(-1)
    const norm = normalizeDigit(last)
    if (raw === '') { setAt(i, ''); return }
    if (!norm) return
    setAt(i, norm)
  }

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus()
      setAt(i - 1, '')
    }
  }

  const onPaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const norm = [...text].map(normalizeDigit).filter(Boolean).slice(0, 4)
    if (!norm.length) return
    const next = ['', '', '', '']
    norm.forEach((d, i) => (next[i] = d))
    setDigits(next)
    const nextEmpty = next.findIndex((d) => d === '')
    inputRefs.current[nextEmpty === -1 ? 3 : nextEmpty]?.focus()
    if (next.every((d) => d !== '')) tryUnlock(next)
  }

  return (
    <div className="gate">
      <div className="scatter-el gate-el gate-el-a" style={{ background: '#E54B2A', WebkitMaskImage: 'url(./assets/el-star.png)', maskImage: 'url(./assets/el-star.png)' }} />
      <div className="scatter-el gate-el gate-el-b" style={{ background: '#0B6EB9', WebkitMaskImage: 'url(./assets/el-spiral.png)', maskImage: 'url(./assets/el-spiral.png)' }} />
      <div className="scatter-el gate-el gate-el-c" style={{ background: '#41B9A6', WebkitMaskImage: 'url(./assets/el-sparkle.png)', maskImage: 'url(./assets/el-sparkle.png)' }} />

      <div className="gate-card">
        <img src="./assets/logo.svg" alt="مدونة" className="gate-logo" />
        <h1 className="gate-title">صحيفة المدونة</h1>
        <p className="gate-sub">أدخلوا كلمة المرور للدخول إلى الاستوديو</p>

        <div className={`gate-boxes ${shake ? 'gate-shake' : ''}`} dir="ltr">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              className="gate-box"
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => onChange(i, e)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={onPaste}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
