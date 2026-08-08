/** Phase 2 — who is paying, and how many people each of them covers. */
import { useMemo } from 'react'
import { useBill } from '../state/BillContext'
import { shareDivisor, sharedItemsTotalMinor, totalHeadcount } from '../lib/calc'
import { formatMoney } from '../lib/money'
import { useI18n } from '../i18n'
import { ParticipantForm } from '../components/ParticipantForm'
import { ParticipantList } from '../components/ParticipantList'

export function Participants() {
  const { bill, dispatch } = useBill()
  const { t, lang } = useI18n()

  const headcount = useMemo(() => totalHeadcount(bill), [bill])
  const sharedTotal = useMemo(() => sharedItemsTotalMinor(bill), [bill])
  const divisor = shareDivisor(bill)
  const hasPeople = bill.participants.length > 0

  return (
    <div className="screen">
      <section className="card">
        <div className="card__header">
          <h2 className="card__title">{t('people.heading')}</h2>
          {hasPeople && (
            <span className="card__count">
              {t('people.entries', { n: bill.participants.length })} ·{' '}
              {t('people.people', { n: headcount })}
            </span>
          )}
        </div>

        <ParticipantForm
          existing={bill.participants}
          onSubmit={(participant) => dispatch({ type: 'addParticipant', participant })}
        />

        <ParticipantList
          participants={bill.participants}
          organizerId={bill.organizerId}
          onUpdate={(id, patch) => dispatch({ type: 'updateParticipant', id, patch })}
          onDelete={(id) => dispatch({ type: 'deleteParticipant', id })}
          onSetOrganizer={(id) => dispatch({ type: 'setOrganizer', id })}
        />

        {hasPeople && (
          <>
            <p className="field__hint">⭐ {t('people.organizerHint')}</p>
            <p className="field__hint">🎂 {t('people.treatedHint')}</p>
          </>
        )}
      </section>

      {/* ---- How shared costs get divided --------------------------------- */}
      <section className="card">
        <h2 className="card__title">{t('split.heading')}</h2>

        <div className="segmented segmented--full" role="group" aria-label={t('split.heading')}>
          <button
            type="button"
            className={`segmented__btn ${bill.splitBasis === 'perPerson' ? 'is-active' : ''}`}
            aria-pressed={bill.splitBasis === 'perPerson'}
            onClick={() => dispatch({ type: 'setSplitBasis', basis: 'perPerson' })}
          >
            {t('split.perPerson')}
          </button>
          <button
            type="button"
            className={`segmented__btn ${bill.splitBasis === 'perEntry' ? 'is-active' : ''}`}
            aria-pressed={bill.splitBasis === 'perEntry'}
            onClick={() => dispatch({ type: 'setSplitBasis', basis: 'perEntry' })}
          >
            {t('split.perEntry')}
          </button>
        </div>

        <p className="field__hint">
          {!hasPeople
            ? t('split.needPeople')
            : bill.splitBasis === 'perPerson'
              ? t('split.perPersonHint', { n: headcount })
              : t('split.perEntryHint', { n: bill.participants.length })}
        </p>

        {/* Concrete money beats an abstract rule — show what the setting does
            to the shared items actually on this bill. */}
        {hasPeople && sharedTotal > 0 && (
          <p className="field__hint">
            {t('split.example', {
              amount: formatMoney(sharedTotal, bill.currency, lang),
              share: formatMoney(Math.round(sharedTotal / divisor), bill.currency, lang),
            })}
          </p>
        )}
      </section>

      <div className="screen__footer">
        <p className="muted">{t('phase.savedLocally')}</p>
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
