// Hand-drawn-feel SVG icon set. All stroke-based, inherit currentColor.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export const I = {
  plus: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  pencil: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
      <path d="M13.5 7.5l3 3" />
    </svg>
  ),
  trash: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
  undo: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M8.5 5.5L4 10l4.5 4.5" />
      <path d="M4 10h9a6 6 0 0 1 6 6v2" />
    </svg>
  ),
  redo: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M15.5 5.5L20 10l-4.5 4.5" />
      <path d="M20 10h-9a6 6 0 0 0-6 6v2" />
    </svg>
  ),
  bold: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} strokeWidth={2.8} {...p}>
      <path d="M8 4.5h5a3.5 3.5 0 0 1 0 7H8zM8 11.5h6a3.7 3.7 0 0 1 0 7.4L8 19z" />
      <path d="M8 4.5v14.5" />
    </svg>
  ),
  italic: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M10 4.5h8M6 19.5h8M14 4.5l-4 15" />
    </svg>
  ),
  image: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4.5 17l4.5-4.5 3.5 3.5 3-3 4 4" />
    </svg>
  ),
  download: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M12 4v10M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </svg>
  ),
  layers: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M12 3.5l8.5 5L12 13.5l-8.5-5z" />
      <path d="M4 13l8 4.7L20 13" />
      <path d="M4 16.7l8 4.7 8-4.7" />
    </svg>
  ),
  up: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  ),
  down: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  ),
  back: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M14.5 5.5L8 12l6.5 6.5" />
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} strokeWidth={3} {...p}>
      <path d="M4.5 12.5l5 5L19.5 6.5" />
    </svg>
  ),
  x: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  text: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M5 6.5V4.5h14v2M12 4.5v15M9 19.5h6" />
    </svg>
  ),
  paper: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M6 3.5h9l4 4v13H6z" transform="rotate(-4 12 12)" />
      <path d="M15 3.5v4h4" transform="rotate(-4 12 12)" />
    </svg>
  ),
  rotate: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 3.5v3.6h-3.6" />
    </svg>
  ),
  palette: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M12 3.5a8.5 8.5 0 1 0 .4 17c1.6 0 2-1 1.4-2-.8-1.4.2-2.9 1.8-2.9h1.9c1.7 0 3-1.4 3-3A8.7 8.7 0 0 0 12 3.5z" />
      <circle cx="8" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  grid: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 4v16M4 12h16" />
    </svg>
  ),
  zoomIn: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.5-4.5M11 8.5v5M8.5 11h5" />
    </svg>
  ),
  alignR: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M4 6h16M9 11h11M4 16h16M12 21h8" transform="translate(0,-1.5)" />
    </svg>
  ),
  alignC: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M4 6h16M7 11h10M4 16h16M8 21h8" transform="translate(0,-1.5)" />
    </svg>
  ),
  alignL: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M4 6h16M4 11h11M4 16h16M4 21h8" transform="translate(0,-1.5)" />
    </svg>
  ),
  spark: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  ),
}
