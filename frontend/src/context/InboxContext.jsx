import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { MailPlus } from 'lucide-react'
import { useAuth } from './AuthContext.jsx'
import { inboxAPI } from '../services/api.js'

const InboxContext = createContext(null)

export function InboxProvider({ children }) {
  const { user } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)
  const [toastVisible, setToastVisible] = useState(false)
  const prevCountRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!user || user.status !== 'active') {
      setPendingCount(0)
      prevCountRef.current = 0
      return { pending_count: 0 }
    }
    const next = await inboxAPI.summary()
    setPendingCount(next.pending_count || 0)
    if ((next.pending_count || 0) > prevCountRef.current && prevCountRef.current > 0) {
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 3000)
    }
    prevCountRef.current = next.pending_count || 0
    return next
  }, [user])

  useEffect(() => {
    // Initial/polling inbox summary bootstrap; async state updates happen inside refresh().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => {})
    if (!user || user.status !== 'active') return undefined
    const timer = window.setInterval(() => {
      refresh().catch(() => {})
    }, 30000)
    return () => window.clearInterval(timer)
  }, [refresh, user])

  const value = useMemo(() => ({ pendingCount, refresh }), [pendingCount, refresh])

  return (
    <InboxContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className={`pointer-events-none fixed bottom-24 right-6 z-100 transition-all duration-200 ${
          toastVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/90 px-4 py-2 text-sm text-slate-100 shadow-2xl backdrop-blur">
          <MailPlus className="h-4 w-4 text-accent" />
          <span>New share request received</span>
        </div>
      </div>
    </InboxContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useInbox() {
  const ctx = useContext(InboxContext)
  if (!ctx) throw new Error('useInbox must be used within InboxProvider')
  return ctx
}
