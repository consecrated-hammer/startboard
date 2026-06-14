import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { AppStateProvider } from './context/AppStateContext.jsx'
import { InboxProvider } from './context/InboxContext.jsx'
import { SaveToastProvider } from './context/SaveToastContext.jsx'
import './styles/index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SaveToastProvider>
            <InboxProvider>
              <AppStateProvider>
                <App />
              </AppStateProvider>
            </InboxProvider>
          </SaveToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // When a new build's worker finishes installing while an old one still
      // controls the page, reload so open tabs pick up the fresh bundle instead
      // of running stale cached JS. (No reload on first install — controller is
      // null then — so this won't loop.)
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            window.location.reload()
          }
        })
      })
    }).catch(() => {
      // Offline shell is best-effort; ignore registration failures.
    })
  })
}
