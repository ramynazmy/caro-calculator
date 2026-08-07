/**
 * Phase 3, organizer side. Two ways to get items onto people:
 *
 *   A. Share a link — everyone picks on their own phone (needs Firebase).
 *   B. Assign here  — the organizer taps through it, works with no internet.
 *
 * Both write to the same `claims` structure, so the summary and the maths do
 * not care which one was used, and you can switch between them mid-bill.
 */
import { useState } from 'react'
import { useBill } from '../state/BillContext'
import { useRemoteSync } from '../state/useRemoteSync'
import { claimableItems, claimedQuantity, remainingQuantity, totalClaimed } from '../lib/shares'
import { isFirebaseConfigured, publishBill, saveClaims } from '../lib/firebase'
import { claimUrl } from '../router'
import { copyText, whatsappUrl } from '../lib/share'
import { formatMoney } from '../lib/money'
import { useI18n } from '../i18n'
import { QuantityStepper } from '../components/QuantityStepper'

export function Assign() {
  const { bill, dispatch } = useBill()
  const { t } = useI18n()
  const { error } = useRemoteSync(bill, dispatch)

  const [mode, setMode] = useState<'share' | 'assign'>(bill.published ? 'share' : 'assign')

  const items = claimableItems(bill)
  const hasPeople = bill.participants.length > 0
  const hasItems = bill.items.length > 0

  return (
    <div className="screen">
      <section className="card">
        <h2 className="card__title">{t('mode.heading')}</h2>
        <div className="segmented segmented--full" role="group" aria-label={t('mode.heading')}>
          <button
            type="button"
            className={`segmented__btn ${mode === 'share' ? 'is-active' : ''}`}
            aria-pressed={mode === 'share'}
            onClick={() => setMode('share')}
          >
            {t('mode.share')}
          </button>
          <button
            type="button"
            className={`segmented__btn ${mode === 'assign' ? 'is-active' : ''}`}
            aria-pressed={mode === 'assign'}
            onClick={() => setMode('assign')}
          >
            {t('mode.assign')}
          </button>
        </div>
        <p className="field__hint">
          {mode === 'share' ? t('mode.shareHint') : t('mode.assignHint')}
        </p>
      </section>

      {mode === 'share' ? (
        <SharePanel hasItems={hasItems} hasPeople={hasPeople} syncError={error} />
      ) : (
        <AssignPanel />
      )}

      {/* Shared items are never claimable, so say so once rather than showing
          rows nobody can interact with. */}
      {mode === 'assign' && items.length < bill.items.length && (
        <p className="muted">{t('assign.sharedNote')}</p>
      )}

      <div className="screen__footer">
        <p className="muted">{t('phase.savedLocally')}</p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Option A — the shared link
--------------------------------------------------------------------------- */

function SharePanel({
  hasItems,
  hasPeople,
  syncError,
}: {
  hasItems: boolean
  hasPeople: boolean
  syncError: string | null
}) {
  const { bill, dispatch } = useBill()
  const { t } = useI18n()
  const [publishing, setPublishing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isFirebaseConfigured()) {
    return (
      <section className="card">
        <h2 className="card__title">{t('share.heading')}</h2>
        <div className="alert alert--warn" role="status">
          <p className="alert__text">{t('share.notConfigured')}</p>
          <p className="alert__note">{t('share.notConfiguredHint')}</p>
        </div>
      </section>
    )
  }

  if (!hasItems || !hasPeople) {
    return (
      <section className="card">
        <h2 className="card__title">{t('share.heading')}</h2>
        <p className="empty">{!hasItems ? t('share.needItems') : t('share.needPeople')}</p>
      </section>
    )
  }

  const url = claimUrl(bill.id)
  const invite = t('share.inviteText', { title: bill.title.trim() || t('app.title'), url })

  async function publish() {
    setPublishing(true)
    setError(null)
    try {
      await publishBill(bill)
      dispatch({ type: 'setPublished', published: true })
    } catch {
      setError('share.error')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">{t('share.heading')}</h2>

      {!bill.published ? (
        <button type="button" className="btn btn--primary" onClick={publish} disabled={publishing}>
          {publishing ? t('share.publishing') : t('share.publish')}
        </button>
      ) : (
        <>
          <div className="share-link">
            <code className="share-link__url">{url}</code>
          </div>

          <div className="share-actions">
            <a
              className="btn btn--primary"
              href={whatsappUrl(invite)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('share.whatsapp')}
            </a>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={async () => {
                setCopied(await copyText(url))
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? t('share.copied') : t('share.copy')}
            </button>
          </div>

          <p className="field__hint">🟢 {t('share.live')}</p>

          {/* --- who has responded -------------------------------------- */}
          <h3 className="card__title">{t('share.status')}</h3>
          <ul className="status-list">
            {bill.participants.map((person) => {
              const responded = bill.respondedAt[person.id] !== undefined
              return (
                <li key={person.id} className="status">
                  <span className="status__name">{person.name}</span>
                  <span className={`status__badge ${responded ? 'is-done' : ''}`}>
                    {responded ? `✓ ${t('share.responded')}` : t('share.pending')}
                  </span>
                </li>
              )
            })}
          </ul>

          <a className="btn btn--ghost" href={`#/b/${bill.id}`}>
            {t('share.openMine')}
          </a>
        </>
      )}

      {(error || syncError) && (
        <div className="alert alert--warn" role="alert">
          <p className="alert__text">{t('share.error')}</p>
        </div>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------------------
   Option B — the organizer assigns
--------------------------------------------------------------------------- */

function AssignPanel() {
  const { bill, dispatch } = useBill()
  const { t, lang } = useI18n()
  const [openItemId, setOpenItemId] = useState<string | null>(null)

  const items = claimableItems(bill)

  if (bill.participants.length === 0) {
    return (
      <section className="card">
        <h2 className="card__title">{t('assign.heading')}</h2>
        <p className="empty">{t('assign.needPeople')}</p>
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className="card">
        <h2 className="card__title">{t('assign.heading')}</h2>
        <p className="empty">{bill.items.length === 0 ? t('assign.noItems') : t('assign.allShared')}</p>
      </section>
    )
  }

  /**
   * Record a claim locally, and — if the bill is live — push that one
   * participant's document so the change reaches everyone else's phone.
   */
  function setClaim(participantId: string, itemId: string, quantity: number) {
    dispatch({ type: 'setClaim', participantId, itemId, quantity })

    if (bill.published && isFirebaseConfigured()) {
      const next = { ...(bill.claims[participantId] ?? {}) }
      if (quantity > 0) next[itemId] = quantity
      else delete next[itemId]
      saveClaims(bill.id, participantId, next).catch(() => {
        // Offline is a normal state here; the local copy is still correct and
        // the next successful write will carry it up.
      })
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">{t('assign.heading')}</h2>

      <ul className="assign-list">
        {items.map((item) => {
          const claimed = totalClaimed(bill, item.id)
          const left = item.quantity - claimed
          const isOpen = openItemId === item.id
          const takers = bill.participants.filter(
            (p) => claimedQuantity(bill, p.id, item.id) > 0,
          )

          return (
            <li key={item.id} className={`assign-item ${isOpen ? 'is-open' : ''}`}>
              <button
                type="button"
                className="assign-item__head"
                aria-expanded={isOpen}
                onClick={() => setOpenItemId(isOpen ? null : item.id)}
              >
                <span className="assign-item__title">
                  <span className="assign-item__name">{item.name}</span>
                  <span className="assign-item__meta">
                    {item.quantity} × {formatMoney(item.unitPriceMinor, bill.currency, lang)}
                  </span>
                </span>
                <span
                  className={`chip ${left === 0 ? 'chip--done' : ''} ${left < 0 ? 'chip--bad' : ''}`}
                >
                  {left < 0
                    ? t('assign.overClaimed')
                    : left === 0
                      ? t('assign.allClaimed')
                      : t('assign.remaining', { n: left })}
                </span>
              </button>

              {/* Collapsed: a one-line reminder of who already has it. */}
              {!isOpen && takers.length > 0 && (
                <p className="assign-item__takers">
                  {takers
                    .map((p) => `${p.name} ×${claimedQuantity(bill, p.id, item.id)}`)
                    .join(' · ')}
                </p>
              )}

              {isOpen && (
                <div className="assign-item__body">
                  {bill.participants.map((person) => {
                    const mine = claimedQuantity(bill, person.id, item.id)
                    return (
                      <div key={person.id} className="assign-person">
                        <span className="assign-person__name">{person.name}</span>
                        {mine > 0 && (
                          <span className="assign-person__amount">
                            {formatMoney(item.unitPriceMinor * mine, bill.currency, lang)}
                          </span>
                        )}
                        <QuantityStepper
                          value={mine}
                          min={0}
                          // Capped at what is genuinely left for this person:
                          // the ordered quantity minus everyone else's claims.
                          max={remainingQuantity(bill, item, person.id)}
                          onChange={(quantity) => setClaim(person.id, item.id, quantity)}
                          ariaLabel={`${item.name} — ${person.name}`}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
