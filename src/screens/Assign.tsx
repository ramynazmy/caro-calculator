/**
 * Phase 3, organizer side — and the one place an item's cost is divided.
 *
 * The Bill tab is now strictly data entry: what the receipt says. Everything
 * about *who pays for it* lives here, because that is a question about the
 * people at the table rather than about the receipt.
 *
 * Two ways to get items onto people:
 *   A. Share a link — everyone picks on their own phone (needs Firebase).
 *   B. Assign here  — the organizer taps through it, works with no internet.
 *
 * Both write to the same `claims` structure, so the summary and the maths do
 * not care which one was used, and you can switch between them mid-bill.
 */
import { useState } from 'react'
import { useBill } from '../state/BillContext'
import { useRemoteSync } from '../state/useRemoteSync'
import { claimedQuantity, remainingQuantity, totalClaimed } from '../lib/shares'
import { itemTotalMinor, unitPriceDisplayMinor } from '../lib/items'
import { isFirebaseConfigured, publishBill, saveClaims } from '../lib/firebase'
import { claimUrl } from '../router'
import { copyText, whatsappUrl } from '../lib/share'
import { formatMoney } from '../lib/money'
import { useI18n } from '../i18n'
import { QuantityStepper } from '../components/QuantityStepper'
import type { BillItem } from '../types'

type Mode = 'share' | 'assign'
/** How an item's cost is divided. Flattened from `shared` + `sharedWith`. */
type Sharing = 'claim' | 'everyone' | 'group'

function sharingOf(item: BillItem): Sharing {
  if (!item.shared) return 'claim'
  return item.sharedWith && item.sharedWith.length > 0 ? 'group' : 'everyone'
}

export function Assign() {
  const { bill, dispatch } = useBill()
  const { t } = useI18n()
  const { error } = useRemoteSync(bill, dispatch)

  const [mode, setMode] = useState<Mode>(bill.published ? 'share' : 'assign')

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

      {mode === 'share' && <SharePanel syncError={error} />}

      {/* Always shown: marking an item as shared is an organizer decision that
          has to happen before the link goes out, not only in offline mode. */}
      <DivisionPanel mode={mode} />

      <div className="screen__footer">
        <p className="muted">{t('phase.savedLocally')}</p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Option A — the shared link
--------------------------------------------------------------------------- */

function SharePanel({ syncError }: { syncError: string | null }) {
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

  if (bill.items.length === 0 || bill.participants.length === 0) {
    return (
      <section className="card">
        <h2 className="card__title">{t('share.heading')}</h2>
        <p className="empty">
          {bill.items.length === 0 ? t('share.needItems') : t('share.needPeople')}
        </p>
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
   Dividing the items
--------------------------------------------------------------------------- */

function DivisionPanel({ mode }: { mode: Mode }) {
  const { bill, dispatch } = useBill()
  const { t, lang } = useI18n()
  const [openItemId, setOpenItemId] = useState<string | null>(null)

  if (bill.items.length === 0) {
    return (
      <section className="card">
        <h2 className="card__title">{t('assign.heading')}</h2>
        <p className="empty">{t('assign.noItems')}</p>
      </section>
    )
  }

  if (bill.participants.length === 0) {
    return (
      <section className="card">
        <h2 className="card__title">{t('assign.heading')}</h2>
        <p className="empty">{t('assign.needPeople')}</p>
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
        // Offline is normal here; the local copy is still correct and the next
        // successful write will carry it up.
      })
    }
  }

  function setSharing(item: BillItem, sharing: Sharing) {
    dispatch({
      type: 'updateItem',
      id: item.id,
      patch:
        sharing === 'claim'
          ? { shared: false, sharedWith: null }
          : sharing === 'everyone'
            ? { shared: true, sharedWith: null }
            : // Default a new group to everyone, so it is never momentarily
              // "split between nobody" — which would silently mean everyone.
              { shared: true, sharedWith: bill.participants.map((p) => p.id) },
    })
  }

  function toggleMember(item: BillItem, participantId: string) {
    const current = item.sharedWith ?? []
    const next = current.includes(participantId)
      ? current.filter((id) => id !== participantId)
      : [...current, participantId]
    // Never let the group empty out: with nobody in it the item quietly
    // reverts to "everyone", which is not what the organizer asked for.
    if (next.length === 0) return
    dispatch({ type: 'updateItem', id: item.id, patch: { shared: true, sharedWith: next } })
  }

  return (
    <section className="card">
      <h2 className="card__title">{t('assign.heading')}</h2>
      <p className="field__hint">{t('assign.divisionHint')}</p>

      <ul className="assign-list">
        {bill.items.map((item) => {
          const sharing = sharingOf(item)
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
                    {item.quantity} ×{' '}
                    {formatMoney(unitPriceDisplayMinor(item), bill.currency, lang)} ={' '}
                    {formatMoney(itemTotalMinor(item), bill.currency, lang)}
                  </span>
                </span>
                {sharing === 'everyone' ? (
                  <span className="chip">{t('items.sharingEveryone')}</span>
                ) : sharing === 'group' ? (
                  <span className="chip">
                    {t('items.splitBadge', { n: item.sharedWith?.length ?? 0 })}
                  </span>
                ) : (
                  <span
                    className={`chip ${left === 0 ? 'chip--done' : ''} ${left < 0 ? 'chip--bad' : ''}`}
                  >
                    {left < 0
                      ? t('assign.overClaimed')
                      : left === 0
                        ? t('assign.allClaimed')
                        : t('assign.remaining', { n: left })}
                  </span>
                )}
              </button>

              {/* Collapsed: a one-line reminder of who already has it. */}
              {!isOpen && sharing === 'claim' && takers.length > 0 && (
                <p className="assign-item__takers">
                  {takers
                    .map((p) => `${p.name} ×${claimedQuantity(bill, p.id, item.id)}`)
                    .join(' · ')}
                </p>
              )}

              {isOpen && (
                <div className="assign-item__body">
                  <div
                    className="segmented segmented--full"
                    role="group"
                    aria-label={t('items.sharingLabel')}
                  >
                    {(['claim', 'everyone', 'group'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`segmented__btn ${sharing === option ? 'is-active' : ''}`}
                        aria-pressed={sharing === option}
                        onClick={() => setSharing(item, option)}
                      >
                        {t(
                          option === 'claim'
                            ? 'items.sharingClaim'
                            : option === 'everyone'
                              ? 'items.sharingEveryone'
                              : 'items.sharingGroup',
                        )}
                      </button>
                    ))}
                  </div>

                  {sharing === 'everyone' && (
                    <p className="field__hint">{t('items.sharingEveryoneHint')}</p>
                  )}

                  {sharing === 'group' && (
                    <>
                      <p className="field__hint">{t('items.sharingGroupHint')}</p>
                      <div className="pill-picker">
                        {bill.participants.map((person) => {
                          const on = item.sharedWith?.includes(person.id) ?? false
                          return (
                            <button
                              key={person.id}
                              type="button"
                              className={`pill ${on ? 'is-on' : ''}`}
                              aria-pressed={on}
                              onClick={() => toggleMember(item, person.id)}
                            >
                              {person.name}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {sharing === 'claim' &&
                    (mode === 'assign' ? (
                      bill.participants.map((person) => {
                        const mine = claimedQuantity(bill, person.id, item.id)
                        return (
                          <div key={person.id} className="assign-person">
                            <span className="assign-person__name">{person.name}</span>
                            {mine > 0 && (
                              <span className="assign-person__amount">
                                {formatMoney(
                                  Math.round(
                                    (itemTotalMinor(item) * mine) / Math.max(1, item.quantity),
                                  ),
                                  bill.currency,
                                  lang,
                                )}
                              </span>
                            )}
                            <QuantityStepper
                              value={mine}
                              min={0}
                              // Capped at what is genuinely left for this
                              // person: ordered minus everyone else's claims.
                              max={remainingQuantity(bill, item, person.id)}
                              onChange={(quantity) => setClaim(person.id, item.id, quantity)}
                              ariaLabel={`${item.name} — ${person.name}`}
                            />
                          </div>
                        )
                      })
                    ) : (
                      // In link mode the picking is theirs to do; show status.
                      <p className="field__hint">
                        {takers.length > 0
                          ? `${t('assign.claimedBy')}: ${takers
                              .map((p) => `${p.name} ×${claimedQuantity(bill, p.id, item.id)}`)
                              .join(' · ')}`
                          : t('assign.nobodyYet')}
                      </p>
                    ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
