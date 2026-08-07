/**
 * What a participant sees when they open the shared link on their phone.
 *
 * This screen is completely independent of the organizer's local bill: it has
 * its own state, loaded from Firestore. Someone opening a link should never
 * see, or overwrite, a bill they happen to have been organizing themselves.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Bill, Claims } from '../types'
import type { SharedBill } from '../lib/firebase'
import {
  fetchBill,
  isFirebaseConfigured,
  saveClaims,
  subscribeBill,
  subscribeClaims,
} from '../lib/firebase'
import { computeShares } from '../lib/shares'
import { claimableItems, remainingQuantity } from '../lib/shares'
import { formatMoney } from '../lib/money'
import { useI18n } from '../i18n'
import { ClaimRow } from '../components/ClaimRow'
import { GirlLogo } from '../components/GirlLogo'
import { InstallButton } from '../components/InstallButton'

/** Remember who you said you were, per bill, so you only pick your name once. */
const meKey = (billId: string) => `billsplitter.me.${billId}`

type LoadState = 'loading' | 'ready' | 'missing' | 'error'

export function ParticipantClaim({ billId }: { billId: string }) {
  const { t, lang, toggleLang } = useI18n()

  const [state, setState] = useState<LoadState>('loading')
  const [shared, setShared] = useState<SharedBill | null>(null)
  const [claims, setClaims] = useState<Claims>({})
  const [meId, setMeId] = useState<string | null>(() => localStorage.getItem(meKey(billId)))
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // --- load and then watch the bill ----------------------------------------
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setState('error')
      return
    }
    let cancelled = false
    let unsubBill: (() => void) | undefined
    let unsubClaims: (() => void) | undefined

    fetchBill(billId)
      .then((found) => {
        if (cancelled) return
        if (!found) {
          setState('missing')
          return
        }
        setShared(found)
        setState('ready')
      })
      .catch(() => !cancelled && setState('error'))

    // Live updates: the organizer adding an item, or locking the bill.
    subscribeBill(billId, (next) => !cancelled && next && setShared(next))
      .then((u) => (cancelled ? u() : (unsubBill = u)))
      .catch(() => undefined)

    // Live updates: what everyone else has claimed, so "3 left" stays true.
    subscribeClaims(billId, (next) => !cancelled && setClaims(next))
      .then((u) => (cancelled ? u() : (unsubClaims = u)))
      .catch(() => undefined)

    return () => {
      cancelled = true
      unsubBill?.()
      unsubClaims?.()
    }
  }, [billId])

  // Seed the draft from the server copy — but never stomp on edits in progress.
  useEffect(() => {
    if (meId && !dirty) setDraft(claims[meId] ?? {})
  }, [claims, meId, dirty])

  // A Bill-shaped object so the shared calculation helpers can be reused
  // verbatim, with this participant's unsaved edits folded in.
  const workingBill: Bill | null = useMemo(() => {
    if (!shared) return null
    const merged: Claims = { ...claims }
    if (meId) merged[meId] = draft
    return { ...shared, claims: merged, respondedAt: {}, published: true }
  }, [shared, claims, meId, draft])

  if (state === 'loading') return <Shell><p className="empty">{t('claim.loading')}</p></Shell>
  if (state === 'missing') return <Shell><p className="empty">{t('claim.notFound')}</p></Shell>
  if (state === 'error' || !workingBill) {
    return <Shell><p className="empty">{t('claim.error')}</p></Shell>
  }

  const bill = workingBill
  const me = bill.participants.find((p) => p.id === meId) ?? null
  const items = claimableItems(bill)

  // --- name picker ---------------------------------------------------------
  if (!me) {
    return (
      <Shell title={bill.title} onToggleLang={toggleLang} langLabel={t('lang.switch')}>
        <section className="card">
          <h2 className="card__title">{t('claim.whoAreYou')}</h2>
          <div className="name-picker">
            {bill.participants.map((person) => (
              <button
                key={person.id}
                type="button"
                className="btn btn--ghost name-picker__btn"
                onClick={() => {
                  localStorage.setItem(meKey(billId), person.id)
                  setMeId(person.id)
                  setDraft(claims[person.id] ?? {})
                  setDirty(false)
                }}
              >
                {person.name}
                {person.partySize > 1 && (
                  <span className="chip">{t('people.personCount', { n: person.partySize })}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      </Shell>
    )
  }

  const myShare = computeShares(bill).shares.find((s) => s.participantId === me.id)

  async function save() {
    setSaving(true)
    setSaveError(false)
    try {
      await saveClaims(billId, me!.id, draft)
      setDirty(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 3000)
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell title={bill.title} onToggleLang={toggleLang} langLabel={t('lang.switch')}>
      <section className="card">
        <div className="card__header">
          <h2 className="card__title">{me.name}</h2>
          <button
            type="button"
            className="btn btn--tiny"
            onClick={() => {
              localStorage.removeItem(meKey(billId))
              setMeId(null)
              setDirty(false)
            }}
          >
            {t('claim.notYou')}
          </button>
        </div>

        {bill.locked && (
          <div className="alert alert--warn" role="status">
            <p className="alert__text">🔒 {t('claim.locked')}</p>
          </div>
        )}

        <h3 className="card__title">{t('claim.heading')}</h3>

        {items.length === 0 ? (
          <p className="empty">{t('claim.nothingToPick')}</p>
        ) : (
          <div className="claim-list">
            {items.map((item) => (
              <ClaimRow
                key={item.id}
                item={item}
                currency={bill.currency}
                quantity={draft[item.id] ?? 0}
                maxQuantity={remainingQuantity(bill, item, me.id)}
                disabled={bill.locked}
                onChange={(quantity) => {
                  setDirty(true)
                  setDraft((current) => {
                    const next = { ...current }
                    if (quantity > 0) next[item.id] = quantity
                    else delete next[item.id]
                    return next
                  })
                }}
              />
            ))}
          </div>
        )}

        {items.length < bill.items.length && (
          <p className="field__hint">{t('claim.sharedNote')}</p>
        )}
      </section>

      {/* Running total, so people can see their own number before saving. */}
      {myShare && (
        <section className="card">
          <div className="totals__line totals__line--grand">
            <dt>{t('claim.yourShare')}</dt>
            <dd>{formatMoney(myShare.totalMinor, bill.currency, lang)}</dd>
          </div>
        </section>
      )}

      {!bill.locked && (
        <div className="sticky-actions">
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? t('claim.saving') : t('claim.save')}
          </button>
          {justSaved && <p className="note note--ok">{t('claim.saved')}</p>}
          {saveError && <p className="note note--bad">{t('claim.saveError')}</p>}
        </div>
      )}
    </Shell>
  )
}

/** Bare chrome for the participant view — no organizer tabs, no bill editing. */
function Shell({
  children,
  title,
  onToggleLang,
  langLabel,
}: {
  children: React.ReactNode
  title?: string
  onToggleLang?: () => void
  langLabel?: string
}) {
  return (
    <div className="app">
      <header className="appbar">
        <GirlLogo className="appbar__logo" />
        <div className="appbar__titles">
          <h1 className="appbar__title">Caro Calculator</h1>
          {title && <p className="appbar__tagline">{title}</p>}
        </div>
        <InstallButton />
        {onToggleLang && (
          <button type="button" className="btn btn--ghost btn--small" onClick={onToggleLang}>
            {langLabel}
          </button>
        )}
      </header>
      <main className="main">
        <div className="screen">{children}</div>
      </main>
    </div>
  )
}
