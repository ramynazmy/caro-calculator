/** Add-or-edit form for a single bill item. Used inline in the item list. */
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { BillItem } from '../types'
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

export function ItemForm({ currency, initial, onSubmit, onCancel }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [priceMinor, setPriceMinor] = useState<number | null>(initial?.unitPriceMinor ?? null)
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1)
  const [shared, setShared] = useState(initial?.shared ?? false)

  const isValid = name.trim().length > 0 && priceMinor !== null && priceMinor >= 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValid) return
    onSubmit({ name: name.trim(), unitPriceMinor: priceMinor!, quantity, shared })
    if (!initial) {
      // Adding: clear the form so the next receipt line can be typed straight
      // away, but keep the currency/quantity habits sensible.
      setName('')
      setPriceMinor(null)
      setQuantity(1)
      setShared(false)
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

      <div className="item-form__row">
        <div className="field">
          <label className="field__label" htmlFor="item-price">
            {t('items.unitPrice')}
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

      <label className="check">
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        <span>
          <span className="check__title">{t('items.shared')}</span>
          <span className="check__hint">{t('items.sharedHint')}</span>
        </span>
      </label>

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
