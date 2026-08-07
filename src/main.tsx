import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './i18n'
import { BillProvider } from './state/BillContext'
import './styles.css'

// Register the service worker: makes the app installable, and lets it open
// with no signal. Production only — in dev it would serve stale modules and
// fight Vite's hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Not fatal: the app works fine without it, just not offline.
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BillProvider>
        <App />
      </BillProvider>
    </I18nProvider>
  </StrictMode>,
)
