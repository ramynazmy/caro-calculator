import { useState } from 'react'
import { useI18n } from './i18n'
import { useBill } from './state/BillContext'
import { useRoute } from './router'
import { BillEntry } from './screens/BillEntry'
import { Participants } from './screens/Participants'
import { Assign } from './screens/Assign'
import { Summary } from './screens/Summary'
import { ParticipantClaim } from './screens/ParticipantClaim'
import { totalHeadcount } from './lib/calc'
import { GirlLogo } from './components/GirlLogo'
import { InstallButton } from './components/InstallButton'

type Tab = 'bill' | 'people' | 'assign' | 'summary'

export default function App() {
  const route = useRoute()

  // A shared link opens a completely separate screen with its own state — a
  // participant must never see or touch the organizer's local bill.
  if (route.name === 'claim') return <ParticipantClaim billId={route.billId} />

  return <OrganizerApp />
}

function OrganizerApp() {
  const { t, toggleLang } = useI18n()
  const { bill } = useBill()
  const [tab, setTab] = useState<Tab>('bill')

  const headcount = totalHeadcount(bill)
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'bill', label: t('nav.bill'), count: bill.items.length },
    { id: 'people', label: t('nav.people'), count: headcount },
    { id: 'assign', label: t('nav.assign') },
    { id: 'summary', label: t('nav.summary') },
  ]

  return (
    <div className="app">
      <header className="appbar">
        <GirlLogo className="appbar__logo" />
        <div className="appbar__titles">
          <h1 className="appbar__title">{t('app.title')}</h1>
          <p className="appbar__tagline">{t('app.tagline')}</p>
        </div>
        <InstallButton />
        <button type="button" className="btn btn--ghost btn--small" onClick={toggleLang}>
          {t('lang.switch')}
        </button>
      </header>

      <nav className="tabs" aria-label={t('app.title')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tabs__btn ${tab === item.id ? 'is-active' : ''}`}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.count ? <span className="tabs__count">{item.count}</span> : null}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === 'bill' && <BillEntry />}
        {tab === 'people' && <Participants />}
        {tab === 'assign' && <Assign />}
        {tab === 'summary' && <Summary />}
      </main>
    </div>
  )
}
