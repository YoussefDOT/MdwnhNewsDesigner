import { initializeApp } from 'firebase/app'
import {
  getDatabase, ref, onValue, set, update, remove, push, get, serverTimestamp,
} from 'firebase/database'

const firebaseConfig = {
  apiKey: 'AIzaSyB8h_iwg1NZi-2Znccq1dWNX61SPo3alUA',
  authDomain: 'nawafdatabase.firebaseapp.com',
  databaseURL: 'https://nawafdatabase-default-rtdb.firebaseio.com',
  projectId: 'nawafdatabase',
  storageBucket: 'nawafdatabase.firebasestorage.app',
  messagingSenderId: '427694018752',
  appId: '1:427694018752:web:27563f2652d156172a9d25',
}

const app = initializeApp(firebaseConfig)
const db = getDatabase(app)

// Everything for this project lives under its own root key, isolated
// from whatever else already exists in this database.
export const ROOT = 'newsPaperStudio'

export const projectsRef = () => ref(db, `${ROOT}/projects`)
export const projectRef = (id) => ref(db, `${ROOT}/projects/${id}`)
export const pathRef = (p) => ref(db, `${ROOT}/${p}`)

export { db, ref, onValue, set, update, remove, push, get, serverTimestamp }
