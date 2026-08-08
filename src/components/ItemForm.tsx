/** Add-or-edit form for a single bill item. Used inline in the item list. */
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { BillItem, Participant, PriceMode } from '../types'
import { MoneyInput } from './MoneyInput'
import { QuantityStepper } from './QuantityStepper'
import { useI18n } from '../i18n'

export type ItemDraft = Omit<BillItem, 'id'>

/** How the item's cost is divided. Flattened from `shared` + `sharedWith`. */
type Sharing = 'claim' | 'everyone' | 'group'

interface Props {
  currency: string
  /** Needed to offer "split between these people". */
  participants: Participant[]
  /** When present the form is editing that item instead of adding a new one. */
  initial?: BillItem
  onSubmit: (draft: ItemDraft) => void
  onCancel?: () => void
}

function initialSharing(item?: BillItem): Sharing {
  if (!item?.shared) return 'claim'
  return item.sharedWith && item.sharedWith.length > 0 ? 'group' : 'everyone'
}

export function ItemForm({ currency, participants, initial, onSubmit, onCancel }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [priceMinor, setPriceMinor] = useState<number | null>(initial?.priceMinor ?? null)
  const [priceMode, setPriceMode] = useState<PriceMode>(initial?.priceMode ?? 'unit')
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1)
  const [sharing, setSharing] = useState<Sharing>(() => initialSharing(initial))
  const [groupIds, setGroupIds] = useState<string[]>(initial?.sharedWith ?? [])

  const isValid =
    name.trim().length > 0 &&
    priceMinor !== null &&
    priceMinor >= 0 &&
    // "Split between these people" with nobody picked would silently become
    // "everyone", which is not what was asked for.
    (sharing !== 'group' || groupIds.length > 0)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValid) return
    onSubmit({
      name: name.trim(),
      priceMinor: priceMinor!,
      priceMode,
      quantity,
      shared: sharing !== 'claim',
      sharedWith: sharing === 'group' ? groupIds : null,
    })
    if (!initial) {
      // Adding: clear the form so the next receipt line can be typed straight
      // away. The price mode is kept — receipts are consistent within
      // themselves, so the next line almost certainly reads the same way.
      setName('')
      setPriceMinor(null)
      setQuantity(1)
      setSharing('claim')
      setGroupIds([])
    }
  }

  function toggleMember(id: string) {
    setGroupIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  }

  return (
    <form className="item-form" onSubmit={handleSubmit}>
      <div className="field">
        <label className="field__label" htmlFor="item-name">
          {t('items.name')}
        </label>
        <input
          id="item-name"
          className="input"
          type="text"
          autoComplete="off"
          placeholder={t('items.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Receipts print either the price of one, or the total for the line.
          We store whichever was typed rather than converting — dividing
          100.00 by 3 loses a piastre and would break the receipt check. */}
      <div className="segmented segmented--full" role="group" aria-label={t('items.priceMode')}>
        <button
          type="button"
          className={`segmented__btn ${priceMode === 'unit' ? 'is-active' : ''}`}
          aria-pressed={priceMode === 'unit'}
          onClick={() => setPriceMode('unit')}
        >
          {t('items.priceUnit')}
        </button>
        <button
          type="button"
          className={`segmented__btn ${priceMode === 'line' ? 'is-active' : ''}`}
          aria-pressed={priceMode === 'line'}
          onClick={() => setPriceMode('line')}
        >
          {t('items.priceLine')}
        </button>
      </div>

      <div className="item-form__row">
        <div className="field">
          <label className="field__label" htmlFor="item-price">
            {priceMode === 'unit' ? t('items.unitPrice') : t('items.lineTotal')}
          </label>
          <MoneyInput
            id="item-price"
            currency={currency}
            valueMinor={priceMinor}
            onChange={setPriceMinor}
          />
        </div>

        <div className="field">
          <span className="field__label">{t('items.qty')}</span>
          <QuantityStepper value={quantity} onChange={setQuantity} ariaLabel={t('items.qty')} />
        </div>
      </div>

      {/* --- how it gets divided ---------------------------------------- */}
      <div className="field">
        <span className="field__label">{t('items.sharingLabel')}</span>
        <div className="segmented segmented--full" role="group" aria-label={t('items.sharingLabel')}>
          <button
            type="button"
            className={`segmented__btn ${sharing === 'claim' ? 'is-active' : ''}`}
            aria-pressed={sharing === 'claim'}
            onClick={() => setSharing('claim')}
          >
            {t('items.sharingClaim')}
          </button>
          <button
            type="button"
            className={`segmented__btn ${sharing === 'everyone' ? 'is-active' : ''}`}
            aria-pressed={sharing === 'everyone'}
            onClick={() => setSharing('everyone')}
          >
            {t('items.sharingEveryone')}
          </button>
          <button
            type="button"
            className={`segmented__btn ${sharing === 'group' ? 'is-active' : ''}`}
            aria-pressed={sharing === 'group'}
            disabled={participants.length === 0}
            onClick={() => setSharing('group')}
          >
            {t('items.sharingGroup')}
          </button>
        </div>
        <p className="field__hint">
          {sharing === 'claim'
            ? t('items.sharingClaimHint')
            : sharing === 'everyone'
              ? t('items.sharingEveryoneHint')
              : t('items.sharingGroupHint')}
        </p>
      </div>

      {sharing === 'group' && (
        <div className="field">
          {participants.length === 0 ? (
            <p className="field__error">{t('items.sharingNeedPeople')}</p>
          ) : (
            <>
              <div className="pill-picker">
                {participants.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className={`pill ${groupIds.includes(person.id) ? 'is-on' : ''}`}
                    aria-pressed={groupIds.includes(person.id)}
                    onClick={() => toggleMember(person.id)}
                  >
                    {person.name}
                  </button>
                ))}
              </div>
              {groupIds.length === 0 && (
                <p className="field__error">{t('items.sharingPickSomeone')}</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="item-form__actions">
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {t('items.cancel')}
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={!isValid}>
          {initial ? t('items.save') : t('items.add')}
        </button>
      </div>
    </form>
  )
}
