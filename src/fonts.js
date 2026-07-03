// Font catalogue + on-demand Google Fonts loader.
//
// Brand fonts come first (Baloo = default, Vazirmatn second), each with real
// weight axes. After them a separator, then the whole Google Fonts library.

export const BRAND_FONTS = [
  { id: 'Baloo Bhaijaan 2', name: 'بالو بهيجان (الأساسي)', weights: [400, 500, 600, 700, 800], brand: true },
  { id: 'Vazirmatn', name: 'وزيرمتن', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], brand: true },
]

// A few hand-picked Arabic faces surfaced near the top for convenience.
export const ARABIC_FONTS = [
  { id: 'Cairo', name: 'القاهرة', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { id: 'Tajawal', name: 'تجوّل', weights: [200, 300, 400, 500, 700, 800, 900] },
  { id: 'Almarai', name: 'المراعي', weights: [300, 400, 700, 800] },
  { id: 'Amiri', name: 'أميري', weights: [400, 700] },
  { id: 'Reem Kufi', name: 'ريم كوفي', weights: [400, 500, 600, 700] },
  { id: 'Markazi Text', name: 'مركزي', weights: [400, 500, 600, 700] },
  { id: 'El Messiri', name: 'المسيري', weights: [400, 500, 600, 700] },
  { id: 'Lalezar', name: 'لاله زار', weights: [400] },
  { id: 'Marhey', name: 'مرحي', weights: [300, 400, 500, 600, 700] },
  { id: 'Lemonada', name: 'ليمونادة', weights: [300, 400, 500, 600, 700] },
  { id: 'Rakkas', name: 'ركّاز', weights: [400] },
  { id: 'Aref Ruqaa', name: 'عارف رقعة', weights: [400, 700] },
]

// Weights offered for any font that isn't in the curated lists above
// (applied via the browser's synthetic weighting — no extra network request).
export const GENERIC_WEIGHTS = [300, 400, 500, 600, 700, 800]

// Fallback library if the live Google metadata fetch is blocked.
const STATIC_ALL = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Inter', 'Oswald',
  'Raleway', 'Nunito', 'Nunito Sans', 'Merriweather', 'Playfair Display',
  'Rubik', 'Work Sans', 'Ubuntu', 'PT Sans', 'PT Serif', 'Josefin Sans',
  'Quicksand', 'Mukta', 'Karla', 'Fira Sans', 'Barlow', 'Manrope', 'Kanit',
  'Heebo', 'Titillium Web', 'DM Sans', 'DM Serif Display', 'Bebas Neue',
  'Anton', 'Archivo', 'Archivo Black', 'Libre Franklin', 'Libre Baskerville',
  'Source Sans 3', 'Source Serif 4', 'Crimson Text', 'Bitter', 'Dosis',
  'Cabin', 'Comfortaa', 'Exo 2', 'Teko', 'Signika', 'Abel', 'Asap',
  'Pacifico', 'Lobster', 'Dancing Script', 'Caveat', 'Shadows Into Light',
  'Satisfy', 'Great Vibes', 'Sacramento', 'Permanent Marker', 'Amatic SC',
  'Indie Flower', 'Courgette', 'Cookie', 'Kalam', 'Patrick Hand',
  'Baloo 2', 'Fredoka', 'Righteous', 'Bungee', 'Passion One', 'Alfa Slab One',
  'Titan One', 'Luckiest Guy', 'Bangers', 'Chewy', 'Fredericka the Great',
  'Concert One', 'Paytone One', 'Rowdies', 'Bowlby One', 'Sigmar One',
  'Merienda', 'Yeseva One', 'Cinzel', 'Cormorant Garamond', 'EB Garamond',
  'Spectral', 'Zilla Slab', 'Arvo', 'Rokkitt', 'Slabo 27px', 'Domine',
  'Josefin Slab', 'Frank Ruhl Libre', 'Vollkorn', 'Noto Sans', 'Noto Serif',
  'Noto Kufi Arabic', 'Noto Naskh Arabic', 'Changa', 'Jomhuria', 'Harmattan',
  'Mada', 'Scheherazade New', 'Lateef', 'Katibeh', 'Mirza', 'Gulzar',
  'Vibes', 'Reem Kufi Fun', 'Alexandria', 'IBM Plex Sans Arabic',
  'IBM Plex Sans', 'IBM Plex Serif', 'IBM Plex Mono', 'Space Grotesk',
  'Space Mono', 'Sora', 'Outfit', 'Plus Jakarta Sans', 'Lexend', 'Red Hat Display',
  'Epilogue', 'Urbanist', 'Figtree', 'Onest', 'Schibsted Grotesk', 'Hanken Grotesk',
  'Prompt', 'Mulish', 'Overpass', 'Jost', 'Assistant', 'Varela Round',
  'Baloo Tammudu 2', 'Baloo Chettan 2', 'Gochi Hand', 'Neucha', 'Gloria Hallelujah',
  'Special Elite', 'Press Start 2P', 'VT323', 'Orbitron', 'Audiowide',
  'Monoton', 'Fjalla One', 'Staatliches', 'Yanone Kaffeesatz', 'Abril Fatface',
  'Playfair Display SC', 'Old Standard TT', 'Cardo', 'Lora', 'Alegreya',
  'Alegreya Sans', 'Crimson Pro', 'Newsreader', 'Petrona', 'Faustina',
  'Piazzolla', 'Fraunces', 'Bricolage Grotesque', 'Instrument Serif', 'Gabarito',
]

let ALL_CACHE = null
export async function fetchAllFonts() {
  if (ALL_CACHE) return ALL_CACHE
  try {
    const r = await fetch('https://fonts.google.com/metadata/fonts')
    let t = await r.text()
    t = t.replace(/^[^[{]*/, '') // strip the )]}' anti-JSON prefix
    const j = JSON.parse(t)
    const list = (j.familyMetadataList || []).map((f) => f.family).filter(Boolean)
    ALL_CACHE = list.length ? list : STATIC_ALL
  } catch {
    ALL_CACHE = STATIC_ALL
  }
  return ALL_CACHE
}
export const STATIC_FONTS = STATIC_ALL

// ---- loader ----
const loaded = new Set()
const brandById = Object.fromEntries(
  [...BRAND_FONTS, ...ARABIC_FONTS].map((f) => [f.id, f]),
)

export function fontWeightsFor(id) {
  return brandById[id]?.weights || GENERIC_WEIGHTS
}
export function isCuratedFont(id) {
  return !!brandById[id]
}

// Inject the stylesheet for a family once. Curated families load their full
// weight axis; unknown families load the default face only (requesting an
// unavailable weight would 400 the whole request), and rely on synthetic weight.
export function loadFont(id) {
  if (!id || loaded.has(id)) return
  loaded.add(id)
  const fam = id.replace(/ /g, '+')
  const spec = brandById[id]
  const wght = spec ? `:wght@${spec.weights.join(';')}` : ''
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${fam}${wght}&display=swap`
  document.head.appendChild(link)
}

export const DEFAULT_FONT = 'Baloo Bhaijaan 2'
