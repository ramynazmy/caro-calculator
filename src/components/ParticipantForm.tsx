/** Add one participant: a name and how many people that name is paying for. */
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Participant } from '../types'
import { QuantityStepper } from './QuantityStepper'
import { useI18n } from '../i18n'

interface Props {
  existing: Participant[]
  onSubmit: (draft: Omit<Participant, 'id'>) => void
}

/** Names are compared loosely so "Caro" and " caro " count as the same person. */
export function normaliseName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

export function ParticipantForm({ existing, onSubmit }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [partySize, setPartySize] = useState(1)

  const trimmed = name.trim()
  // Two people called exactly "Caro" would be indistinguishable in Phase 3,
  // where participants pick themselves off a list. Better to catch it here.
  const isDuplicate =
    trimmed.length > 0 &&
    existing.some((p) => normaliseName(p.name) === normaliseName(trimmed))
  const isValid = trimmed.length > 0 && !isDuplicate

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValid) return
    onSubmit({ name: trimmed, partySize, treated: false })
    setName('')
    setPartySize(1)
  }

  return (
    <form className="item-form" onSubmit={handleSubmit}>
      <div className="field">
        <label className="field__label" htmlFor="person-name">
          {t('people.name')}
        </label>
        <input
          id="person-name"
          className="input"
          type="text"
          autoComplete="off"
          placeholder={t('people.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {isDuplicate && <p className="field__error">{t('people.duplicate')}</p>}
      </div>

      <div className="field">
        <span className="field__label">{t('people.partySize')}</span>
        <div className="party-row">
          <QuantityStepper
            value={partySize}
            onChange={setPartySize}
            ariaLabel={t('people.partySize')}
          />
          <p className="field__hint">{t('people.partySizeHint')}</p>
        </div>
      </div>

      <div className="item-form__actions">
        <button type="submit" className="btn btn--primary" disabled={!isValid}>
          {t('people.add')}
        </button>
      </div>
    </form>
  )
}
