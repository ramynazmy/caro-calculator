/** The running list of entered items, with inline edit and delete. */
import { useState } from 'react'
import type { BillItem } from '../types'
import { formatMoney } from '../lib/money'
import { useI18n } from '../i18n'
import { ItemForm } from './ItemForm'
import type { ItemDraft } from './ItemForm'

interface Props {
  items: BillItem[]
  currency: string
  onUpdate: (id: string, patch: ItemDraft) => void
  onDelete: (id: string) => void
}

export function ItemList({ items, currency, onUpdate, onDelete }: Props) {
  const { t, lang } = useI18n()
  const [editingId, setEditingId] = useState<string | null>(null)

  if (items.length === 0) {
    return <p className="empty">{t('items.empty')}</p>
  }

  return (
    <ul className="item-list">
      {items.map((item) =>
        editingId === item.id ? (
          <li key={item.id} className="item-list__editing">
            <ItemForm
              currency={currency}
              initial={item}
              onCancel={() => setEditingId(null)}
              onSubmit={(draft) => {
                onUpdate(item.id, draft)
                setEditingId(null)
              }}
            />
          </li>
        ) : (
          <li key={item.id} className="item">
            <div className="item__main">
              <div className="item__name">
                {item.name}
                {item.shared && <span className="badge">{t('items.sharedBadge')}</span>}
              </div>
              <div className="item__meta">
                {item.quantity} × {formatMoney(item.unitPriceMinor, currency, lang)}{' '}
                {t('items.each')}
              </div>
            </div>

            <div className="item__side">
              <div className="item__total">
                {formatMoney(item.unitPriceMinor * item.quantity, currency, lang)}
              </div>
              <div className="item__actions">
                <button
                  type="button"
                  className="btn btn--tiny"
                  onClick={() => setEditingId(item.id)}
                >
                  {t('items.edit')}
                </button>
                <button
                  type="button"
                  className="btn btn--tiny btn--danger"
                  onClick={() => {
                    if (confirm(t('items.deleteConfirm', { name: item.name }))) onDelete(item.id)
                  }}
                >
                  {t('items.delete')}
                </button>
              </div>
            </div>
          </li>
        ),
      )}
    </ul>
  )
}
