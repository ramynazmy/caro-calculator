/** Add-or-edit form for a single bill item. Used inline in the item list. */
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { BillItem, PriceMode } from '../types'
import { MoneyInput } from './MoneyInput'
import { QuantityStepper } from './QuantityStepper'
import { useI18n } from '../i18n'

export type ItemDraft = Omit<BillItem, 'id'>

interface Props {
  currency: string
  /** When present the form is editing that item instead of adding a new one. */
  initial?: BillItem
  onSubmit: (draft: ItemDraft) => void
  onCancel?: () => void
}

/**
 * This form is only about what the receipt says: what it is, what it cost,
 * how many. **How the cost gets divided is decided on the Assign tab**, not
 * here — a new item is simply claimable until someone says otherwise.
 */
export function ItemForm({ currency, initial, onSubmit, onCancel }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [priceMinor, setPriceMinor] = useState<number | null>(initial?.priceMinor ?? null)
  const [priceMode, setPriceMode] = useState<PriceMode>(initial?.priceMode ?? 'unit')
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1)

  const isValid = name.trim().length > 0 && priceMinor !== null && priceMinor >= 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValid) return
    onSubmit({
      name: name.trim(),
      priceMinor: priceMinor!,
      priceMode,
      quantity,
      // Editing must not silently undo a division set on the Assign tab.
      shared: initial?.shared ?? false,
      sharedWith: initial?.sharedWith ?? null,
    })
    if (!initial) {
      // Adding: clear the form so the next receipt line can be typed straight
      // away. The price mode is kept — receipts are consistent within
      // themselves, so the next line almost certainly reads the same way.
      setName('')
      setPriceMinor(null)
      setQuantity(1)
    }
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
