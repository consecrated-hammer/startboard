import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, LogOut, Settings as SettingsIcon, Shield } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAppState } from '../../context/AppStateContext.jsx'

const THEMES = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

// Avatar button + popover consolidating Account/Settings, theme, and sign out.
export default function UserMenu() {
  const { user, logout } = useAuth()
  const { theme, updateTheme } = useAppState()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey) }
  }, [open])

  const initial = (user?.display_name || user?.username || '?').trim().charAt(0).toUpperCase()

  const go = (path) => { setOpen(false); navigate(path) }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white outline-none ring-offset-2 ring-offset-slate-900 transition hover:ring-2 hover:ring-white/30 focus-visible:ring-2 focus-visible:ring-accent ${
          user?.icon_url ? 'bg-white/10' : 'bg-accent hover:bg-accent-dark'
        }`}
        title="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user?.icon_url ? (
          <img src={user.icon_url} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-slate-800 shadow-2xl"
        >
          <div className="border-b border-white/10 px-4 py-3">
            <div className="truncate text-sm font-medium text-white">{user?.display_name || user?.username}</div>
            <div className="truncate text-xs text-slate-400">@{user?.username} · {user?.role}</div>
          </div>

          <button
            role="menuitem"
            onClick={() => go('/preferences')}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 cursor-pointer text-sm text-slate-200 hover:bg-white/5"
          >
            <SettingsIcon className="h-4 w-4" />
            <span>Preferences</span>
          </button>
          {user?.role === 'admin' && (
            <>
              <button
                role="menuitem"
                onClick={() => go('/analytics')}
                className="flex w-full items-center gap-2.5 border-t border-white/10 px-4 py-2.5 cursor-pointer text-sm text-slate-200 hover:bg-white/5"
              >
                <BarChart3 className="h-4 w-4" />
                <span>Analytics</span>
              </button>
              <button
                role="menuitem"
                onClick={() => go('/settings/admin')}
                className="flex w-full items-center gap-2.5 border-t border-white/10 px-4 py-2.5 cursor-pointer text-sm text-slate-200 hover:bg-white/5"
              >
                <Shield className="h-4 w-4" />
                <span>Administration</span>
              </button>
            </>
          )}

          <div className="border-t border-white/10 px-4 py-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Theme</div>
            <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => updateTheme(t.value)}
                  className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs transition ${
                    theme === t.value ? 'bg-accent text-white' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button
            role="menuitem"
            onClick={async () => { setOpen(false); await logout(); navigate('/login') }}
            className="flex w-full items-center gap-2.5 border-t border-white/10 px-4 py-2.5 cursor-pointer text-sm text-slate-200 hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  )
}
