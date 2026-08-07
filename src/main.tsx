import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './i18n'
import { BillProvider } from './state/BillContext'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BillProvider>
        <App />
      </BillProvider>
    </I18nProvider>
  </StrictMode>,
)
