/**
 * Firestore sync for the shared-link mode.
 *
 * Two design decisions worth knowing:
 *
 * 1. **The SDK is loaded lazily.** Firebase is ~200 KB gzipped. Option B
 *    (organizer assigns everything) never touches the network, so it should
 *    never pay that cost. Every export below dynamically imports the SDK on
 *    first use.
 *
 * 2. **One document per participant**, at `bills/{billId}/claims/{participantId}`,
 *    rather than one big claims object on the bill. Six friends tapping at
 *    once then write six different documents and cannot clobber each other.
 *
 * Configuration comes from a `.env` file (see `.env.example`). With no config
 * the app still works — it just offers Option B only.
 */

import type { Bill, Claims } from '../types'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

/** Are there enough keys to talk to a project at all? */
export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId)
}

/**
 * How long a published bill survives on the server.
 *
 * Every document written from here carries an `expiresAt` timestamp, and a
 * Firestore TTL policy deletes the document once it passes. A dinner from
 * three months ago has no business still sitting on a server with your
 * friends' names on it — and it keeps the free-tier quota permanently clean.
 */
const RETENTION_DAYS = 90

function expiryDate(): Date {
  return new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

/** The parts of a bill that live in the shared document. */
export type SharedBill = Omit<Bill, 'claims' | 'respondedAt' | 'published'>

type Firestore = import('firebase/firestore').Firestore
let dbPromise: Promise<Firestore> | null = null

async function getDb(): Promise<Firestore> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured — add the keys to your .env file.')
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      const [{ initializeApp, getApps }, { getFirestore }] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore'),
      ])
      // getApps() guards against re-initialising during hot reload in dev.
      const app = getApps()[0] ?? initializeApp(config as Record<string, string>)
      return getFirestore(app)
    })()
  }
  return dbPromise
}

/** Push the organizer's bill so the share link resolves to something. */
export async function publishBill(bill: Bill): Promise<void> {
  const db = await getDb()
  const { doc, setDoc } = await import('firebase/firestore')
  const { claims: _c, respondedAt: _r, published: _p, ...shared } = bill
  // Re-stamped on every push, so a bill you are actively using keeps sliding
  // its expiry forward and only goes stale once you stop touching it.
  await setDoc(doc(db, 'bills', bill.id), { ...shared, expiresAt: expiryDate() })
}

/** Read a bill once — what a participant does when they open the link. */
export async function fetchBill(billId: string): Promise<SharedBill | null> {
  const db = await getDb()
  const { doc, getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(db, 'bills', billId))
  return snap.exists() ? (snap.data() as SharedBill) : null
}

/**
 * Watch a bill. Participants use this so that an item the organizer adds — or
 * the organizer locking the bill — shows up on their phone without a refresh.
 */
export async function subscribeBill(
  billId: string,
  onChange: (bill: SharedBill | null) => void,
  onError?: (error: Error) => void,
): Promise<() => void> {
  const db = await getDb()
  const { doc, onSnapshot } = await import('firebase/firestore')
  return onSnapshot(
    doc(db, 'bills', billId),
    (snap) => onChange(snap.exists() ? (snap.data() as SharedBill) : null),
    (error) => onError?.(error),
  )
}

/** Save one participant's picks. Writes only that participant's document. */
export async function saveClaims(
  billId: string,
  participantId: string,
  items: Record<string, number>,
): Promise<void> {
  const db = await getDb()
  const { doc, setDoc } = await import('firebase/firestore')
  await setDoc(doc(db, 'bills', billId, 'claims', participantId), {
    items,
    updatedAt: Date.now(),
    // Subcollections are NOT removed when their parent document is deleted,
    // so claim documents need their own expiry or they would outlive the bill.
    expiresAt: expiryDate(),
  })
}

/**
 * Watch everybody's picks. The organizer uses this to see selections arrive
 * live; participants use it to see the remaining quantities drop as others
 * claim things.
 */
export async function subscribeClaims(
  billId: string,
  onChange: (claims: Claims, respondedAt: Record<string, number>) => void,
  onError?: (error: Error) => void,
): Promise<() => void> {
  const db = await getDb()
  const { collection, onSnapshot } = await import('firebase/firestore')
  return onSnapshot(
    collection(db, 'bills', billId, 'claims'),
    (snap) => {
      const claims: Claims = {}
      const respondedAt: Record<string, number> = {}
      snap.forEach((docSnap) => {
        const data = docSnap.data() as { items?: Record<string, number>; updatedAt?: number }
        claims[docSnap.id] = data.items ?? {}
        respondedAt[docSnap.id] = data.updatedAt ?? Date.now()
      })
      onChange(claims, respondedAt)
    },
    (error) => onError?.(error),
  )
}
