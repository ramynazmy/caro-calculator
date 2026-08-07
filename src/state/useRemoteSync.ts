/**
 * Keeps the organizer's device and Firestore in step, once a bill has been
 * published.
 *
 * Two one-way flows, deliberately kept separate:
 *   - bill details  → Firestore   (debounced; the organizer owns these)
 *   - claims        ← Firestore   (live; each participant owns their own)
 *
 * They cannot feed each other into a loop, because the published bill document
 * does not contain claims, and the claims subscription never touches bill
 * details.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch } from 'react'
import type { Bill } from '../types'
import { isFirebaseConfigured, publishBill, subscribeClaims } from '../lib/firebase'

/** How long to wait after the last keystroke before pushing to Firestore. */
const PUBLISH_DEBOUNCE_MS = 800

export function useRemoteSync(
  bill: Bill,
  dispatch: Dispatch<{
    type: 'mergeRemoteClaims'
    claims: Record<string, Record<string, number>>
    respondedAt: Record<string, number>
  }>,
) {
  const [error, setError] = useState<string | null>(null)
  const live = bill.published && isFirebaseConfigured()

  // Latest bill, so the debounced publish always sends current data without
  // making the effect itself re-run on every keystroke.
  const billRef = useRef(bill)
  billRef.current = bill

  // Fingerprint of only the fields that live in the shared document. Claims
  // arriving from other people therefore do not trigger a re-publish.
  const sharedFingerprint = useMemo(() => {
    const { claims: _c, respondedAt: _r, published: _p, ...shared } = bill
    return JSON.stringify(shared)
  }, [bill])

  // --- push: bill details -> Firestore -------------------------------------
  useEffect(() => {
    if (!live) return
    const timer = setTimeout(() => {
      publishBill(billRef.current).catch(() => setError('share.error'))
    }, PUBLISH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [live, sharedFingerprint])

  // --- pull: claims <- Firestore -------------------------------------------
  useEffect(() => {
    if (!live) return
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    subscribeClaims(
      bill.id,
      (claims, respondedAt) => dispatch({ type: 'mergeRemoteClaims', claims, respondedAt }),
      () => setError('share.error'),
    )
      .then((unsub) => {
        // The component may have unmounted while the SDK was still loading.
        if (cancelled) unsub()
        else unsubscribe = unsub
      })
      .catch(() => setError('share.error'))

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [live, bill.id, dispatch])

  return { live, error, clearError: () => setError(null) }
}
