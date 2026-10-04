import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrefsProvider } from './lib/prefs'
import { ErrorBoundary, UpdateToast } from './components/Safety'
import { stopInputZoomOnIOS, watchKeyboard } from './lib/mobile'

stopInputZoomOnIOS()
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
