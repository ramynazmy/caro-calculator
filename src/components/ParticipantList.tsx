/**
 * The roll-call. Party size is edited in place with the stepper — it is a
 * safe, reversible control, so there is no reason to hide it behind an "edit"
 * mode. Only the name needs a deliberate edit step.
 */
import { useState } from 'react'
import type { Participant } from '../types'
import { QuantityStepper } from './QuantityStepper'
import { useI18n } from '../i18n'
import { normaliseName } from './ParticipantForm'

interface Props {
  participants: Participant[]
  organizerId: string | null
  onUpdate: (id: string, patch: Partial<Omit<Participant, 'id'>>) => void
  onDelete: (id: string) => void
  onSetOrganizer: (id: string) => void
}

export function ParticipantList({
  participants,
  organizerId,
  onUpdate,
  onDelete,
  onSetOrganizer,
}: Props) {
  const { t } = useI18n()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  if (participants.length === 0) {
    return <p className="empty">{t('people.empty')}</p>
  }

  function commitName(id: string) {
    const trimmed = draftName.trim()
    const clashes = participants.some(
      (p) => p.id !== id && normaliseName(p.name) === normaliseName(trimmed),
    )
    if (trimmed.length > 0 && !clashes) onUpdate(id, { name: trimmed })
    setEditingId(null)
  }

  return (
    <ul className="item-list">
      {participants.map((person) => {
        const isOrganizer = person.id === organizerId
        return (
          <li key={person.id} className="person">
            <div className="person__top">
              {editingId === person.id ? (
                <input
                  className="input person__name-input"
                  type="text"
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => commitName(person.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitName(person.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <div className="person__name">
                  {person.name}
                  {isOrganizer && <span className="badge">⭐ {t('people.organizer')}</span>}
                </div>
              )}

              <div className="item__actions">
                {editingId !== person.id && (
                  <button
                    type="button"
                    className="btn btn--tiny"
                    onClick={() => {
                      setDraftName(person.name)
                      setEditingId(person.id)
                    }}
                  >
                    {t('items.edit')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--tiny btn--danger"
                  onClick={() => {
                    if (confirm(t('people.deleteConfirm', { name: person.name })))
                      onDelete(person.id)
                  }}
                >
                  {t('items.delete')}
                </button>
              </div>
            </div>

            <div className="person__bottom">
              <div className="person__party">
                <QuantityStepper
                  value={person.partySize}
                  onChange={(partySize) => onUpdate(person.id, { partySize })}
                  ariaLabel={`${t('people.partySize')} — ${person.name}`}
                />
                <span className="person__party-label">
                  {person.partySize === 1
                    ? t('people.alone')
                    : t('people.personCount', { n: person.partySize })}
                </span>
              </div>

              {!isOrganizer && (
                <button
                  type="button"
                  className="btn btn--tiny"
                  onClick={() => onSetOrganizer(person.id)}
                >
                  {t('people.makeOrganizer')}
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
