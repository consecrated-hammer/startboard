import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import Spinner from '../components/Spinner.jsx'

// App-wide auto-save indicator. Any page that saves in the background can call
// `useSaveToast()` and report status; a single toast renders at the app root so
// it's visible regardless of scroll position and never blocks the content.
const SaveToastContext = createContext(null)

export function SaveToastProvider({ children }) {
  const [state, setState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [savedVisible, setSavedVisible] = useState(false)

  const saving = useCallback(() => setState('saving'), [])
  const saved = useCallback(() => setState('saved'), [])
  const failed = useCallback(() => setState('error'), [])

  // The "Saved" confirmation lingers briefly, then fades itself out. State is
  // only set from async callbacks so we never setState synchronously in render.
  useEffect(() => {
    if (state !== 'saved') return undefined
    const show = requestAnimationFrame(() => setSavedVisible(true))
    const hide = setTimeout(() => setSavedVisible(false), 1600)
    return () => {
      cancelAnimationFrame(show)
      clearTimeout(hide)
    }
  }, [state])

  const api = useMemo(() => ({ saving, saved, failed }), [saving, saved, failed])
  const visible = state === 'saving' || state === 'error' || savedVisible

  return (
    <SaveToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className={`pointer-events-none fixed bottom-6 right-6 z-100 transition-all duration-200 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/90 px-4 py-2 text-sm text-slate-100 shadow-2xl backdrop-blur">
          {state === 'error' ? (
            <span className="text-red-400">Couldn’t save — retrying on next change</span>
          ) : state === 'saving' ? (
            <>
              <Spinner className="h-4 w-4" />
              <span className="text-slate-300">Saving…</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Saved</span>
            </>
          )}
        </div>
      </div>
    </SaveToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSaveToast() {
  const ctx = useContext(SaveToastContext)
  if (!ctx) throw new Error('useSaveToast must be used within a SaveToastProvider')
  return ctx
}
