import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrefsProvider } from './lib/prefs'
import { ErrorBoundary, UpdateToast } from './components/Safety'
import { stopInputZoomOnIOS, watchKeyboard } from './lib/mobile'

stopInputZoomOnIOS()
// Remember that this browser uses the app, so the welcome page sends it straight here next time.
try { localStorage.setItem('folio.app', '1') } catch { /* private mode */ }
watchKeyboard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <ErrorBoundary area="app">
        <App />
      </ErrorBoundary>
      <UpdateToast />
    </PrefsProvider>
  </StrictMode>,
)
