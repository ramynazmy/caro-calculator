/** Phase 3, final screen: who owes exactly what, and how to send it round. */
import { useMemo, useState } from 'react'
import { useBill } from '../state/BillContext'
import { computeShares } from '../lib/shares'
import { remainingQuantity } from '../lib/shares'
import { formatMoney } from '../lib/money'
import { buildSummaryText, copyText, whatsappUrl } from '../lib/share'
import { isFirebaseConfigured, saveClaims } from '../lib/firebase'
import { getCurrency } from '../lib/currencies'
import { useI18n } from '../i18n'

/** Offered round-up steps, in whole currency units. 0 means no rounding. */
const ROUND_UP_STEPS = [0, 1, 5, 10]

export function Summary() {
  const { bill, dispatch } = useBill()
  const { t, lang } = useI18n()
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle')

  const result = useMemo(() => computeShares(bill), [bill])
  const money = (minor: number) => formatMoney(minor, bill.currency, lang)

  if (bill.participants.length === 0 || bill.items.length === 0) {
    return (
      <div className="screen">
        <section className="card">
          <h2 className="card__title">{t('summary.heading')}</h2>
          <p className="empty">
            {bill.items.length === 0 ? t('summary.needItems') : t('summary.needPeople')}
          </p>
        </section>
      </div>
    )
  }

  const summaryText = buildSummaryText(bill, result, t, lang)
  const organizer = result.shares.find((s) => s.isOrganizer)
  const pending = result.pendingParticipantIds.length

  /**
   * Hand an unclaimed leftover to one person instead of spreading it around.
   * They end up holding everything nobody else claimed, which is exactly the
   * "they just forgot to tick their dessert" case this is for.
   */
  function assignCommunal(itemId: string, participantId: string) {
    const item = bill.items.find((i) => i.id === itemId)
    if (!item) return
    const quantity = remainingQuantity(bill, item, participantId)
    dispatch({ type: 'setClaim', participantId, itemId, quantity })

    if (bill.published && isFirebaseConfigured()) {
      const next = { ...(bill.claims[participantId] ?? {}), [itemId]: quantity }
      saveClaims(bill.id, participantId, next).catch(() => undefined)
    }
  }

  return (
    <div className="screen">
      {/* --- problems worth fixing before sending money requests ---------- */}
      {result.totals.hasMismatch && (
        <div className="alert alert--warn" role="alert">
          <p className="alert__text">
            {t('summary.mismatch', { amount: money(result.grandTotalMinor) })}
          </p>
        </div>
      )}

      {result.overclaims.map((over) => (
        <div key={over.itemId} className="alert alert--warn" role="alert">
          <p className="alert__text">
            {t('summary.overclaim', {
              name: over.name,
              claimed: over.claimedQuantity,
              ordered: over.orderedQuantity,
            })}
          </p>
        </div>
      ))}

      {pending > 0 && bill.published && (
        <div className="alert alert--info" role="status">
          <p className="alert__text">{t('summary.pending', { n: pending })}</p>
        </div>
      )}

      {/* --- the answer --------------------------------------------------- */}
      <section className="card">
        <h2 className="card__title">{t('summary.heading')}</h2>

        <ul className="share-list">
          {result.shares.map((share) => (
            <li key={share.participantId} className="share-card">
              <div className="share-card__head">
                <span className="share-card__name">
                  {share.name}
                  {share.partySize > 1 && <span className="chip">×{share.partySize}</span>}
                  {share.isOrganizer && <span className="badge">⭐</span>}
                  {share.isTreated && <span className="chip">🎂 {t('people.treated')}</span>}
                </span>
                <span className="share-card__total">{money(share.totalMinor)}</span>
              </div>

              <ul className="share-card__lines">
                {share.lines.map((line) => (
                  <li key={line.itemId}>
                    <span>
                      {line.quantity}× {line.name}
                      {line.sharedWays ? (
                        <span className="chip">{t('summary.splitWays', { n: line.sharedWays })}</span>
                      ) : null}
                    </span>
                    <span>{money(line.amountMinor)}</span>
                  </li>
                ))}
                {share.communalMinor > 0 && (
                  <li className="is-muted">
                    <span>{t('summary.communalShare')}</span>
                    <span>{money(share.communalMinor)}</span>
                  </li>
                )}
                {share.discountMinor > 0 && (
                  <li className="is-credit">
                    <span>{t('totals.discount')}</span>
                    <span>−{money(share.discountMinor)}</span>
                  </li>
                )}
                {share.serviceMinor + share.taxMinor > 0 && (
                  <li className="is-muted">
                    <span>{t('summary.serviceAndTax')}</span>
                    <span>{money(share.serviceMinor + share.taxMinor)}</span>
                  </li>
                )}
                {share.tipsMinor > 0 && (
                  <li className="is-muted">
                    <span>{t('summary.tipShare')}</span>
                    <span>{money(share.tipsMinor)}</span>
                  </li>
                )}
                {share.roundUpMinor > 0 && (
                  <li className="is-roundup">
                    <span>{t('summary.roundUp')}</span>
                    <span>+{money(share.roundUpMinor)}</span>
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ul>

        {/* Bill and tip are kept visually separate: the restaurant is owed the
            first number exactly, everything else is a gift. */}
        <div className="totals__line">
          <dt>{t('summary.billTotal')}</dt>
          <dd>{money(result.totals.calculatedTotalMinor)}</dd>
        </div>
        {result.tipsTotalMinor > 0 && (
          <div className="totals__line totals__line--credit">
            <dt>{t('summary.tipsTotal')}</dt>
            <dd>+{money(result.tipsTotalMinor)}</dd>
          </div>
        )}
        <div className="totals__line totals__line--grand">
          <dt>{t('summary.grandTotal')}</dt>
          <dd>{money(result.grandTotalMinor)}</dd>
        </div>

        {/* The shares are built to sum exactly; say so, because the whole
            point of the app is that nobody has to check. */}
        {!result.totals.hasMismatch && (
          <p className="note note--ok">
            ✓{' '}
            {result.tipsTotalMinor > 0
              ? t('summary.matchesWithTip', { amount: money(result.tipsTotalMinor) })
              : t('summary.matches')}
          </p>
        )}
        {organizer && (
          <p className="field__hint">{t('summary.organizerNote', { name: organizer.name })}</p>
        )}
      </section>

      {/* --- shared and unclaimed ----------------------------------------- */}
      {result.communal.length > 0 && (
        <section className="card">
          <h2 className="card__title">{t('summary.communalHeading')}</h2>
          <ul className="communal-list">
            {result.communal.map((line) => (
              <li key={`${line.itemId}-${line.isShared}`} className="communal">
                <div className="communal__main">
                  <span className="communal__name">
                    {line.quantity}× {line.name}
                  </span>
                  <span className={`chip ${line.isShared ? '' : 'chip--bad'}`}>
                    {line.isShared ? t('summary.sharedBadge') : t('summary.unclaimedBadge')}
                  </span>
                </div>
                <div className="communal__side">
                  <span className="communal__amount">{money(line.amountMinor)}</span>
                  {/* Only unclaimed leftovers can be handed to a person —
                      a shared item is shared on purpose. */}
                  {!line.isShared && !bill.locked && (
                    <select
                      className="input communal__assign"
                      value=""
                      aria-label={t('summary.assignTo')}
                      onChange={(e) => {
                        if (e.target.value) assignCommunal(line.itemId, e.target.value)
                      }}
                    >
                      <option value="">{t('summary.assignTo')}</option>
                      {bill.participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {result.communal.some((l) => !l.isShared) && (
            <p className="field__hint">{t('summary.unclaimedHint')}</p>
          )}
        </section>
      )}

      {/* --- how tax & service get spread --------------------------------- */}
      <section className="card">
        <h2 className="card__title">{t('chargeSplit.heading')}</h2>
        <div
          className="segmented segmented--full"
          role="group"
          aria-label={t('chargeSplit.heading')}
        >
          <button
            type="button"
            className={`segmented__btn ${bill.chargeSplit === 'proportional' ? 'is-active' : ''}`}
            aria-pressed={bill.chargeSplit === 'proportional'}
            onClick={() => dispatch({ type: 'setChargeSplit', split: 'proportional' })}
          >
            {t('chargeSplit.proportional')}
          </button>
          <button
            type="button"
            className={`segmented__btn ${bill.chargeSplit === 'equal' ? 'is-active' : ''}`}
            aria-pressed={bill.chargeSplit === 'equal'}
            onClick={() => dispatch({ type: 'setChargeSplit', split: 'equal' })}
          >
            {t('chargeSplit.equal')}
          </button>
        </div>
        <p className="field__hint">
          {bill.chargeSplit === 'proportional'
            ? t('chargeSplit.proportionalHint')
            : t('chargeSplit.equalHint')}
        </p>
      </section>

      {/* --- rounding each share up --------------------------------------- */}
      <section className="card">
        <h2 className="card__title">{t('roundup.heading')}</h2>
        <div className="segmented segmented--full" role="group" aria-label={t('roundup.heading')}>
          {ROUND_UP_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              className={`segmented__btn ${bill.roundUpTo === step ? 'is-active' : ''}`}
              aria-pressed={bill.roundUpTo === step}
              onClick={() => dispatch({ type: 'setRoundUpTo', value: step })}
            >
              {step === 0 ? t('roundup.off') : t('roundup.to', { n: step })}
            </button>
          ))}
        </div>
        <p className="field__hint">
          {bill.roundUpTo === 0
            ? t('roundup.offHint')
            : t('roundup.hint', {
                amount: formatMoney(
                  bill.roundUpTo * 10 ** getCurrency(bill.currency).decimals,
                  bill.currency,
                  lang,
                ),
              })}
        </p>
        {result.roundUpTotalMinor > 0 && (
          <p className="note note--ok">
            {t('roundup.collected', { amount: money(result.roundUpTotalMinor) })}
          </p>
        )}
      </section>

      {/* --- send it round ------------------------------------------------ */}
      <section className="card">
        <div className="share-actions">
          <a
            className="btn btn--primary"
            href={whatsappUrl(summaryText)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('summary.whatsapp')}
          </a>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => {
              setCopyState((await copyText(summaryText)) ? 'ok' : 'fail')
              setTimeout(() => setCopyState('idle'), 2500)
            }}
          >
            {copyState === 'ok' ? t('summary.copied') : t('summary.copy')}
          </button>
        </div>
        {copyState === 'fail' && <p className="note note--bad">{t('summary.copyFailed')}</p>}

        {bill.published && (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => dispatch({ type: 'setLocked', locked: !bill.locked })}
            >
              {bill.locked ? `🔓 ${t('summary.unlock')}` : `🔒 ${t('summary.lock')}`}
            </button>
            {bill.locked && <p className="field__hint">{t('summary.lockedNote')}</p>}
          </>
        )}
      </section>

      <div className="screen__footer">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            if (confirm(t('actions.newBillConfirm'))) dispatch({ type: 'resetBill' })
          }}
        >
          {t('actions.newBill')}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--danger"
          onClick={() => {
            if (confirm(t('actions.newGatheringConfirm'))) dispatch({ type: 'reset' })
          }}
        >
          {t('actions.newGathering')}
        </button>
      </div>
    </div>
  )
}
